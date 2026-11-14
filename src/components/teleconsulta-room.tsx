'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { listarAgendamentos } from '@/services/appointments.service';
import {
  abrirSalaTeleconsulta,
  atualizarSessaoTeleconsulta,
  enviarMensagemTeleconsulta,
  inscreverMensagensTeleconsulta,
  listarMensagensTeleconsulta,
  listarSessoesTeleconsulta,
} from '@/services/teleconsultations.service';
import type {
  Appointment,
  TeleconsultationMessage,
  TeleconsultationSession,
  TeleconsultationStatus,
} from '@/types/entities';

const statusLabels: Record<TeleconsultationStatus, string> = {
  waiting: 'Aguardando início',
  in_progress: 'Em andamento',
  ended: 'Encerrada',
};

const statusVariants: Record<
  TeleconsultationStatus,
  'warning' | 'success' | 'neutral'
> = {
  waiting: 'warning',
  in_progress: 'success',
  ended: 'neutral',
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function TeleconsultaRoom() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [sessions, setSessions] = useState<TeleconsultationSession[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [messages, setMessages] = useState<TeleconsultationMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const [aptResult, sessionResult] = await Promise.all([
        listarAgendamentos(),
        listarSessoesTeleconsulta(),
      ]);
      setAppointments(
        aptResult.appointments.filter(
          (apt) =>
            apt.kind === 'teleconsultation' &&
            (apt.status === 'confirmed' || apt.status === 'completed'),
        ),
      );
      setSessions(sessionResult.sessions);
      setCurrentUserId(sessionResult.currentUserId);
      const queryAppointmentId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('appointmentId') ?? ''
          : '';
      const matchedQuerySession = queryAppointmentId
        ? sessionResult.sessions.find((s) => s.appointment_id === queryAppointmentId)
        : undefined;
      setSelectedSessionId((current) =>
        matchedQuerySession?.id ??
        (sessionResult.sessions.some((s) => s.id === current)
          ? current
          : sessionResult.sessions[0]?.id ?? ''),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as teleconsultas.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    void listarMensagensTeleconsulta(selectedSessionId)
      .then((res) => {
        if (!cancelled) setMessages(res.messages);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });

    const unsubscribe = inscreverMensagensTeleconsulta(
      selectedSessionId,
      (incoming) => {
        setMessages((current) =>
          current.some((item) => item.id === incoming.id)
            ? current
            : [...current, incoming],
        );
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [selectedSessionId]);

  const appointmentById = useMemo(
    () => new Map(appointments.map((apt) => [apt.id, apt])),
    [appointments],
  );

  async function handleOpenRoom(appointmentId: string) {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { session } = await abrirSalaTeleconsulta(appointmentId);
      setSessions((current) =>
        current.some((s) => s.id === session.id) ? current : [session, ...current],
      );
      setSelectedSessionId(session.id);
      setNotice(`Sala ${session.room_code} pronta para atendimento.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao abrir a sala.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateSession(
    patch: Parameters<typeof atualizarSessaoTeleconsulta>[0],
  ) {
    setBusy(true);
    setErrorMessage('');
    setNotice('');
    try {
      const { session } = await atualizarSessaoTeleconsulta(patch);
      setSessions((current) =>
        current.map((item) => (item.id === session.id ? session : item)),
      );
      setNotice('Estado da sala atualizado.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao atualizar a sala.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSession || !messageText.trim()) return;
    setBusy(true);
    setErrorMessage('');
    try {
      const { message } = await enviarMensagemTeleconsulta({
        sessionId: selectedSession.id,
        message: messageText,
      });
      setMessages((current) =>
        current.some((m) => m.id === message.id) ? current : [...current, message],
      );
      setMessageText('');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Erro ao enviar mensagem.',
      );
    } finally {
      setBusy(false);
    }
  }

  const isSessionVet = selectedSession?.veterinarian_id === currentUserId;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Sala de teleconsulta"
        description="Atendimento remoto com chat em tempo real, registro de consentimento e acesso direto ao prontuário SOAP."
        action={
          <Link
            className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-[#153b50] hover:bg-[#ebf5ff]"
            href="/agendamento"
          >
            Ver agendamentos
          </Link>
        }
      />

      {errorMessage && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          <p>{errorMessage}</p>
          <Button onClick={() => void loadData()} type="button" variant="outline">
            Tentar novamente
          </Button>
        </div>
      )}
      {notice && (
        <p
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card
            title="Consultas habilitadas"
            description="Teleconsultas confirmadas ou concluídas."
          >
            {appointments.length === 0 ? (
              <EmptyState
                title="Nenhuma teleconsulta disponível"
                description="As salas ficam liberadas após a confirmação de uma teleconsulta."
              />
            ) : (
              <ul className="grid gap-3">
                {appointments.map((apt) => {
                  const session = sessions.find((s) => s.appointment_id === apt.id);
                  const active = session?.id === selectedSessionId;
                  return (
                    <li
                      className={`rounded-xl border p-3 ${
                        active
                          ? 'border-[#087a68] bg-[#ebf5ff]'
                          : 'border-slate-200 bg-white'
                      }`}
                      key={apt.id}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-[#153b50]">
                            {apt.pet?.name ?? 'Paciente'}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {formatDateTime(apt.starts_at)}
                          </p>
                        </div>
                        {session ? (
                          <Badge variant={statusVariants[session.status]}>
                            {statusLabels[session.status]}
                          </Badge>
                        ) : (
                          <Badge variant="info">Pronta</Badge>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {session ? (
                          <Button
                            className="min-h-9 px-3 text-xs"
                            onClick={() => setSelectedSessionId(session.id)}
                            type="button"
                            variant={active ? 'secondary' : 'outline'}
                          >
                            {active ? 'Sala aberta' : 'Entrar na sala'}
                          </Button>
                        ) : (
                          <Button
                            className="min-h-9 px-3 text-xs"
                            disabled={busy}
                            onClick={() => void handleOpenRoom(apt.id)}
                            type="button"
                            variant="secondary"
                          >
                            Abrir sala
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card
            title={
              selectedSession
                ? `Sala ${selectedSession.room_code}`
                : 'Selecione uma teleconsulta'
            }
            description={
              selectedSession
                ? `Paciente: ${appointmentById.get(selectedSession.appointment_id)?.pet?.name ?? 'Pet'}`
                : 'Escolha uma consulta ao lado para iniciar a sessão.'
            }
          >
            {!selectedSession ? (
              <EmptyState
                title="Nenhuma sala selecionada"
                description="Abra ou selecione uma sala de teleconsulta na coluna ao lado."
              />
            ) : (
              <div className="grid gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#153b50] p-5 text-white">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#35c6b0]">
                      Ambiente clínico seguro · {selectedSession.room_code}
                    </p>
                    <p className="mt-1 text-lg font-bold">
                      Status: {statusLabels[selectedSession.status]}
                    </p>
                    <p className="mt-1 text-xs text-slate-200">
                      Consentimento de registro:{' '}
                      {selectedSession.recording_consent ? 'Autorizado' : 'Não autorizado'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isSessionVet && selectedSession.status === 'waiting' && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void handleUpdateSession({
                            sessionId: selectedSession.id,
                            status: 'in_progress',
                          })
                        }
                        type="button"
                        variant="secondary"
                      >
                        Iniciar atendimento
                      </Button>
                    )}
                    {isSessionVet && selectedSession.status === 'in_progress' && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void handleUpdateSession({
                            sessionId: selectedSession.id,
                            status: 'ended',
                          })
                        }
                        type="button"
                        variant="danger"
                      >
                        Encerrar sala
                      </Button>
                    )}
                    {isSessionVet && (
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void handleUpdateSession({
                            sessionId: selectedSession.id,
                            recording_consent: !selectedSession.recording_consent,
                          })
                        }
                        type="button"
                        variant="outline"
                      >
                        {selectedSession.recording_consent
                          ? 'Revogar gravação'
                          : 'Autorizar gravação'}
                      </Button>
                    )}
                    <Link
                      className="inline-flex min-h-10 items-center rounded-lg bg-white px-4 text-sm font-semibold text-[#153b50]"
                      href={`/prontuarios/${selectedSession.appointment_id}`}
                    >
                      Abrir prontuário SOAP
                    </Link>
                    {isSessionVet && (
                      <Link
                        className="inline-flex min-h-10 items-center rounded-lg border border-white/40 bg-white/10 px-4 text-sm font-semibold text-white hover:bg-white/20"
                        href={`/receitas?appointmentId=${selectedSession.appointment_id}`}
                      >
                        Rascunho de receita
                      </Link>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-[#f6faff] p-4">
                  <h3 className="text-sm font-bold text-[#153b50]">
                    Chat da teleconsulta
                  </h3>
                  <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1">
                    {messages.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        Nenhuma mensagem enviada nesta sessão.
                      </p>
                    ) : (
                      messages.map((msg) => {
                        const mine = msg.sender_id === currentUserId;
                        return (
                          <div
                            className={`rounded-xl p-3 text-sm ${
                              mine
                                ? 'ml-auto max-w-[85%] bg-[#006b57] text-white'
                                : 'mr-auto max-w-[85%] bg-white text-[#153b50] shadow-sm'
                            }`}
                            key={msg.id}
                          >
                            <p className="text-[11px] font-bold opacity-80">
                              {msg.sender_name} · {formatDateTime(msg.created_at)}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap">{msg.message}</p>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <form
                    className="mt-3 flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => void handleSendMessage(event)}
                  >
                    <div className="flex-1">
                      <Input
                        aria-label="Mensagem da teleconsulta"
                        disabled={busy || selectedSession.status === 'ended'}
                        maxLength={2000}
                        onChange={(event) => setMessageText(event.target.value)}
                        placeholder={
                          selectedSession.status === 'ended'
                            ? 'Sala encerrada para novas mensagens.'
                            : 'Escreva uma orientação ou pergunta na sala...'
                        }
                        value={messageText}
                      />
                    </div>
                    <Button
                      disabled={
                        busy ||
                        selectedSession.status === 'ended' ||
                        !messageText.trim()
                      }
                      type="submit"
                      variant="secondary"
                    >
                      Enviar
                    </Button>
                  </form>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
