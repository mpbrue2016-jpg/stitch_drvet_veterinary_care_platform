'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Radio,
  Video,
  VideoOff,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Skeleton,
} from '@/components/ui';
import { getSupabaseClient } from '@/lib/supabase';
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

type CallState = 'idle' | 'connecting' | 'connected' | 'error';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
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

  // WebRTC state
  const [callState, setCallState] = useState<CallState>('idle');
  const [callError, setCallError] = useState('');
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [remoteConnected, setRemoteConnected] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalChannelRef = useRef<ReturnType<
    ReturnType<typeof getSupabaseClient>['channel']
  > | null>(null);
  const makingOfferRef = useRef(false);

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

  const stopCall = useCallback((notifyPeer = true) => {
    if (notifyPeer && signalChannelRef.current) {
      void signalChannelRef.current.send({
        type: 'broadcast',
        event: 'signal',
        payload: { kind: 'bye', senderId: currentUserId },
      });
    }

    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (signalChannelRef.current) {
      const supabase = getSupabaseClient();
      void supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }

    makingOfferRef.current = false;
    setRemoteConnected(false);
    setCallState('idle');
    setMicEnabled(true);
    setCamEnabled(true);
  }, [currentUserId]);

  useEffect(() => {
    return () => {
      stopCall(false);
    };
  }, [stopCall]);

  useEffect(() => {
    stopCall(false);
  }, [selectedSessionId, stopCall]);

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

  const startCall = useCallback(async () => {
    if (!selectedSession || !currentUserId) return;
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      setCallError(
        'Seu navegador atual não suporta captura de câmera/áudio WebRTC nesta janela.',
      );
      setCallState('error');
      return;
    }

    stopCall(false);
    setCallError('');
    setCallState('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      const remoteStream = new MediaStream();
      pc.ontrack = (event) => {
        event.streams[0]?.getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setRemoteConnected(true);
        setCallState('connected');
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setRemoteConnected(true);
          setCallState('connected');
        } else if (
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'failed'
        ) {
          setRemoteConnected(false);
        }
      };

      const isPolite = selectedSession.tutor_id === currentUserId;
      const supabase = getSupabaseClient();
      const channel = supabase.channel(`webrtc-${selectedSession.room_code}`, {
        config: { broadcast: { self: false } },
      });
      signalChannelRef.current = channel;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: {
              kind: 'ice',
              senderId: currentUserId,
              candidate: event.candidate.toJSON(),
            },
          });
        }
      };

      const sendOffer = async () => {
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          await channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: {
              kind: 'offer',
              senderId: currentUserId,
              sdp: pc.localDescription,
            },
          });
        } finally {
          makingOfferRef.current = false;
        }
      };

      pc.onnegotiationneeded = () => {
        void sendOffer();
      };

      channel.on('broadcast', { event: 'signal' }, async ({ payload }) => {
        const msg = payload as {
          kind?: string;
          senderId?: string;
          sdp?: RTCSessionDescriptionInit;
          candidate?: RTCIceCandidateInit;
        };
        if (!msg || msg.senderId === currentUserId) return;

        try {
          if (msg.kind === 'ready') {
            await sendOffer();
            return;
          }

          if (msg.kind === 'bye') {
            setRemoteConnected(false);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = null;
            }
            return;
          }

          if (msg.kind === 'offer' && msg.sdp) {
            const offerCollision =
              makingOfferRef.current || pc.signalingState !== 'stable';
            if (offerCollision && !isPolite) {
              return;
            }
            if (offerCollision) {
              await Promise.all([
                pc.setLocalDescription({ type: 'rollback' }),
                pc.setRemoteDescription(msg.sdp),
              ]);
            } else {
              await pc.setRemoteDescription(msg.sdp);
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await channel.send({
              type: 'broadcast',
              event: 'signal',
              payload: {
                kind: 'answer',
                senderId: currentUserId,
                sdp: pc.localDescription,
              },
            });
          } else if (msg.kind === 'answer' && msg.sdp) {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(msg.sdp);
            }
          } else if (msg.kind === 'ice' && msg.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          }
        } catch {
          // Ignora pacotes de sinalização fora de ordem durante reconexão.
        }
      });

      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: { kind: 'ready', senderId: currentUserId },
          });
        }
      });
    } catch (err) {
      stopCall(false);
      setCallError(
        err instanceof Error
          ? err.message
          : 'Não foi possível acessar câmera ou microfone. Verifique as permissões do navegador.',
      );
      setCallState('error');
    }
  }, [currentUserId, selectedSession, stopCall]);

  function toggleMic() {
    if (!localStreamRef.current) return;
    const next = !micEnabled;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicEnabled(next);
  }

  function toggleCam() {
    if (!localStreamRef.current) return;
    const next = !camEnabled;
    localStreamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCamEnabled(next);
  }

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
      if (patch.status === 'ended') {
        stopCall(true);
      }
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
        description="Atendimento remoto com vídeo/áudio WebRTC em tempo real, chat clínico, registro de consentimento e acesso direto ao prontuário SOAP."
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
                        Prescrição &amp; QR
                      </Link>
                    )}
                  </div>
                </div>

                {/* Vídeo e Áudio WebRTC P2P com sinalização via Supabase Realtime */}
                <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <Radio
                        className={`h-4 w-4 ${
                          remoteConnected
                            ? 'text-emerald-400'
                            : callState === 'connecting'
                              ? 'animate-pulse text-amber-400'
                              : 'text-slate-400'
                        }`}
                      />
                      <span>
                        {remoteConnected
                          ? 'Vídeo e áudio conectados (P2P WebRTC)'
                          : callState === 'connecting'
                            ? 'Câmera ativa — aguardando participante remoto na sala...'
                            : 'Chamada de vídeo desativada'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {callState === 'idle' || callState === 'error' ? (
                        <Button
                          className="min-h-9 px-3 text-xs"
                          disabled={selectedSession.status === 'ended'}
                          onClick={() => void startCall()}
                          type="button"
                          variant="secondary"
                        >
                          <PhoneCall className="mr-1.5 h-3.5 w-3.5" />
                          Conectar vídeo/áudio
                        </Button>
                      ) : (
                        <>
                          <button
                            aria-label={micEnabled ? 'Silenciar microfone' : 'Ativar microfone'}
                            className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${
                              micEnabled
                                ? 'bg-slate-800 text-white hover:bg-slate-700'
                                : 'bg-rose-600 text-white'
                            }`}
                            onClick={toggleMic}
                            type="button"
                          >
                            {micEnabled ? (
                              <Mic className="h-3.5 w-3.5" />
                            ) : (
                              <MicOff className="h-3.5 w-3.5" />
                            )}
                            <span>{micEnabled ? 'Microfone' : 'Mudo'}</span>
                          </button>
                          <button
                            aria-label={camEnabled ? 'Desligar câmera' : 'Ligar câmera'}
                            className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold ${
                              camEnabled
                                ? 'bg-slate-800 text-white hover:bg-slate-700'
                                : 'bg-rose-600 text-white'
                            }`}
                            onClick={toggleCam}
                            type="button"
                          >
                            {camEnabled ? (
                              <Video className="h-3.5 w-3.5" />
                            ) : (
                              <VideoOff className="h-3.5 w-3.5" />
                            )}
                            <span>{camEnabled ? 'Câmera' : 'Sem vídeo'}</span>
                          </button>
                          <button
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
                            onClick={() => stopCall(true)}
                            type="button"
                          >
                            <PhoneOff className="h-3.5 w-3.5" />
                            <span>Desconectar</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {callError && (
                    <p className="mb-3 rounded-xl bg-rose-950/80 p-3 text-xs text-rose-200">
                      {callError}
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
                      <video
                        autoPlay
                        className="h-full w-full object-cover"
                        playsInline
                        ref={remoteVideoRef}
                      />
                      {!remoteConnected && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-xs text-slate-400">
                          <Video className="mb-2 h-7 w-7 text-slate-600" />
                          <p>
                            {callState === 'connecting'
                              ? 'Aguardando o outro participante clicar em "Conectar vídeo/áudio" nesta mesma sala.'
                              : 'Clique em "Conectar vídeo/áudio" para iniciar a chamada de vídeo ao vivo com o tutor/veterinário.'}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900 sm:aspect-auto sm:h-full">
                      <video
                        autoPlay
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        ref={localVideoRef}
                      />
                      <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                        Sua câmera
                      </span>
                    </div>
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
