import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import {
  processarDieta,
  baixarTextoPDF,
  extrairHorariosDieta,
  salvarHorariosDieta,
} from '../services/rag';
import { enviarBoasVindas } from '../services/agent';

export const pacientesRouter = Router();

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Apenas PDF permitido'));
      return;
    }
    cb(null, true);
  },
});

function requirePanelKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-api-key'] !== env.PANEL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

pacientesRouter.use(requirePanelKey);

pacientesRouter.post('/', upload.single('dieta'), async (req: Request, res: Response) => {
  const { nome, whatsapp, plano, data_expiracao } = req.body as {
    nome: string;
    whatsapp: string;
    plano: string;
    data_expiracao: string;
  };

  if (!req.file) {
    res.status(400).json({ error: 'PDF da dieta obrigatorio' });
    return;
  }
  if (!nome || !whatsapp || !plano || !data_expiracao) {
    res.status(400).json({ error: 'Campos obrigatorios ausentes: nome, whatsapp, plano, data_expiracao' });
    return;
  }

  // WhatsApp BR canonico: 55 + DDD(2) + 9 + 8 digitos = 13 digitos.
  // Aceita tambem 12 (sem o 9) para compatibilidade com numeros antigos.
  if (!/^55[1-9][1-9]9?\d{8}$/.test(whatsapp)) {
    res.status(400).json({
      error: 'WhatsApp em formato invalido. Use 55 + DDD + 9 + 8 digitos (ex.: 5562995514963).',
    });
    return;
  }

  const { data: paciente, error: pacienteErr } = await supabase
    .from('pacientes')
    .insert({ nome, whatsapp, plano, data_expiracao, ativo: true })
    .select('id')
    .single();

  if (pacienteErr || !paciente) {
    console.error('[pacientes] Erro ao inserir paciente:', pacienteErr?.message);
    res.status(500).json({ error: pacienteErr?.message ?? 'Erro ao salvar paciente' });
    return;
  }

  const storagePath = `${paciente.id}/${Date.now()}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from('dietas')
    .upload(storagePath, req.file.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadErr) {
    console.error('[pacientes] Erro ao fazer upload do PDF:', uploadErr.message);
    res.status(500).json({ error: uploadErr.message });
    return;
  }

  const pdfUrl = `${env.SUPABASE_URL}/storage/v1/object/dietas/${storagePath}`;

  const { data: dieta, error: dietaErr } = await supabase
    .from('dietas')
    .insert({ paciente_id: paciente.id, pdf_url: pdfUrl, status: 'ativa' })
    .select('id')
    .single();

  if (dietaErr || !dieta) {
    console.error('[pacientes] Erro ao inserir dieta:', dietaErr?.message);
    res.status(500).json({ error: dietaErr?.message ?? 'Erro ao salvar dieta' });
    return;
  }

  // P1-6: extrair horarios literais do PDF ANTES da entrevista comecar.
  // Faz uma so descida do PDF (baixarTextoPDF) e usa pra dois fluxos:
  //  - extrairHorariosDieta (sincrono, ~2s) → guarda em dietas.horarios_refeicoes
  //  - processarDieta (em background) → chunking + embeddings RAG
  // Falha nao bloqueia o cadastro: paciente ainda recebe boas-vindas e cai na
  // pergunta aberta da etapa 14 como antes.
  let textoPDF: string | null = null;
  try {
    textoPDF = await baixarTextoPDF(pdfUrl);
    const horarios = await extrairHorariosDieta(textoPDF);
    await salvarHorariosDieta(dieta.id, horarios);
  } catch (err) {
    console.error('[pacientes] Falha na extracao de horarios do PDF (nao critico):', err);
  }

  await enviarBoasVindas(paciente.id).catch((err) => {
    console.error('[pacientes] Falha ao enviar boas-vindas (nao critico):', err);
  });

  res.status(201).json({ sucesso: true, paciente_id: paciente.id });

  processarDieta(paciente.id, dieta.id, pdfUrl, textoPDF ?? undefined).catch((err) => {
    console.error('[pacientes] Falha no processamento RAG (background):', err);
  });
});

pacientesRouter.get('/', async (_req: Request, res: Response) => {
  const { data: pacientes, error } = await supabase
    .from('pacientes')
    .select('id, nome, whatsapp, plano, data_expiracao, ativo, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[pacientes] Erro ao listar pacientes:', error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  const hoje = new Date();
  const tresD = new Date(hoje);
  tresD.setDate(tresD.getDate() + 3);

  function calcularStatus(p: { ativo: boolean; data_expiracao: string }): 'ativo' | 'expirando' | 'expirado' {
    if (!p.ativo) return 'expirado';
    const exp = new Date(p.data_expiracao);
    if (exp < hoje) return 'expirado';
    if (exp <= tresD) return 'expirando';
    return 'ativo';
  }

  type RagStatus = 'indexado' | 'processando' | 'falhou' | 'sem_dieta';
  const ragStatusPorPaciente = new Map<string, RagStatus>();
  const pacienteIds = (pacientes ?? []).map((p) => p.id);

  if (pacienteIds.length > 0) {
    const { data: dietasAtivas, error: dietasErr } = await supabase
      .from('dietas')
      .select('paciente_id, processamento_status')
      .eq('status', 'ativa')
      .in('paciente_id', pacienteIds);

    if (dietasErr) {
      console.error('[pacientes] Erro ao buscar dietas para status RAG:', dietasErr.message);
    } else {
      for (const d of dietasAtivas ?? []) {
        ragStatusPorPaciente.set(d.paciente_id, d.processamento_status as RagStatus);
      }
    }
  }

  const lista = (pacientes ?? []).map((p) => ({
    ...p,
    status: calcularStatus(p),
    rag_status: ragStatusPorPaciente.get(p.id) ?? 'sem_dieta',
  }));

  res.json(lista);
});

pacientesRouter.patch('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { ativo, data_expiracao } = req.body as { ativo?: boolean; data_expiracao?: string };

  if (ativo === undefined && !data_expiracao) {
    res.status(400).json({ error: 'Ao menos um campo obrigatorio: ativo ou data_expiracao' });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (ativo !== undefined) updates.ativo = ativo;
  if (data_expiracao) updates.data_expiracao = data_expiracao;

  const { error } = await supabase.from('pacientes').update(updates).eq('id', id);

  if (error) {
    console.error('[pacientes] Erro ao atualizar paciente:', error.message);
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ sucesso: true });
});

pacientesRouter.get('/:id/dieta', async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: dieta, error } = await supabase
    .from('dietas')
    .select('id, pdf_url, status, created_at')
    .eq('paciente_id', id)
    .eq('status', 'ativa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[pacientes] Erro ao buscar dieta ativa:', error.message);
    res.status(500).json({ error: error.message });
    return;
  }
  if (!dieta) {
    res.status(404).json({ error: 'Nenhuma dieta ativa para este paciente' });
    return;
  }

  const STORAGE_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/dietas/`;
  if (!dieta.pdf_url.startsWith(STORAGE_PREFIX)) {
    res.status(500).json({ error: 'URL da dieta em formato inesperado' });
    return;
  }
  const path = dieta.pdf_url.slice(STORAGE_PREFIX.length);

  const { data: signed, error: signErr } = await supabase.storage
    .from('dietas')
    .createSignedUrl(path, 3600);

  if (signErr || !signed) {
    console.error('[pacientes] Erro ao gerar signed URL:', signErr?.message);
    res.status(500).json({ error: signErr?.message ?? 'Falha ao gerar URL temporaria' });
    return;
  }

  res.json({
    dieta_id: dieta.id,
    status: dieta.status,
    created_at: dieta.created_at,
    signed_url: signed.signedUrl,
  });
});

