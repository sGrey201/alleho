import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type Participant,
} from "livekit-client";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { t } from "@/lib/i18n";
import type { ConversationCallWsEvent } from "@/hooks/useConversationWs";
import type { CallStateDto, VoiceCallApi } from "@/hooks/useVoiceCall";

type ConnectionStatus = "idle" | "connecting" | "in-room";

type ConversationMeta = {
  id: string;
  type: string;
  title: string;
  path: string;
};

export type VoiceCallContextValue = VoiceCallApi & {
  /** Call for the conversation currently open in chat UI (banner). */
  viewingCall: CallStateDto | null;
  /** Call the local user is connected to (may differ from viewingCall). */
  roomCall: CallStateDto | null;
  callUiExpanded: boolean;
  setCallUiExpanded: (open: boolean) => void;
  displayTitle: string;
  conversationPath: string | null;
  setViewingConversationId: (conversationId: string | undefined) => void;
  startCallFor: (conversationId: string, meta?: Partial<ConversationMeta>) => Promise<void>;
  acceptCallFor: (conversationId: string, meta?: Partial<ConversationMeta>) => Promise<void>;
  declineCallFor: (conversationId: string) => Promise<void>;
};

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

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
    // Safari may block until the next user gesture.
  }
}

function participantDisplayName(user: CallStateDto["participants"][number]["user"]): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  return user.email?.split("@")[0] ?? t.voiceCallStart;
}

function pathForConversation(type: string, id: string): string {
  switch (type) {
    case "group":
      return `/messenger/group/${id}`;
    case "channel":
      return `/messenger/channel/${id}`;
    case "patient":
      return `/messenger/chat/${id}`;
    case "direct":
    case "consilium":
    default:
      return `/messenger/direct/${id}`;
  }
}

function titleFromCall(call: CallStateDto, currentUserId: string | undefined): string {
  const others = call.participants.filter((p) => p.userId !== currentUserId);
  if (others.length === 1) return participantDisplayName(others[0].user);
  if (others.length > 1) {
    return `${t.voiceCallStart} · ${others.length + 1}`;
  }
  const self = call.participants.find((p) => p.userId === currentUserId);
  return self ? participantDisplayName(self.user) : t.voiceCallStart;
}

async function fetchConversationMeta(
  conversationId: string,
  currentUserId: string | undefined
): Promise<ConversationMeta | null> {
  try {
    const res = await fetch(`/api/conversations/${conversationId}`, { credentials: "include" });
    if (!res.ok) return null;
    const conv = (await res.json()) as {
      id: string;
      type: string;
      name?: string | null;
      myDisplayName?: string | null;
      otherParticipantName?: string | null;
      participants?: Array<{
        userId: string;
        user?: {
          firstName?: string | null;
          lastName?: string | null;
          email?: string | null;
        };
      }>;
    };
    let title =
      conv.myDisplayName?.trim() ||
      conv.name?.trim() ||
      conv.otherParticipantName?.trim() ||
      "";
    if (!title && conv.type === "direct") {
      const other = conv.participants?.find((p) => p.userId !== currentUserId)?.user;
      if (other) {
        title =
          [other.firstName, other.lastName].filter(Boolean).join(" ").trim() ||
          other.email?.split("@")[0] ||
          "";
      }
    }
    if (!title) title = t.voiceCallStart;
    return {
      id: conversationId,
      type: conv.type,
      title,
      path: pathForConversation(conv.type, conversationId),
    };
  } catch {
    return null;
  }
}

