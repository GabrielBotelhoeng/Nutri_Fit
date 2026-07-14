import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { RagBadge } from '../components/RagBadge';
import type { RagStatus } from '../lib/rag';
import { PacienteModal } from '../components/PacienteModal';
import { Button } from '../components/Button';
import { SummaryCard } from '../components/SummaryCard';
import { PLANO_LABELS, formatarDataBR } from '../lib/planos';

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

type OrdemCampo = 'nome' | 'data_expiracao' | 'status' | 'rag_status';
type OrdemDir = 'asc' | 'desc';
type FiltroStatus = 'todos' | 'ativo' | 'expirando' | 'expirado';
type FiltroDieta = 'todas' | 'indexado' | 'processando' | 'falhou' | 'sem_dieta';

// Pesos para ordenacao categorica — quanto maior, mais "saudavel".
const statusPeso: Record<Paciente['status'], number> = { expirado: 0, expirando: 1, ativo: 2 };
const ragPeso: Record<RagStatus, number> = { falhou: 0, sem_dieta: 1, processando: 2, indexado: 3 };

function formatarWhatsappBR(raw: string): string {
  const d = raw.replace(/\D/g, '').replace(/^55/, '').slice(0, 11);
  if (d.length !== 11) return raw;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function formatarHorario(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function Dashboard() {
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [pacienteSelecionado, setPacienteSelecionado] = useState<Paciente | undefined>(undefined);

  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
  const [filtroDieta, setFiltroDieta] = useState<FiltroDieta>('todas');
  const [ordemCampo, setOrdemCampo] = useState<OrdemCampo>('nome');
  const [ordemDir, setOrdemDir] = useState<OrdemDir>('asc');
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);

  const buscaRef = useRef<HTMLInputElement>(null);

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
      setUltimaAtualizacao(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido ao carregar pacientes';
      console.error('[dashboard] Erro ao carregar pacientes:', err);
      setErroCarregamento(msg);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // Fetch inicial: rodamos em microtask pra manter o setState fora do
    // corpo sincrono do efeito (satisfaz react-hooks/set-state-in-effect).
    void Promise.resolve().then(carregarPacientes);
  }, [carregarPacientes]);

  // H7 — Atalho: "/" foca a busca. Ignora quando ja esta digitando em input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || modalAberto) return;
      const el = document.activeElement;
      const tag = el?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      buscaRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalAberto]);

  // Contagens de resumo (calculadas sobre todos os pacientes, nao os filtrados)
  const resumo = useMemo(() => {
    const total = pacientes.length;
    let ativos = 0;
    let expirando = 0;
    let expirados = 0;
    for (const p of pacientes) {
      if (p.status === 'ativo') ativos++;
      else if (p.status === 'expirando') expirando++;
      else if (p.status === 'expirado') expirados++;
    }
    return { total, ativos, expirando, expirados };
  }, [pacientes]);

  const pacientesVisiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const apenasDigitosBusca = termo.replace(/\D/g, '');
    const filtrados = pacientes.filter((p) => {
      if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;
      if (filtroDieta !== 'todas' && p.rag_status !== filtroDieta) return false;
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
  }, [pacientes, busca, filtroStatus, filtroDieta, ordemCampo, ordemDir]);

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

  function abrirNovoPaciente() {
    setPacienteSelecionado(undefined);
    setModalAberto(true);
  }
  function abrirEdicao(p: Paciente) {
    setPacienteSelecionado(p);
    setModalAberto(true);
  }
  function fecharModal() {
    setModalAberto(false);
    setPacienteSelecionado(undefined);
  }

  function limparFiltros() {
    setBusca('');
    setFiltroStatus('todos');
    setFiltroDieta('todas');
  }

  const temFiltroAtivo = busca || filtroStatus !== 'todos' || filtroDieta !== 'todas';

  return (
    <div style={{ background: 'var(--color-bg-app)', minHeight: '100vh' }}>
      <header
        className="px-6 py-3 flex items-center justify-between text-white"
        style={{ background: 'var(--color-floresta)' }}
      >
        <span className="font-bold text-base flex items-center gap-2">
          <span aria-hidden>🥗</span> NutriChat <span className="opacity-70">— Painel</span>
        </span>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm underline opacity-80 hover:opacity-100 cursor-pointer"
        >
          Sair
        </button>
      </header>

      <main className="p-6 max-w-6xl mx-auto">
        {/* Titulo + acao principal */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
              Pacientes
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Gerencie o acesso, a dieta e a validade de cada paciente.
            </p>
          </div>
          <Button onClick={abrirNovoPaciente} icon={<span>+</span>}>
            Novo paciente
          </Button>
        </div>

        {/* Cards de resumo — H1 visibilidade + H6 filtros como reconhecimento */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <SummaryCard
            label="Total"
            value={resumo.total}
            hint={resumo.total === 1 ? '1 paciente cadastrado' : `${resumo.total} pacientes cadastrados`}
            tone="neutral"
            active={filtroStatus === 'todos'}
            onClick={() => setFiltroStatus('todos')}
          />
          <SummaryCard
            label="Ativos"
            value={resumo.ativos}
            hint="Plano vigente"
            tone="success"
            active={filtroStatus === 'ativo'}
            onClick={() => setFiltroStatus('ativo')}
          />
          <SummaryCard
            label="Expirando"
            value={resumo.expirando}
            hint="Vence em ate 3 dias"
            tone="warning"
            active={filtroStatus === 'expirando'}
            onClick={() => setFiltroStatus('expirando')}
          />
          <SummaryCard
            label="Expirados"
            value={resumo.expirados}
            hint="Precisam renovar"
            tone="danger"
            active={filtroStatus === 'expirado'}
            onClick={() => setFiltroStatus('expirado')}
          />
        </div>

        {/* Barra de controle: busca + filtro dieta + refresh */}
        <div
          className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-xl bg-white"
          style={{ border: '1px solid var(--color-border-subtle)' }}
        >
          <div className="relative flex-1 min-w-[220px]">
            <span
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
              style={{ color: 'var(--color-text-muted)' }}
            >
              🔎
            </span>
            <input
              ref={buscaRef}
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder='Buscar por nome ou WhatsApp — tecle "/"'
              aria-label="Buscar pacientes"
              className="w-full pl-8 pr-3 py-2 rounded-md text-sm border"
              style={{ borderColor: 'var(--color-border-subtle)' }}
            />
          </div>

          <FiltroDietaSelect value={filtroDieta} onChange={setFiltroDieta} />

          <Button
            variant="secondary"
            size="sm"
            onClick={carregarPacientes}
            loading={carregando}
            title="Atualizar lista"
          >
            Atualizar
          </Button>

          {ultimaAtualizacao && !carregando && (
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Atualizado {formatarHorario(ultimaAtualizacao)}
            </span>
          )}
        </div>

        {/* Metadata da lista + limpar filtros */}
        {!carregando && !erroCarregamento && pacientes.length > 0 && (
          <div className="flex items-center justify-between mb-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span>
              Exibindo <strong>{pacientesVisiveis.length}</strong> de <strong>{pacientes.length}</strong> pacientes
            </span>
            {temFiltroAtivo && (
              <button onClick={limparFiltros} className="underline cursor-pointer">
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Erro de carregamento */}
        {erroCarregamento && (
          <div
            className="mb-4 px-4 py-3 rounded-md text-sm flex items-start justify-between gap-3"
            style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
          >
            <span>
              <strong>Nao foi possivel carregar a lista.</strong> {erroCarregamento}
            </span>
            <button onClick={carregarPacientes} className="underline whitespace-nowrap font-medium cursor-pointer">
              Tentar novamente
            </button>
          </div>
        )}

        {/* Estados da tabela */}
        {carregando ? (
          <SkeletonTable />
        ) : erroCarregamento ? null : pacientes.length === 0 ? (
          <EmptyState
            titulo="Nenhum paciente cadastrado"
            descricao="Comece cadastrando o primeiro paciente. O bot recebe as boas-vindas automaticamente."
            acao={<Button onClick={abrirNovoPaciente}>+ Cadastrar primeiro paciente</Button>}
          />
        ) : pacientesVisiveis.length === 0 ? (
          <EmptyState
            titulo="Nenhum paciente encontrado"
            descricao="Tente outro termo ou remova algum filtro."
            acao={
              <Button variant="secondary" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <div
            className="bg-white rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--color-border-subtle)', boxShadow: 'var(--shadow-card)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--color-bg-muted)' }}>
                  <SortableTh
                    ativo={ordemCampo === 'nome'}
                    onClick={() => alternarOrdem('nome')}
                    seta={setaOrdem('nome')}
                  >
                    Nome
                  </SortableTh>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    WhatsApp
                  </th>
                  <th className="text-left px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    Plano
                  </th>
                  <SortableTh
                    ativo={ordemCampo === 'data_expiracao'}
                    onClick={() => alternarOrdem('data_expiracao')}
                    seta={setaOrdem('data_expiracao')}
                  >
                    Expiracao
                  </SortableTh>
                  <SortableTh
                    ativo={ordemCampo === 'status'}
                    onClick={() => alternarOrdem('status')}
                    seta={setaOrdem('status')}
                  >
                    Status
                  </SortableTh>
                  <SortableTh
                    ativo={ordemCampo === 'rag_status'}
                    onClick={() => alternarOrdem('rag_status')}
                    seta={setaOrdem('rag_status')}
                  >
                    Bot
                  </SortableTh>
                  <th className="text-right px-4 py-3 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    Acao
                  </th>
                </tr>
              </thead>
              <tbody>
                {pacientesVisiveis.map((p) => (
                  <tr
                    key={p.id}
                    className="transition-colors hover:bg-[color:var(--color-bg-muted)]"
                    style={{ borderTop: '1px solid var(--color-border-subtle)' }}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {p.nome}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                      {formatarWhatsappBR(p.whatsapp)}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                      {PLANO_LABELS[p.plano as keyof typeof PLANO_LABELS] ?? p.plano}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                      {formatarDataBR(p.data_expiracao)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        status={p.status}
                        title={
                          p.status === 'expirando'
                            ? 'Vence em ate 3 dias'
                            : p.status === 'expirado'
                              ? 'Plano vencido — o bot bloqueia mensagens'
                              : 'Plano vigente'
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <RagBadge status={p.rag_status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => abrirEdicao(p)}>
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodape com dica de atalho */}
        <p className="text-xs mt-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Dica: pressione <kbd className="px-1 border rounded">/</kbd> para buscar,{' '}
          <kbd className="px-1 border rounded">Esc</kbd> para fechar o modal.
        </p>
      </main>

      {modalAberto && (
        <PacienteModal paciente={pacienteSelecionado} onClose={fecharModal} onSaved={carregarPacientes} />
      )}
    </div>
  );
}

// ---------- helpers ----------

function SortableTh({
  children,
  onClick,
  ativo,
  seta,
}: {
  children: React.ReactNode;
  onClick: () => void;
  ativo: boolean;
  seta: string;
}) {
  return (
    <th
      onClick={onClick}
      className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:opacity-80"
      style={{ color: ativo ? 'var(--color-floresta-dark)' : 'var(--color-text-secondary)' }}
    >
      {children}
      {seta}
    </th>
  );
}

function FiltroDietaSelect({
  value,
  onChange,
}: {
  value: FiltroDieta;
  onChange: (v: FiltroDieta) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="filtro-dieta" className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        Bot:
      </label>
      <select
        id="filtro-dieta"
        value={value}
        onChange={(e) => onChange(e.target.value as FiltroDieta)}
        className="border rounded-md px-2 py-1.5 text-sm bg-white"
        style={{ borderColor: 'var(--color-border-subtle)' }}
      >
        <option value="todas">Todos</option>
        <option value="indexado">Pronto</option>
        <option value="processando">Preparando</option>
        <option value="falhou">Falhou</option>
        <option value="sem_dieta">Sem dieta</option>
      </select>
    </div>
  );
}

function EmptyState({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div
      className="text-center py-16 rounded-xl bg-white"
      style={{ border: '1px solid var(--color-border-subtle)' }}
    >
      <p className="text-lg font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
        {titulo}
      </p>
      <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
        {descricao}
      </p>
      {acao}
    </div>
  );
}

function SkeletonTable() {
  return (
    <div
      className="bg-white rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--color-border-subtle)' }}
    >
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse"
          style={{
            background: i % 2 ? 'var(--color-bg-muted)' : 'white',
            borderTop: i === 0 ? 'none' : '1px solid var(--color-border-subtle)',
          }}
        />
      ))}
    </div>
  );
}
