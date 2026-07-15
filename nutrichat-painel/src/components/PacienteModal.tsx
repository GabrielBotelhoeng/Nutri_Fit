import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  MESES_POR_PLANO,
  PLANO_LABELS,
  PLANOS_ORDENADOS,
  calcularDataExpiracao,
  formatarDataBR,
  type PlanoId,
} from '../lib/planos';
import { Button } from './Button';
import { HelpTip } from './HelpTip';

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

function isPlanoValido(p: string): p is PlanoId {
  return p in MESES_POR_PLANO;
}

export function PacienteModal({ paciente, onClose, onSaved }: PacienteModalProps) {
  const isEdicao = !!paciente;

  const [nome, setNome] = useState(paciente?.nome ?? '');
  const [whatsappDigitos, setWhatsappDigitos] = useState(() => {
    const raw = soDigitos(paciente?.whatsapp ?? '');
    return raw.startsWith('55') ? raw.slice(2) : raw;
  });
  const [plano, setPlano] = useState<PlanoId>(
    isPlanoValido(paciente?.plano ?? '') ? (paciente!.plano as PlanoId) : '1mes'
  );
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

  const primeiroInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    primeiroInputRef.current?.focus();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose]);

  // Preview da data calculada — no submit o backend recalcula do plano,
  // entao dataCalculadaPreview so serve pro cadastro (modo edicao usa
  // dataExpiracao). Nao sincronizar.
  const dataCalculadaPreview = useMemo(() => calcularDataExpiracao(plano), [plano]);

  useEffect(() => {
    if (!paciente) return;
    let cancelado = false;
    // setState fora do corpo sincrono do efeito (regra react-hooks).
    void Promise.resolve().then(async () => {
      if (cancelado) return;
      setCarregandoDieta(true);
      try {
        const res = await apiFetch(`/api/pacientes/${paciente.id}/dieta`);
        if (cancelado) return;
        if (res.ok) {
          const data = (await res.json()) as { signed_url: string; created_at: string };
          setDietaUrl(data.signed_url);
          setDietaCriadaEm(data.created_at);
        } else {
          setDietaUrl(null);
          setDietaCriadaEm(null);
        }
      } catch {
        if (!cancelado) {
          setDietaUrl(null);
          setDietaCriadaEm(null);
        }
      } finally {
        if (!cancelado) setCarregandoDieta(false);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [paciente]);

  const estaDesativando = isEdicao && !!paciente?.ativo && !ativo;

  // Aviso: nutri esta encurtando/prolongando a data manualmente.
  const dataAlteradaNaEdicao =
    isEdicao && dataExpiracao && paciente?.data_expiracao.slice(0, 10) !== dataExpiracao;
  const dataNoPassado = dataExpiracao && new Date(dataExpiracao + 'T00:00:00Z') < new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

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

        const res = await apiFetch(`/api/pacientes/${paciente.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Erro ao atualizar paciente');
        }

        if (pdf) {
          const form = new FormData();
          form.append('dieta', pdf);
          const resDieta = await apiFetch(`/api/pacientes/${paciente.id}/dieta`, {
            method: 'POST',
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
        if (!pdf) {
          setErro('Selecione o PDF da dieta.');
          setLoading(false);
          return;
        }
        if (!whatsappBRValido(whatsappDigitos)) {
          setErro('WhatsApp invalido. Use o formato (DDD) 9XXXX-XXXX — 11 digitos com 9 apos o DDD.');
          setLoading(false);
          return;
        }

        // Cadastro nao envia data_expiracao — backend calcula do plano.
        const form = new FormData();
        form.append('nome', nome);
        form.append('whatsapp', `55${whatsappDigitos}`);
        form.append('plano', plano);
        form.append('dieta', pdf);

        const res = await apiFetch('/api/pacientes', {
          method: 'POST',
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Erro ao cadastrar paciente');
        }
        setSucesso(`${nome} cadastrado — dieta sendo processada em segundo plano.`);
      }

      setTimeout(() => {
        onSaved();
        onClose();
      }, 1400);
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
      const res = await apiFetch(`/api/pacientes/${paciente.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Erro ao excluir paciente');
      }
      setSucesso('Paciente excluido com sucesso.');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1200);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro desconhecido ao excluir');
      setConfirmandoExcluir(false);
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(15, 22, 10, 0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: 'var(--shadow-modal)' }}
      >
        {/* Cabecalho */}
        <div
          className="sticky top-0 flex items-center justify-between px-6 py-4 bg-white z-10"
          style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          <div>
            <h2 id="modal-title" className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {isEdicao ? 'Editar paciente' : 'Novo paciente'}
            </h2>
            {isEdicao && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {paciente!.nome}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar (ESC)"
            className="w-8 h-8 flex items-center justify-center rounded-full text-xl cursor-pointer hover:bg-gray-100 transition"
            style={{ color: 'var(--color-text-muted)' }}
          >
            ×
          </button>
        </div>

        {/* Feedback global (topo do form, sem scroll) */}
        {(erro || sucesso) && (
          <div className="px-6 pt-4">
            {erro && (
              <div
                className="px-3 py-2 rounded-md text-sm"
                style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)' }}
                role="alert"
              >
                {erro}
              </div>
            )}
            {sucesso && (
              <div
                className="px-3 py-2 rounded-md text-sm"
                style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)' }}
                role="status"
              >
                {sucesso}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!isEdicao && (
            <>
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Nome completo
                </label>
                <input
                  ref={primeiroInputRef}
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-subtle)' }}
                  placeholder="Ex.: Maria da Silva"
                />
              </div>

              {/* WhatsApp */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  WhatsApp
                  <HelpTip text="Apenas Brasil (DDD + 9 + numero). O codigo 55 e adicionado automaticamente." />
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  value={formatarWhatsappBR(whatsappDigitos)}
                  onChange={(e) => setWhatsappDigitos(soDigitos(e.target.value).slice(0, 11))}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-subtle)' }}
                  placeholder="(62) 99999-9999"
                />
              </div>

              {/* Plano (fonte da verdade) */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Plano contratado
                  <HelpTip text="Define quanto tempo o paciente tera acesso. A data de expiracao e calculada automaticamente." />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PLANOS_ORDENADOS.map((p) => (
                    <button
                      type="button"
                      key={p}
                      onClick={() => setPlano(p)}
                      aria-pressed={plano === p}
                      className="rounded-md py-2 px-3 text-sm font-medium border transition cursor-pointer"
                      style={{
                        borderColor: plano === p ? 'var(--color-floresta)' : 'var(--color-border-subtle)',
                        background: plano === p ? 'var(--color-floresta-soft)' : 'white',
                        color: plano === p ? 'var(--color-floresta-dark)' : 'var(--color-text-primary)',
                      }}
                    >
                      {PLANO_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview da data calculada — mostra a relacao plano → data */}
              <div
                className="flex items-start gap-2 px-3 py-2 rounded-md text-sm"
                style={{ background: 'var(--color-floresta-soft)', color: 'var(--color-floresta-dark)' }}
              >
                <span aria-hidden>📅</span>
                <div>
                  <div className="font-semibold">Expira em {formatarDataBR(dataCalculadaPreview)}</div>
                  <div className="text-xs opacity-80">
                    Calculado a partir de hoje + {MESES_POR_PLANO[plano]} {MESES_POR_PLANO[plano] === 1 ? 'mes' : 'meses'}.
                    Voce pode ajustar a data depois pela edicao.
                  </div>
                </div>
              </div>

              {/* PDF da dieta */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Dieta (PDF)
                  <HelpTip text="O PDF sera processado para que o bot responda duvidas sobre a dieta." />
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                  required
                  className="w-full text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                />
                {pdf && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    📄 {pdf.name}
                  </p>
                )}
              </div>
            </>
          )}

          {isEdicao && (
            <>
              {/* Resumo (read-only) — H2 reconhecimento sobre memoria */}
              <div className="grid grid-cols-2 gap-3">
                <ReadOnlyField label="WhatsApp" value={formatarWhatsappBR(whatsappDigitos)} />
                <ReadOnlyField label="Plano contratado" value={PLANO_LABELS[plano] ?? plano} />
              </div>

              {/* Data de expiracao editavel — proposito claro */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Data de expiracao
                  <HelpTip text="Prolongue ou reduza a validade sem trocar o plano cadastrado. Util para renovacoes e bonus." />
                </label>
                <input
                  type="date"
                  value={dataExpiracao}
                  onChange={(e) => setDataExpiracao(e.target.value)}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--color-border-subtle)' }}
                />
                {dataAlteradaNaEdicao && !dataNoPassado && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Nova validade: {formatarDataBR(dataExpiracao)} (antes: {formatarDataBR(paciente!.data_expiracao)})
                  </p>
                )}
                {dataNoPassado && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-danger)' }}>
                    Atencao: essa data ja passou — o bot bloqueara o paciente ao salvar.
                  </p>
                )}
              </div>

              {/* Acesso ativo */}
              <div>
                <div
                  className="flex items-center justify-between p-3 rounded-md"
                  style={{ background: 'var(--color-bg-muted)' }}
                >
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      Acesso ativo
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {ativo ? 'Bot responde mensagens deste WhatsApp.' : 'Bot ignora mensagens deste WhatsApp.'}
                    </div>
                  </div>
                  <Toggle
                    checked={ativo}
                    onChange={(v) => {
                      setAtivo(v);
                      if (v) setConfirmandoDesativar(false);
                    }}
                  />
                </div>
                {confirmandoDesativar && (
                  <div
                    className="mt-2 px-3 py-2 rounded-md text-sm"
                    style={{ background: 'var(--color-warning-soft)', color: 'var(--color-warning)' }}
                  >
                    <p className="mb-2">
                      Vai desativar <strong>{paciente!.nome}</strong>. O bot nao respondera mais mensagens deste WhatsApp
                      ate voce reativar. Continuar?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        fullWidth
                        onClick={() => {
                          setAtivo(true);
                          setConfirmandoDesativar(false);
                        }}
                      >
                        Manter ativo
                      </Button>
                      <Button type="submit" variant="warning" size="sm" fullWidth>
                        Sim, desativar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Dieta atual + substituir */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>
                  Dieta atual
                </label>
                {carregandoDieta ? (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Carregando dieta...</p>
                ) : dietaUrl ? (
                  <a
                    href={dietaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm underline"
                    style={{ color: 'var(--color-floresta-dark)' }}
                  >
                    📄 Ver PDF atual
                    {dietaCriadaEm && (
                      <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        (enviado em {new Date(dietaCriadaEm).toLocaleDateString('pt-BR')})
                      </span>
                    )}
                  </a>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Sem dieta cadastrada.</p>
                )}

                <label className="block text-sm font-medium mb-1 mt-3" style={{ color: 'var(--color-text-primary)' }}>
                  Substituir PDF (opcional)
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                  style={{ color: 'var(--color-text-secondary)' }}
                />
                {pdf && (
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    📄 {pdf.name} — substituira a dieta atual e re-processara o bot.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Botoes principais */}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} fullWidth>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading || excluindo}>
              {isEdicao ? 'Salvar alteracoes' : 'Cadastrar paciente'}
            </Button>
          </div>

          {/* Zona perigosa */}
          {isEdicao && (
            <div className="pt-4 mt-4" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
              {!confirmandoExcluir ? (
                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  onClick={() => setConfirmandoExcluir(true)}
                  disabled={loading || excluindo}
                  className="!text-[color:var(--color-danger)] hover:!bg-[color:var(--color-danger-soft)]"
                >
                  Excluir paciente
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
                    Excluir <strong>{paciente!.nome}</strong> apaga historico, dieta e conversas.
                    Esta acao nao pode ser desfeita.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      fullWidth
                      onClick={() => setConfirmandoExcluir(false)}
                      disabled={excluindo}
                    >
                      Nao, voltar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      fullWidth
                      onClick={handleExcluir}
                      loading={excluindo}
                      disabled={excluindo}
                    >
                      Sim, excluir
                    </Button>
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div
        className="px-3 py-2 rounded-md text-sm"
        style={{ background: 'var(--color-bg-muted)', color: 'var(--color-text-primary)' }}
      >
        {value || '—'}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition cursor-pointer"
      style={{
        background: checked ? 'var(--color-floresta)' : '#CBD1C2',
      }}
    >
      <span
        className="inline-block h-5 w-5 transform rounded-full bg-white transition shadow"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  );
}
