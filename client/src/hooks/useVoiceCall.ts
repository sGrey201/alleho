import { useCallback, useEffect, useRef, useState } from "react";
import {
  LocalAudioTrack,
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type Participant,
} from "livekit-client";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { t } from "@/lib/i18n";
import type { ConversationCallWsEvent } from "@/hooks/useConversationWs";

export type CallParticipantDto = {
  userId: string;
  status: "invited" | "joined" | "declined" | "missed" | "left";
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    profileImageUrl: string | null;
  };
};

export type CallStateDto = {
  id: string;
  conversationId: string;
  status: "ringing" | "active" | "ended" | "cancelled";
  initiatedByUserId: string;
  startedAt: string | null;
  ringExpiresAt: string | null;
  participants: CallParticipantDto[];
};

type ConnectionStatus = "idle" | "connecting" | "in-room";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function configureRemoteAudioElement(el: HTMLAudioElement) {
  el.style.display = "none";
  el.autoplay = true;
  el.setAttribute("playsinline", "true");
  el.setAttribute("webkit-playsinline", "true");
}

async function playRemoteAudioElement(el: HTMLAudioElement) {
  configureRemoteAudioElement(el);
  try {
    await el.play();
  } catch {
    // Safari may block until the next user gesture; resume on visibilitychange.
  }
}

export type VoiceCallApi = {
  call: CallStateDto | null;
  /** True when the local user is connected to the LiveKit room. */
  isInRoom: boolean;
  isConnecting: boolean;
  isStarting: boolean;
  micEnabled: boolean;
  /** userIds currently connected to the audio room. */
  connectedUserIds: string[];
  /** userIds currently speaking (active speakers). */
  speakingUserIds: string[];
  startCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  leaveCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMic: () => Promise<void>;
  handleCallWsEvent: (event: ConversationCallWsEvent) => void;
};

