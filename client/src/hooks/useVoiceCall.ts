import type { ConversationCallWsEvent } from "@/hooks/useConversationWs";

/** Shared voice-call DTO types. Runtime state lives in VoiceCallProvider. */

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

export type VoiceCallApi = {
  call: CallStateDto | null;
  isInRoom: boolean;
  isConnecting: boolean;
  isStarting: boolean;
  micEnabled: boolean;
  connectedUserIds: string[];
  speakingUserIds: string[];
  startCall: () => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => Promise<void>;
  leaveCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMic: () => Promise<void>;
  handleCallWsEvent: (event: ConversationCallWsEvent) => void;
};