export function VoiceCallProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const currentUserId = user?.id;

  const [viewingConversationId, setViewingConversationId] = useState<string | undefined>();
  const [viewingCall, setViewingCall] = useState<CallStateDto | null>(null);
  const [roomCall, setRoomCall] = useState<CallStateDto | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [isStarting, setIsStarting] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [connectedUserIds, setConnectedUserIds] = useState<string[]>([]);
  const [speakingUserIds, setSpeakingUserIds] = useState<string[]>([]);
  const [callUiExpanded, setCallUiExpanded] = useState(false);
  const [conversationMeta, setConversationMeta] = useState<ConversationMeta | null>(null);

  const roomRef = useRef<Room | null>(null);
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const statusRef = useRef<ConnectionStatus>(status);
  const roomCallRef = useRef<CallStateDto | null>(null);
  const viewingConversationIdRef = useRef(viewingConversationId);
  const intentionalDisconnectRef = useRef(false);
  statusRef.current = status;
  roomCallRef.current = roomCall;
  viewingConversationIdRef.current = viewingConversationId;

  const detachAllAudio = useCallback(() => {
    audioElsRef.current.forEach((el) => {
      el.pause();
      el.srcObject = null;
      el.remove();
    });
    audioElsRef.current.clear();
  }, []);

  const disconnectRoomOnly = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    detachAllAudio();
    setConnectedUserIds([]);
    setSpeakingUserIds([]);
    setStatus("idle");
    if (room) {
      intentionalDisconnectRef.current = true;
      try {
        await room.disconnect();
      } catch {
        // ignore
      } finally {
        intentionalDisconnectRef.current = false;
      }
    }
  }, [detachAllAudio]);

  const teardownRoom = useCallback(async () => {
    await disconnectRoomOnly();
    setRoomCall(null);
    setCallUiExpanded(false);
    setConversationMeta(null);
  }, [disconnectRoomOnly]);

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

  const handleAppForeground = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (statusRef.current !== "in-room") return;
    resumeRemoteAudio();
  }, [resumeRemoteAudio]);

  const connectToRoom = useCallback(
    async (livekitUrl: string, token: string) => {
      await disconnectRoomOnly();
      setStatus("connecting");
      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        webAudioMix: false,
        disconnectOnPageLeave: false,
      });
      roomRef.current = room;

      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach() as HTMLAudioElement;
          configureRemoteAudioElement(el);
          document.body.appendChild(el);
          audioElsRef.current.set(participant.identity + ":" + track.sid, el);
          void playRemoteAudioElement(el);
        }
      );
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
        if (intentionalDisconnectRef.current) return;
        if (roomRef.current !== room) return;
        void teardownRoom();
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (document.visibilityState === "visible") {
          resumeRemoteAudio();
        }
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
    [disconnectRoomOnly, resumeRemoteAudio, teardownRoom, toast, updateParticipants]
  );

  const refetchViewingCall = useCallback(async (conversationId: string | undefined) => {
    if (!conversationId) {
      setViewingCall(null);
      return;
    }
    try {
      const res = await apiRequest("GET", `/api/conversations/${conversationId}/calls/active`);
      const data = (await res.json()) as { call: CallStateDto | null };
      setViewingCall(data.call);
    } catch (err) {
      console.error("[VoiceCall] refetch viewing call error:", err);
    }
  }, []);

  const refetchRoomCall = useCallback(async () => {
    const convId = roomCallRef.current?.conversationId;
    if (!convId) return;
    try {
      const res = await apiRequest("GET", `/api/conversations/${convId}/calls/active`);
      const data = (await res.json()) as { call: CallStateDto | null };
      if (!data.call) {
        await teardownRoom();
        return;
      }
      setRoomCall(data.call);
      if (viewingConversationIdRef.current === convId) {
        setViewingCall(data.call);
      }
    } catch (err) {
      console.error("[VoiceCall] refetch room call error:", err);
    }
  }, [teardownRoom]);

  const resolveMeta = useCallback(
    async (conversationId: string, partial?: Partial<ConversationMeta>) => {
      if (partial?.title && partial?.type) {
        const meta: ConversationMeta = {
          id: conversationId,
          type: partial.type,
          title: partial.title,
          path: partial.path ?? pathForConversation(partial.type, conversationId),
        };
        setConversationMeta(meta);
        return meta;
      }
      const fetched = await fetchConversationMeta(conversationId, currentUserId);
      if (fetched) {
        if (partial?.title) fetched.title = partial.title;
        setConversationMeta(fetched);
        return fetched;
      }
      const fallback: ConversationMeta = {
        id: conversationId,
        type: partial?.type ?? "direct",
        title: partial?.title ?? t.voiceCallStart,
        path: partial?.path ?? pathForConversation(partial?.type ?? "direct", conversationId),
      };
      setConversationMeta(fallback);
      return fallback;
    },
    [currentUserId]
  );

  const invalidateChatList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["/api/me/chats"] });
  }, []);

  const startCallFor = useCallback(
    async (conversationId: string, meta?: Partial<ConversationMeta>) => {
      if (statusRef.current === "in-room" || statusRef.current === "connecting") {
        toast({ title: t.voiceCallAlreadyActive ?? "Конференция уже идёт" });
        return;
      }
      setIsStarting(true);
      try {
        await resolveMeta(conversationId, meta);
        const res = await apiRequest("POST", `/api/conversations/${conversationId}/calls`);
        const data = (await res.json()) as {
          call: CallStateDto;
          token: string;
          livekitUrl: string;
        };
        setRoomCall(data.call);
        if (viewingConversationIdRef.current === conversationId) {
          setViewingCall(data.call);
        }
        setCallUiExpanded(true);
        await connectToRoom(data.livekitUrl, data.token);
      } catch (err: any) {
        const msg = String(err?.message ?? "");
        if (msg.startsWith("409")) {
          toast({ title: t.voiceCallAlreadyActive ?? "Конференция уже идёт" });
          await refetchViewingCall(conversationId);
        } else if (msg.startsWith("503")) {
          toast({ title: t.voiceCallNotConfigured ?? "Звонки недоступны", variant: "destructive" });
        } else if (msg.includes("calls_disabled_in_group")) {
          toast({
            title: t.voiceCallCallsDisabledInGroup ?? "Звонки в этой группе отключены",
            variant: "destructive",
          });
        } else {
          console.error("[VoiceCall] start error:", err);
          toast({ title: t.voiceCallStartError ?? "Не удалось начать звонок", variant: "destructive" });
        }
      } finally {
        setIsStarting(false);
      }
    },
    [connectToRoom, refetchViewingCall, resolveMeta, toast]
  );

  const acceptCallFor = useCallback(
    async (conversationId: string, meta?: Partial<ConversationMeta>) => {
      let call: CallStateDto | null = null;
      try {
        const activeRes = await apiRequest("GET", `/api/conversations/${conversationId}/calls/active`);
        const activeData = (await activeRes.json()) as { call: CallStateDto | null };
        call = activeData.call;
      } catch {
        call = null;
      }
      if (!call) return;
      if (statusRef.current === "in-room" && roomCallRef.current?.id !== call.id) {
        toast({ title: t.voiceCallAlreadyActive ?? "Конференция уже идёт" });
        return;
      }
      try {
        await resolveMeta(conversationId, meta);
        const res = await apiRequest(
          "POST",
          `/api/conversations/${conversationId}/calls/${call.id}/accept`
        );
        const data = (await res.json()) as {
          call: CallStateDto;
          token: string;
          livekitUrl: string;
        };
        setRoomCall(data.call);
        if (viewingConversationIdRef.current === conversationId) {
          setViewingCall(data.call);
        }
        setCallUiExpanded(true);
        await connectToRoom(data.livekitUrl, data.token);
      } catch (err) {
        console.error("[VoiceCall] accept error:", err);
        toast({
          title: t.voiceCallConnectError ?? "Не удалось подключиться к звонку",
          variant: "destructive",
        });
      }
    },
    [connectToRoom, resolveMeta, toast]
  );

  const declineCallFor = useCallback(
    async (conversationId: string) => {
      let call: CallStateDto | null = null;
      try {
        const res = await apiRequest("GET", `/api/conversations/${conversationId}/calls/active`);
        const data = (await res.json()) as { call: CallStateDto | null };
        call = data.call;
      } catch {
        call = null;
      }
      if (!call) return;
      if (viewingConversationIdRef.current === conversationId) {
        setViewingCall(null);
      }
      try {
        await apiRequest("POST", `/api/conversations/${conversationId}/calls/${call.id}/decline`);
        invalidateChatList();
      } catch (err) {
        console.error("[VoiceCall] decline error:", err);
      }
    },
    [invalidateChatList]
  );

  const leaveCall = useCallback(async () => {
    const activeCall = roomCallRef.current;
    const convId = activeCall?.conversationId;
    await teardownRoom();
    if (convId && viewingConversationIdRef.current === convId) {
      setViewingCall(null);
    }
    if (!convId || !activeCall) return;
    try {
      await apiRequest("POST", `/api/conversations/${convId}/calls/${activeCall.id}/leave`);
      invalidateChatList();
    } catch (err) {
      console.error("[VoiceCall] leave error:", err);
    }
  }, [invalidateChatList, teardownRoom]);

  const endCall = useCallback(async () => {
    const activeCall = roomCallRef.current;
    const convId = activeCall?.conversationId;
    await teardownRoom();
    if (convId && viewingConversationIdRef.current === convId) {
      setViewingCall(null);
    }
    if (!convId || !activeCall) return;
    try {
      await apiRequest("POST", `/api/conversations/${convId}/calls/${activeCall.id}/end`);
      invalidateChatList();
    } catch (err) {
      console.error("[VoiceCall] end error:", err);
    }
  }, [invalidateChatList, teardownRoom]);

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
      invalidateChatList();
      const payload = event.payload as { conversationId?: string } & Partial<CallStateDto>;
      const eventConvId = payload?.conversationId;
      const roomConvId = roomCallRef.current?.conversationId;
      const viewingId = viewingConversationIdRef.current;

      switch (event.type) {
        case "conversation_call_started": {
          if (eventConvId && eventConvId === viewingId) {
            setViewingCall(payload as CallStateDto);
          }
          break;
        }
        case "conversation_call_ended": {
          if (eventConvId && eventConvId === roomConvId) {
            void teardownRoom();
          }
          if (eventConvId && eventConvId === viewingId) {
            setViewingCall(null);
          }
          break;
        }
        case "conversation_call_accepted":
        case "conversation_call_declined":
        case "conversation_call_joined":
        case "conversation_call_left": {
          if (eventConvId && eventConvId === roomConvId) {
            void refetchRoomCall();
          } else if (eventConvId && eventConvId === viewingId) {
            void refetchViewingCall(viewingId);
          }
          break;
        }
      }
    },
    [invalidateChatList, refetchRoomCall, refetchViewingCall, teardownRoom]
  );

  // Load ringing/active call metadata when opening a chat (does not tear down LiveKit).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!viewingConversationId) {
        if (!cancelled) setViewingCall(null);
        return;
      }
      // If we're already in this conversation's room, keep roomCall as viewingCall.
      if (roomCallRef.current?.conversationId === viewingConversationId) {
        setViewingCall(roomCallRef.current);
        return;
      }
      try {
        const res = await apiRequest(
          "GET",
          `/api/conversations/${viewingConversationId}/calls/active`
        );
        const data = (await res.json()) as { call: CallStateDto | null };
        if (!cancelled) setViewingCall(data.call);
      } catch {
        if (!cancelled) setViewingCall(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewingConversationId]);

  // Background WS for the in-room conversation (survives leaving the chat UI).
  useEffect(() => {
    const conversationId = roomCall?.conversationId;
    if (!conversationId || (status !== "in-room" && status !== "connecting")) return;

    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      ws.onopen = () => {
        if (disposed) {
          ws?.close();
          return;
        }
        ws?.send(JSON.stringify({ type: "subscribe_conversation", conversationId }));
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (typeof data.type === "string" && data.type.startsWith("conversation_call_")) {
            handleCallWsEvent(data as ConversationCallWsEvent);
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        reconnectTimeout = setTimeout(connect, 1500);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      try {
        ws?.send(JSON.stringify({ type: "unsubscribe_conversation", conversationId }));
      } catch {
        // ignore
      }
      ws?.close();
    };
  }, [handleCallWsEvent, roomCall?.conversationId, status]);

  useEffect(() => {
    if (status !== "in-room") return;
    const onVisible = () => handleAppForeground();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [handleAppForeground, status]);

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
        // ignore
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

  // Toggle document class for layout offset under the green strip.
  useEffect(() => {
    const active = status === "in-room" || status === "connecting";
    document.documentElement.classList.toggle("app-voice-call-active", active);
    return () => document.documentElement.classList.remove("app-voice-call-active");
  }, [status]);

  // Disconnect only when the provider itself unmounts (app exit / logout shell).
  useEffect(() => {
    return () => {
      void teardownRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayTitle = useMemo(() => {
    if (conversationMeta?.title) return conversationMeta.title;
    if (roomCall) return titleFromCall(roomCall, currentUserId);
    return t.voiceCallStart;
  }, [conversationMeta?.title, currentUserId, roomCall]);

  const conversationPath = conversationMeta?.path ?? null;

  const value = useMemo<VoiceCallContextValue>(() => {
    const startCall = async () => {
      const id = viewingConversationIdRef.current;
      if (!id) return;
      await startCallFor(id);
    };
    const acceptCall = async () => {
      const id = viewingConversationIdRef.current;
      if (!id) return;
      await acceptCallFor(id);
    };
    const declineCall = async () => {
      const id = viewingConversationIdRef.current;
      if (!id) return;
      await declineCallFor(id);
    };

    return {
      call: viewingCall,
      viewingCall,
      roomCall,
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
      callUiExpanded,
      setCallUiExpanded,
      displayTitle,
      conversationPath,
      setViewingConversationId,
      startCallFor,
      acceptCallFor,
      declineCallFor,
    };
  }, [
    acceptCallFor,
    callUiExpanded,
    connectedUserIds,
    conversationPath,
    declineCallFor,
    displayTitle,
    endCall,
    handleCallWsEvent,
    isStarting,
    leaveCall,
    micEnabled,
    roomCall,
    speakingUserIds,
    startCallFor,
    status,
    toggleMic,
    viewingCall,
  ]);

  return <VoiceCallContext.Provider value={value}>{children}</VoiceCallContext.Provider>;
}

export function useVoiceCallContext(): VoiceCallContextValue {
  const ctx = useContext(VoiceCallContext);
  if (!ctx) {
    throw new Error("useVoiceCallContext must be used within VoiceCallProvider");
  }
  return ctx;
}