pacientesRouter.post('/:id/dieta', upload.single('dieta'), async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!req.file) {
    res.status(400).json({ error: 'PDF da dieta obrigatorio' });
    return;
  }

  const { data: paciente, error: pacienteErr } = await supabase
    .from('pacientes')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (pacienteErr) {
    console.error('[pacientes] Erro ao buscar paciente:', pacienteErr.message);
    res.status(500).json({ error: pacienteErr.message });
    return;
  }
  if (!paciente) {
    res.status(404).json({ error: 'Paciente nao encontrado' });
    return;
  }

  const { data: dietaAtiva } = await supabase
    .from('dietas')
    .select('id, pdf_url')
    .eq('paciente_id', id)
    .eq('status', 'ativa')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const STORAGE_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/dietas/`;
  const storagePath = `${id}/${Date.now()}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from('dietas')
    .upload(storagePath, req.file.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadErr) {
    console.error('[pacientes] Erro ao fazer upload do novo PDF:', uploadErr.message);
    res.status(500).json({ error: uploadErr.message });
    return;
  }

  const novoPdfUrl = `${env.SUPABASE_URL}/storage/v1/object/dietas/${storagePath}`;

  let dietaId: string;
  if (dietaAtiva) {
    const { error: updErr } = await supabase
      .from('dietas')
      .update({ pdf_url: novoPdfUrl, processamento_status: 'processando' })
      .eq('id', dietaAtiva.id);
    if (updErr) {
      console.error('[pacientes] Erro ao atualizar dieta:', updErr.message);
      res.status(500).json({ error: updErr.message });
      return;
    }
    dietaId = dietaAtiva.id;

    if (dietaAtiva.pdf_url.startsWith(STORAGE_PREFIX)) {
      const pathAntigo = dietaAtiva.pdf_url.slice(STORAGE_PREFIX.length);
      await supabase.storage.from('dietas').remove([pathAntigo]).catch((err) => {
        console.error('[pacientes] Falha ao remover PDF antigo (nao critico):', err);
      });
    }
  } else {
    const { data: nova, error: insErr } = await supabase
      .from('dietas')
      .insert({ paciente_id: id, pdf_url: novoPdfUrl, status: 'ativa' })
      .select('id')
      .single();
    if (insErr || !nova) {
      console.error('[pacientes] Erro ao inserir nova dieta:', insErr?.message);
      res.status(500).json({ error: insErr?.message ?? 'Erro ao salvar dieta' });
      return;
    }
    dietaId = nova.id;
  }

  res.json({ sucesso: true, dieta_id: dietaId, processando: true });

  // P1-6: re-extrair horarios e re-processar RAG em background (paciente ja
  // pode estar com entrevista completa — alertas_config ja foi sincronizado;
  // os horarios novos servem se o nutricionista re-disparar entrevista futura).
  (async () => {
    try {
      const texto = await baixarTextoPDF(novoPdfUrl);
      const horarios = await extrairHorariosDieta(texto);
      await salvarHorariosDieta(dietaId, horarios);
      await processarDieta(id, dietaId, novoPdfUrl, texto);
    } catch (err) {
      console.error('[pacientes] Falha no reprocessamento (horarios + RAG):', err);
    }
  })();
});

pacientesRouter.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const { data: existente, error: lookupErr } = await supabase
    .from('pacientes')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (lookupErr) {
    console.error('[pacientes] Erro ao buscar paciente para deletar:', lookupErr.message);
    res.status(500).json({ error: lookupErr.message });
    return;
  }
  if (!existente) {
    res.status(404).json({ error: 'Paciente nao encontrado' });
    return;
  }

  const { data: arquivos, error: listErr } = await supabase.storage
    .from('dietas')
    .list(id);

  if (listErr) {
    console.error('[pacientes] Erro ao listar PDFs do paciente:', listErr.message);
  } else if (arquivos && arquivos.length > 0) {
    const paths = arquivos.map((a) => `${id}/${a.name}`);
    const { error: removeErr } = await supabase.storage.from('dietas').remove(paths);
    if (removeErr) {
      console.error('[pacientes] Erro ao remover PDFs do Storage:', removeErr.message);
    }
  }

  const { error: deleteErr } = await supabase.from('pacientes').delete().eq('id', id);

  if (deleteErr) {
    console.error('[pacientes] Erro ao deletar paciente:', deleteErr.message);
    res.status(500).json({ error: deleteErr.message });
    return;
  }

  res.json({ sucesso: true });
});