export function useVoiceCall(
  conversationId: string | undefined,
  currentUserId: string | undefined
): VoiceCallApi {
  const { toast } = useToast();
  const [call, setCall] = useState<CallStateDto | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [isStarting, setIsStarting] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [connectedUserIds, setConnectedUserIds] = useState<string[]>([]);
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);

  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const conversationIdRef = useRef(conversationId);
  const micEnabledRef = useRef(micEnabled);
  const statusRef = useRef<ConnectionStatus>(status);
  const backgroundNoticeShownRef = useRef(false);
  conversationIdRef.current = conversationId;
  micEnabledRef.current = micEnabled;
  statusRef.current = status;

  const detachAllAudio = useCallback(() => {
    audioElsRef.current.forEach((el) => {
      el.pause();
      el.srcObject = null;
      el.remove();
    });
    audioElsRef.current.clear();
  }, []);

  const teardownRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    detachAllAudio();
    setConnectedUserIds([]);
    setSpeakingUserIds([]);
    setStatus("idle");
    if (room) {
      try {
        await room.disconnect();
      } catch {
        // ignore
      }
    }
  }, [detachAllAudio]);

  const updateParticipants = useCallback((room: Room) => {
    const ids: string[] = [];
    if (room.localParticipant?.identity) ids.push(room.localParticipant.identity);
    room.remoteParticipants.forEach((p) => {
      if (p.identity) ids.push(p.identity);
    });
    setConnectedUserIds(Array.from(new Set(ids)));
  }, []);

  const resumeRemoteAudio = useCallback(() => {
    audioElsRef.current.forEach((el) => {
      void playRemoteAudioElement(el);
    });
    const room = roomRef.current;
    if (room) {
      void room.startAudio().catch(() => {});
    }
  }, []);

  const resumeLocalMicrophone = useCallback(async (room: Room) => {
    if (!micEnabledRef.current) return;
    try {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const track = pub?.track;
      if (track instanceof LocalAudioTrack) {
        const mediaTrack = track.mediaStreamTrack;
        if (mediaTrack.readyState === "ended" || mediaTrack.muted) {
          await track.restartTrack();
        } else {
          await track.unmute();
        }
      } else {
        await room.localParticipant.setMicrophoneEnabled(false);
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      setMicEnabled(true);
    } catch (err) {
      console.error("[VoiceCall] resume mic error:", err);
    }
  }, []);

  const handleAppForeground = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    const room = roomRef.current;
    if (!room || statusRef.current !== "in-room") return;
    backgroundNoticeShownRef.current = false;
    resumeRemoteAudio();
    await resumeLocalMicrophone(room);
  }, [resumeLocalMicrophone, resumeRemoteAudio]);

  const handleAppBackground = useCallback(() => {
    if (document.visibilityState !== "hidden") return;
    if (statusRef.current !== "in-room" || backgroundNoticeShownRef.current) return;
    if (!isIOS()) return;
    backgroundNoticeShownRef.current = true;
    toast({
      title: t.voiceCallMicBackgroundPaused ?? "Микрофон приостановлен",
      description:
        t.voiceCallMicBackgroundPausedHint ??
        "На iOS микрофон не работает, пока приложение свёрнуто или экран заблокирован. Вернитесь в чат, чтобы вас снова было слышно.",
    });
  }, [toast]);

  const connectToRoom = useCallback(
    async (livekitUrl: string, token: string) => {
      // Tear down any prior room first.
      await teardownRoom();
      setStatus("connecting");
      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        // WebAudio is suspended by iOS in background; HTMLAudio keeps playback alive.
        webAudioMix: false,
        // Stay in the call when the PWA is minimized or the screen locks.
        disconnectOnPageLeave: false,
      });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const el = track.attach() as HTMLAudioElement;
        configureRemoteAudioElement(el);
        document.body.appendChild(el);
        audioElsRef.current.set(participant.identity + ":" + track.sid, el);
        void playRemoteAudioElement(el);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        const key = participant.identity + ":" + track.sid;
        const el = audioElsRef.current.get(key);
        if (el) {
          el.pause();
          el.srcObject = null;
          el.remove();
          audioElsRef.current.delete(key);
        }
        track.detach();
      });
      room.on(RoomEvent.ParticipantConnected, () => updateParticipants(room));
      room.on(RoomEvent.ParticipantDisconnected, () => updateParticipants(room));
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        setSpeakingUserIds(speakers.map((s) => s.identity).filter(Boolean));
      });
      room.on(RoomEvent.Disconnected, () => {
        void teardownRoom();
      });
      room.on(RoomEvent.MediaDevicesError, () => {
        if (document.visibilityState === "visible") {
          void resumeLocalMicrophone(room);
        }
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (document.visibilityState === "visible") {
          resumeRemoteAudio();
        }
      });
      room.localParticipant.on(ParticipantEvent.TrackMuted, (publication) => {
        if (
          publication.source !== Track.Source.Microphone ||
          !micEnabledRef.current ||
          document.visibilityState !== "visible"
        ) {
          return;
        }
        void resumeLocalMicrophone(room);
      });

      try {
        await room.connect(livekitUrl, token);
        await room.startAudio().catch(() => {});
        await room.localParticipant.setMicrophoneEnabled(true);
        setMicEnabled(true);
        setStatus("in-room");
        updateParticipants(room);
      } catch (err) {
        console.error("[VoiceCall] room connect error:", err);
        toast({
          title: t.voiceCallConnectError ?? "Не удалось подключиться к звонку",
          variant: "destructive",
        });
        await teardownRoom();
        throw err;
      }
    },
    [resumeLocalMicrophone, resumeRemoteAudio, teardownRoom, toast, updateParticipants]
  );

  const refetchActiveCall = useCallback(async () => {
    const convId = conversationIdRef.current;
    if (!convId) return;
    try {
      const res = await apiRequest("GET", `/api/conversations/${convId}/calls/active`);
      const data = (await res.json()) as { call: CallStateDto | null };
      setCall(data.call);
    } catch (err) {
      console.error("[VoiceCall] refetch active error:", err);
    }
  }, []);

  const startCall = useCallback(async () => {
    const convId = conversationIdRef.current;
    if (!convId) return;
    setIsStarting(true);
    try {
      const res = await apiRequest("POST", `/api/conversations/${convId}/calls`);
      const data = (await res.json()) as {
        call: CallStateDto;
        token: string;
        livekitUrl: string;
      };
      setCall(data.call);
      await connectToRoom(data.livekitUrl, data.token);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.startsWith("409")) {
        toast({ title: t.voiceCallAlreadyActive ?? "Конференция уже идёт" });
        await refetchActiveCall();
      } else if (msg.startsWith("503")) {
        toast({ title: t.voiceCallNotConfigured ?? "Звонки недоступны", variant: "destructive" });
      } else {
        console.error("[VoiceCall] start error:", err);
        toast({ title: t.voiceCallStartError ?? "Не удалось начать звонок", variant: "destructive" });
      }
    } finally {
      setIsStarting(false);
    }
  }, [connectToRoom, refetchActiveCall, toast]);

  const acceptCall = useCallback(async () => {
    const convId = conversationIdRef.current;
    const activeCall = call;
    if (!convId || !activeCall) return;
    try {
      const res = await apiRequest(
        "POST",
        `/api/conversations/${convId}/calls/${activeCall.id}/accept`
      );
      const data = (await res.json()) as {
        call: CallStateDto;
        token: string;
        livekitUrl: string;
      };
      setCall(data.call);
      await connectToRoom(data.livekitUrl, data.token);
    } catch (err) {
      console.error("[VoiceCall] accept error:", err);
      toast({ title: t.voiceCallConnectError ?? "Не удалось подключиться к звонку", variant: "destructive" });
    }
  }, [call, connectToRoom, toast]);

  const declineCall = useCallback(async () => {
    const convId = conversationIdRef.current;
    const activeCall = call;
    if (!convId || !activeCall) return;
    setCall(null);
    try {
      await apiRequest("POST", `/api/conversations/${convId}/calls/${activeCall.id}/decline`);
    } catch (err) {
      console.error("[VoiceCall] decline error:", err);
    }
  }, [call]);

  const leaveCall = useCallback(async () => {
    const convId = conversationIdRef.current;
    const activeCall = call;
    await teardownRoom();
    if (!convId || !activeCall) return;
    try {
      await apiRequest("POST", `/api/conversations/${convId}/calls/${activeCall.id}/leave`);
    } catch (err) {
      console.error("[VoiceCall] leave error:", err);
    }
  }, [call, teardownRoom]);

  const endCall = useCallback(async () => {
    const convId = conversationIdRef.current;
    const activeCall = call;
    await teardownRoom();
    if (!convId || !activeCall) return;
    try {
      await apiRequest("POST", `/api/conversations/${convId}/calls/${activeCall.id}/end`);
    } catch (err) {
      console.error("[VoiceCall] end error:", err);
    }
  }, [call, teardownRoom]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      setMicEnabled(next);
    } catch (err) {
      console.error("[VoiceCall] toggle mic error:", err);
    }
  }, [micEnabled]);

  const handleCallWsEvent = useCallback(
    (event: ConversationCallWsEvent) => {
      switch (event.type) {
        case "conversation_call_started": {
          const payload = event.payload as CallStateDto;
          setCall(payload);
          break;
        }
        case "conversation_call_ended": {
          setCall(null);
          void teardownRoom();
          break;
        }
        case "conversation_call_accepted":
        case "conversation_call_declined":
        case "conversation_call_joined":
        case "conversation_call_left": {
          void refetchActiveCall();
          break;
        }
      }
    },
    [refetchActiveCall, teardownRoom]
  );

  // iOS suspends microphone capture when the PWA is backgrounded; resume on return.
  useEffect(() => {
    if (status !== "in-room") return;

    const onVisible = () => {
      void handleAppForeground();
    };
    const onHidden = () => {
      handleAppBackground();
    };

    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [handleAppBackground, handleAppForeground, status]);

  // Prevent screen lock during a call so the mic is not cut off by iOS.
  useEffect(() => {
    if (status !== "in-room" || !("wakeLock" in navigator)) return;

    let wakeLock: WakeLockSentinel | null = null;
    let cancelled = false;

    const requestWakeLock = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        await wakeLock?.release();
      } catch {
        // ignore
      }
      wakeLock = null;
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        // Permission denied or unsupported — call still works with screen on.
      }
    };

    void requestWakeLock();
    document.addEventListener("visibilitychange", requestWakeLock);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", requestWakeLock);
      void wakeLock?.release();
    };
  }, [status]);

  // Restore active call when opening a conversation.
  useEffect(() => {
    setCall(null);
    void teardownRoom();
    if (!conversationId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiRequest("GET", `/api/conversations/${conversationId}/calls/active`);
        const data = (await res.json()) as { call: CallStateDto | null };
        if (!cancelled) setCall(data.call);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Disconnect on unmount.
  useEffect(() => {
    return () => {
      void teardownRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    call,
    isInRoom: status === "in-room",
    isConnecting: status === "connecting",
    isStarting,
    micEnabled,
    connectedUserIds,
    speakingUserIds,
    startCall,
    acceptCall,
    declineCall,
    leaveCall,
    endCall,
    toggleMic,
    handleCallWsEvent,
  };
}
