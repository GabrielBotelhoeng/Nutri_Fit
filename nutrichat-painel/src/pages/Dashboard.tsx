import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { PacienteModal } from '../components/PacienteModal';

type RagStatus = 'indexado' | 'processando' | 'falhou' | 'sem_dieta';

interface Paciente {
  id: string;
  nome: string;
  whatsapp: string;
  plano: string;
  data_expiracao: string;
  ativo: boolean;
  status: 'ativo' | 'expirando' | 'expirado';
  rag_status: RagStatus;
}

const ragStatusLabel: Record<RagStatus, { texto: string; cor: string; icone: string; titulo: string }> = {
  indexado: { texto: 'Indexada', cor: 'bg-green-100 text-green-800', icone: '✓', titulo: 'PDF processado — bot pode responder dúvidas sobre a dieta' },
  processando: { texto: 'Processando', cor: 'bg-yellow-100 text-yellow-800', icone: '⏳', titulo: 'Extraindo texto e gerando embeddings (até 5 min)' },
  falhou: { texto: 'Falhou', cor: 'bg-red-100 text-red-800', icone: '✕', titulo: 'Processamento falhou. Tente re-enviar o PDF pela edição.' },
  sem_dieta: { texto: 'Sem dieta', cor: 'bg-gray-100 text-gray-600', icone: '–', titulo: 'Nenhuma dieta cadastrada' },
};

const planoLabels: Record<string, string> = {
  '1mes': '1 mês',
  '3meses': '3 meses',
  '6meses': '6 meses',
  '12meses': '12 meses',
};

type OrdemCampo = 'nome' | 'data_expiracao' | 'status' | 'rag_status';
type OrdemDir = 'asc' | 'desc';

// Pesos para ordenacao categorica — quanto maior, mais "saudavel".
const statusPeso: Record<Paciente['status'], number> = { expirado: 0, expirando: 1, ativo: 2 };
const ragPeso: Record<RagStatus, number> = { falhou: 0, sem_dieta: 1, processando: 2, indexado: 3 };

