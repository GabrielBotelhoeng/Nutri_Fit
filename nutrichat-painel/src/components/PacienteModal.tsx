import { useEffect, useState } from 'react';

interface Paciente {
  id: string;
  nome: string;
  whatsapp: string;
  plano: string;
  data_expiracao: string;
  ativo: boolean;
  status: 'ativo' | 'expirando' | 'expirado';
}

interface PacienteModalProps {
  paciente?: Paciente;
  onClose: () => void;
  onSaved: () => void;
}

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;
const API_KEY = import.meta.env.VITE_PANEL_API_KEY as string;

function soDigitos(s: string): string {
  return s.replace(/\D/g, '');
}

// Recebe digitos do numero BR local (DDD + 9 + 8) e formata "(DD) 9DDDD-DDDD".
function formatarWhatsappBR(digitos: string): string {
  const d = digitos.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// 11 digitos, DDD 11-99 (sem zero), 9 obrigatorio apos o DDD.
function whatsappBRValido(digitos: string): boolean {
  return /^[1-9][1-9]9\d{8}$/.test(digitos);
}

export function PacienteModal({ paciente, onClose, onSaved }: PacienteModalProps) {
  const isEdicao = !!paciente;

  const [nome, setNome] = useState(paciente?.nome ?? '');
  // Armazena apenas digitos do numero BR local (DDD + 9 + 8 = 11 digitos).
  // Na edicao, remove o prefixo "55" se presente.
  const [whatsappDigitos, setWhatsappDigitos] = useState(() => {
    const raw = soDigitos(paciente?.whatsapp ?? '');
    return raw.startsWith('55') ? raw.slice(2) : raw;
  });
  const [plano, setPlano] = useState(paciente?.plano ?? '1mes');
  const [dataExpiracao, setDataExpiracao] = useState(
    paciente?.data_expiracao ? paciente.data_expiracao.slice(0, 10) : ''
  );
  const [ativo, setAtivo] = useState(paciente?.ativo ?? true);
  const [pdf, setPdf] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [dietaUrl, setDietaUrl] = useState<string | null>(null);
  const [dietaCriadaEm, setDietaCriadaEm] = useState<string | null>(null);
  const [carregandoDieta, setCarregandoDieta] = useState(false);
  const [confirmandoDesativar, setConfirmandoDesativar] = useState(false);

  useEffect(() => {
    if (!paciente) return;
    let cancelado = false;
    setCarregandoDieta(true);
    fetch(`${BACKEND_URL}/api/pacientes/${paciente.id}/dieta`, {
      headers: { 'X-API-Key': API_KEY },
    })
      .then(async (res) => {
        if (cancelado) return;
        if (res.ok) {
          const data = (await res.json()) as { signed_url: string; created_at: string };
          setDietaUrl(data.signed_url);
          setDietaCriadaEm(data.created_at);
        } else {
          setDietaUrl(null);
          setDietaCriadaEm(null);
        }
      })
      .catch(() => { if (!cancelado) { setDietaUrl(null); setDietaCriadaEm(null); } })
      .finally(() => { if (!cancelado) setCarregandoDieta(false); });
    return () => { cancelado = true; };
  }, [paciente]);

  const estaDesativando = isEdicao && !!paciente?.ativo && !ativo;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (estaDesativando && !confirmandoDesativar) {
      setConfirmandoDesativar(true);
      return;
    }
    setLoading(true);
    setErro('');
    setSucesso('');

    try {
      if (isEdicao) {
        const body: { ativo?: boolean; data_expiracao?: string } = { ativo };
        if (dataExpiracao) body.data_expiracao = dataExpiracao;

        const res = await fetch(`${BACKEND_URL}/api/pacientes/${paciente.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Erro ao atualizar paciente');
        }

        if (pdf) {
          const form = new FormData();
          form.append('dieta', pdf);
          const resDieta = await fetch(`${BACKEND_URL}/api/pacientes/${paciente.id}/dieta`, {
            method: 'POST',
            headers: { 'X-API-Key': API_KEY },
            body: form,
          });
          if (!resDieta.ok) {
            const err = await resDieta.json().catch(() => ({}));
            throw new Error((err as { error?: string }).error ?? 'Erro ao substituir PDF da dieta');
          }
          setSucesso('Paciente atualizado. Nova dieta sendo reprocessada em segundo plano.');
        } else {
          setSucesso('Paciente atualizado com sucesso.');
        }
      } else {
        if (!pdf) { setErro('Selecione o PDF da dieta.'); setLoading(false); return; }
        if (!whatsappBRValido(whatsappDigitos)) {
          setErro('WhatsApp inválido. Use o formato (DDD) 9XXXX-XXXX — 11 dígitos com 9 após o DDD.');
          setLoading(false);
          return;
        }

        const form = new FormData();
        form.append('nome', nome);
        form.append('whatsapp', `55${whatsappDigitos}`);
        form.append('plano', plano);
        form.append('data_expiracao', dataExpiracao);
        form.append('dieta', pdf);

        const res = await fetch(`${BACKEND_URL}/api/pacientes`, {
          method: 'POST',
          headers: { 'X-API-Key': API_KEY },
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Erro ao cadastrar paciente');
        }
        setSucesso(`✅ ${nome} cadastrado — dieta sendo processada em segundo plano.`);
      }

      setTimeout(() => { onSaved(); onClose(); }, 1500);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  async function handleExcluir() {
    if (!paciente) return;
    setExcluindo(true);
    setErro('');
    setSucesso('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/pacientes/${paciente.id}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': API_KEY },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Erro ao excluir paciente');
      }
      setSucesso('Paciente excluído com sucesso.');
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido ao excluir');
      setConfirmandoExcluir(false);
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold" style={{ color: 'var(--color-terra)' }}>
            {isEdicao ? 'Editar Paciente' : 'Novo Paciente'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl cursor-pointer">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isEdicao && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-terra)' }}>Nome</label>
                <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required
                  className="w-full border border-gray-300 rounded px-3 py-2" placeholder="Nome completo" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-terra)' }}>WhatsApp</label>
                <input type="tel" inputMode="numeric"
                  value={formatarWhatsappBR(whatsappDigitos)}
                  onChange={(e) => setWhatsappDigitos(soDigitos(e.target.value).slice(0, 11))}
                  required
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="(62) 99551-4963" />
                <p className="text-xs text-gray-500 mt-1">
                  Apenas Brasil — DDD + 9 + número. O código 55 é adicionado automaticamente.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-terra)' }}>Plano</label>
                <select value={plano} onChange={(e) => setPlano(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2">
                  <option value="1mes">1 mês</option>
                  <option value="3meses">3 meses</option>
                  <option value="6meses">6 meses</option>
                  <option value="12meses">12 meses</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-terra)' }}>Data de Expiração</label>
            <input type="date" value={dataExpiracao} onChange={(e) => setDataExpiracao(e.target.value)} required
              className="w-full border border-gray-300 rounded px-3 py-2" />
          </div>

          {isEdicao && (
            <div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ativo" checked={ativo}
                  onChange={(e) => { setAtivo(e.target.checked); if (e.target.checked) setConfirmandoDesativar(false); }}
                  className="w-4 h-4" />
                <label htmlFor="ativo" className="text-sm font-medium" style={{ color: 'var(--color-terra)' }}>Acesso ativo</label>
              </div>
              {estaDesativando && !confirmandoDesativar && (
                <p className="text-xs text-gray-500 mt-1">
                  Ao desmarcar, o bot deixará de responder mensagens deste WhatsApp.
                </p>
              )}
              {confirmandoDesativar && (
                <div className="mt-2 px-3 py-2 rounded border border-yellow-300 bg-yellow-50 text-sm text-yellow-900">
                  <p className="mb-2">
                    Vai desativar <strong>{paciente?.nome}</strong>. O bot <strong>não responderá mais</strong> mensagens deste WhatsApp até reativar. Continuar?
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setAtivo(true); setConfirmandoDesativar(false); }}
                      className="flex-1 py-1.5 rounded border border-gray-300 text-xs text-gray-700 hover:bg-white cursor-pointer">
                      Manter ativo
                    </button>
                    <button type="submit"
                      className="flex-1 py-1.5 rounded text-white text-xs font-semibold cursor-pointer"
                      style={{ background: '#b45309' }}>
                      Sim, desativar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {!isEdicao && (
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-terra)' }}>Dieta (PDF)</label>
              <input type="file" accept=".pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} required
                className="w-full text-sm text-gray-500" />
              {pdf && <p className="text-xs text-gray-500 mt-1">📄 {pdf.name}</p>}
            </div>
          )}

          {isEdicao && (
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-terra)' }}>Dieta atual</label>
              {carregandoDieta ? (
                <p className="text-xs text-gray-500">Carregando dieta...</p>
              ) : dietaUrl ? (
                <a href={dietaUrl} target="_blank" rel="noopener noreferrer"
                  className="text-sm underline" style={{ color: 'var(--color-floresta)' }}>
                  📄 Ver PDF atual{dietaCriadaEm && ` (enviado em ${new Date(dietaCriadaEm).toLocaleDateString('pt-BR')})`}
                </a>
              ) : (
                <p className="text-xs text-gray-500">Sem dieta cadastrada.</p>
              )}
              <label className="block text-sm font-medium mb-1 mt-2" style={{ color: 'var(--color-terra)' }}>Substituir PDF (opcional)</label>
              <input type="file" accept=".pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-500" />
              {pdf && <p className="text-xs text-gray-500 mt-1">📄 {pdf.name} — substituirá a dieta atual e re-processará o RAG</p>}
            </div>
          )}

          {erro && <p className="text-red-600 text-sm">{erro}</p>}
          {sucesso && <p className="text-green-700 text-sm">{sucesso}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 cursor-pointer">
              Cancelar
            </button>
            <button type="submit" disabled={loading || excluindo}
              className="flex-1 py-2 rounded text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
              style={{ background: 'var(--color-floresta)' }}>
              {loading ? 'Salvando...' : isEdicao ? 'Salvar' : 'Cadastrar'}
            </button>
          </div>

          {isEdicao && (
            <div className="pt-3 mt-3 border-t border-gray-200">
              {!confirmandoExcluir ? (
                <button type="button" onClick={() => setConfirmandoExcluir(true)}
                  disabled={loading || excluindo}
                  className="w-full py-2 rounded border border-red-300 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 cursor-pointer">
                  Excluir paciente
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-red-700">
                    Excluir <strong>{paciente.nome}</strong> apaga histórico, dieta e conversas. Esta ação não pode ser desfeita.
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmandoExcluir(false)}
                      disabled={excluindo}
                      className="flex-1 py-2 rounded border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60 cursor-pointer">
                      Não, voltar
                    </button>
                    <button type="button" onClick={handleExcluir}
                      disabled={excluindo}
                      className="flex-1 py-2 rounded text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
                      style={{ background: '#b91c1c' }}>
                      {excluindo ? 'Excluindo...' : 'Sim, excluir'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