export function Dashboard() {
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [pacienteSelecionado, setPacienteSelecionado] = useState<Paciente | undefined>(undefined);
  const [busca, setBusca] = useState('');
  const [ordemCampo, setOrdemCampo] = useState<OrdemCampo>('nome');
  const [ordemDir, setOrdemDir] = useState<OrdemDir>('asc');

  const pacientesVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const apenasDigitosBusca = termo.replace(/\D/g, '');
    const filtrados = pacientes.filter((p) => {
      if (!termo) return true;
      if (p.nome.toLowerCase().includes(termo)) return true;
      if (apenasDigitosBusca && p.whatsapp.replace(/\D/g, '').includes(apenasDigitosBusca)) return true;
      return false;
    });
    const sinal = ordemDir === 'asc' ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      let diff = 0;
      switch (ordemCampo) {
        case 'nome':
          diff = a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
          break;
        case 'data_expiracao':
          diff = new Date(a.data_expiracao).getTime() - new Date(b.data_expiracao).getTime();
          break;
        case 'status':
          diff = statusPeso[a.status] - statusPeso[b.status];
          break;
        case 'rag_status':
          diff = ragPeso[a.rag_status] - ragPeso[b.rag_status];
          break;
      }
      return diff * sinal;
    });
  }, [pacientes, busca, ordemCampo, ordemDir]);

  function alternarOrdem(campo: OrdemCampo) {
    if (campo === ordemCampo) {
      setOrdemDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdemCampo(campo);
      setOrdemDir('asc');
    }
  }

  function setaOrdem(campo: OrdemCampo): string {
    if (campo !== ordemCampo) return '';
    return ordemDir === 'asc' ? ' ▲' : ' ▼';
  }

  const carregarPacientes = useCallback(async () => {
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const res = await apiFetch('/api/pacientes');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Erro ${res.status} ao carregar pacientes`);
      }
      const data = (await res.json()) as Paciente[];
      setPacientes(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao carregar pacientes';
      console.error('[dashboard] Erro ao carregar pacientes:', err);
      setErroCarregamento(msg);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregarPacientes(); }, [carregarPacientes]);

  function abrirNovoPaciente() { setPacienteSelecionado(undefined); setModalAberto(true); }
  function abrirEdicao(p: Paciente) { setPacienteSelecionado(p); setModalAberto(true); }
  function fecharModal() { setModalAberto(false); setPacienteSelecionado(undefined); }
  function formatarData(s: string) { return new Date(s).toLocaleDateString('pt-BR'); }

  return (
    <div style={{ background: 'var(--color-offwhite)', minHeight: '100vh' }}>
      <header className="px-6 py-4 flex items-center justify-between text-white" style={{ background: 'var(--color-floresta)' }}>
        <span className="font-bold text-lg">🥗 NutriChat — Painel</span>
        <button onClick={() => supabase.auth.signOut()}
          className="text-sm underline opacity-80 hover:opacity-100 cursor-pointer">
          Sair
        </button>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-terra)' }}>Pacientes</h1>
          <button onClick={abrirNovoPaciente}
            className="px-4 py-2 rounded text-white text-sm font-semibold cursor-pointer"
            style={{ background: 'var(--color-floresta)' }}>
            + Novo Paciente
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou WhatsApp..."
            className="flex-1 max-w-md border border-gray-300 rounded px-3 py-2 text-sm bg-white" />
          {busca && (
            <button onClick={() => setBusca('')}
              className="text-xs text-gray-500 underline hover:opacity-80 cursor-pointer">
              Limpar
            </button>
          )}
          {!carregando && !erroCarregamento && (
            <span className="text-xs text-gray-500 ml-auto">
              {pacientesVisiveis.length} de {pacientes.length}
            </span>
          )}
        </div>

        {erroCarregamento && (
          <div className="mb-4 px-4 py-3 rounded border border-red-300 bg-red-50 text-sm text-red-700 flex items-start justify-between gap-3">
            <span><strong>Não foi possível carregar a lista.</strong> {erroCarregamento}</span>
            <button onClick={carregarPacientes}
              className="underline whitespace-nowrap font-medium hover:opacity-80 cursor-pointer">
              Tentar novamente
            </button>
          </div>
        )}

        {carregando ? (
          <p className="text-center py-10" style={{ color: 'var(--color-terra)' }}>Carregando pacientes...</p>
        ) : erroCarregamento ? null : pacientes.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm">
            <p className="text-lg mb-2" style={{ color: 'var(--color-terra)' }}>Nenhum paciente cadastrado</p>
            <p className="text-sm text-gray-500">Clique em "+ Novo Paciente" para começar</p>
          </div>
        ) : pacientesVisiveis.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm">
            <p className="text-lg mb-2" style={{ color: 'var(--color-terra)' }}>Nenhum paciente encontrado</p>
            <p className="text-sm text-gray-500">Tente outro termo ou <button onClick={() => setBusca('')} className="underline cursor-pointer">limpar a busca</button>.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:opacity-80"
                    style={{ color: 'var(--color-terra)' }} onClick={() => alternarOrdem('nome')}>
                    Nome{setaOrdem('nome')}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-terra)' }}>WhatsApp</th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-terra)' }}>Plano</th>
                  <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:opacity-80"
                    style={{ color: 'var(--color-terra)' }} onClick={() => alternarOrdem('data_expiracao')}>
                    Expiração{setaOrdem('data_expiracao')}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:opacity-80"
                    style={{ color: 'var(--color-terra)' }} onClick={() => alternarOrdem('status')}>
                    Status{setaOrdem('status')}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:opacity-80"
                    style={{ color: 'var(--color-terra)' }} onClick={() => alternarOrdem('rag_status')}>
                    Dieta{setaOrdem('rag_status')}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-terra)' }}></th>
                </tr>
              </thead>
              <tbody>
                {pacientesVisiveis.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-terra)' }}>{p.nome}</td>
                    <td className="px-4 py-3 text-gray-600">{p.whatsapp}</td>
                    <td className="px-4 py-3 text-gray-600">{planoLabels[p.plano] ?? p.plano}</td>
                    <td className="px-4 py-3 text-gray-600">{formatarData(p.data_expiracao)}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                    <td className="px-4 py-3">
                      <span
                        title={ragStatusLabel[p.rag_status].titulo}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${ragStatusLabel[p.rag_status].cor}`}>
                        <span>{ragStatusLabel[p.rag_status].icone}</span>
                        {ragStatusLabel[p.rag_status].texto}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => abrirEdicao(p)}
                        className="text-xs underline cursor-pointer" style={{ color: 'var(--color-floresta)' }}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {modalAberto && (
        <PacienteModal paciente={pacienteSelecionado} onClose={fecharModal} onSaved={carregarPacientes} />
      )}
    </div>
  );
}
