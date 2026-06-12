import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";
import { postConversationSeen } from "@/lib/markConversationSeen";

export interface ConversationMessageAuthor {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin?: boolean | null;
}

export interface ConversationMessageReplyTo {
  id: string;
  authorUserId: string;
  content?: string | null;
  imageUrl?: string | null;
  messageType?: string | null;
  deletedAt?: string | null;
  author?: ConversationMessageAuthor | null;
}

export interface ConversationMessageWithAuthor {
  id: string;
  conversationId: string;
  authorUserId: string;
  messageType: string;
  content?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  pinnedAt?: string | null;
  pinnedByUserId?: string | null;
  replyToMessageId?: string | null;
  forwardedFromMessageId?: string | null;
  forwardedFromUserId?: string | null;
  replyTo?: ConversationMessageReplyTo | null;
  forwardedFromAuthor?: ConversationMessageAuthor | null;
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  commentsCount?: number;
  pollResults?: {
    voteCounts: number[];
    totalVotes: number;
    selectedOptionIndices: number[];
  };
  author: ConversationMessageAuthor;
}

export interface ConversationCommentWithAuthor {
  id: string;
  conversationId: string;
  messageId: string;
  authorUserId: string;
  content?: string | null;
  imageUrl?: string | null;
  replyToCommentId?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
  commentsCount?: number;
  author: ConversationMessageAuthor;
  replyTo?: ConversationMessageReplyTo | null;
}

type ConversationSeenPayload = {
  conversationId: string;
  userId: string;
  lastSeenAt: string;
};

type ConversationMessageEditedPayload = {
  conversationId: string;
  messageId: string;
  content: string | null;
  editedAt: string;
};

type ConversationMessageDeletedPayload = {
  conversationId: string;
  messageId: string;
  deletedAt: string;
};

type ConversationMessagePinnedPayload = {
  conversationId: string;
  messageId: string;
  pinnedAt: string;
  pinnedByUserId: string;
};

type ConversationMessageUnpinnedPayload = {
  conversationId: string;
  messageId: string;
};

type ConversationCommentEditedPayload = {
  conversationId: string;
  messageId: string;
  commentId: string;
  content: string | null;
  editedAt: string;
};

type ConversationCommentDeletedPayload = {
  conversationId: string;
  messageId: string;
  commentId: string;
  deletedAt: string;
};

type ConversationCommentReactionPayload = {
  conversationId: string;
  messageId: string;
  commentId: string;
  reactions: Array<{ emoji: string; count: number; reactedByMe: boolean }>;
};

type ConversationPollUpdatedPayload = {
  conversationId: string;
  messageId: string;
  voteCounts: number[];
  totalVotes: number;
};

export type ConversationCallWsEvent = {
  type:
    | "conversation_call_started"
    | "conversation_call_accepted"
    | "conversation_call_declined"
    | "conversation_call_joined"
    | "conversation_call_left"
    | "conversation_call_ended";
  payload: any;
};

export function useConversationWs(
  conversationId: string | undefined,
  enabled: boolean,
  currentUserId?: string,
  onCallEvent?: (event: ConversationCallWsEvent) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationIdRef = useRef(conversationId);
  const currentUserIdRef = useRef(currentUserId);
  const markSeenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kept in a ref so a changing callback identity does not reconnect the socket.
  const onCallEventRef = useRef(onCallEvent);
  conversationIdRef.current = conversationId;
  currentUserIdRef.current = currentUserId;
  onCallEventRef.current = onCallEvent;

  useEffect(() => {
    if (!enabled || !conversationId) return;

    const messagesKey = () => ["/api/conversations", conversationIdRef.current, "messages"];
    const convKey = () => ["/api/conversations", conversationIdRef.current];
    const commentsKey = (messageId: string) => [
      "/api/conversations",
      conversationIdRef.current,
      "messages",
      messageId,
      "comments",
    ];

    const updateMessages = (
      updater: (
        list: ConversationMessageWithAuthor[]
      ) => ConversationMessageWithAuthor[]
    ) => {
      queryClient.setQueryData<ConversationMessageWithAuthor[]>(messagesKey(), (old) => {
        const base = old ?? [];
        const updated = updater(base);
        return old === updated ? old : updated;
      });
    };

    const scheduleMarkSeen = () => {
      const convId = conversationIdRef.current;
      if (!convId || !currentUserIdRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (markSeenTimeoutRef.current) clearTimeout(markSeenTimeoutRef.current);
      markSeenTimeoutRef.current = setTimeout(() => {
        markSeenTimeoutRef.current = null;
        if (conversationIdRef.current !== convId) return;
        postConversationSeen(convId);
      }, 400);
    };

    let disposed = false;
    const activeConversationId = conversationId;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed || conversationIdRef.current !== activeConversationId) {
          ws.close();
          return;
        }
        ws.send(
          JSON.stringify({
            type: "subscribe_conversation",
            conversationId: activeConversationId,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (typeof data.type === "string" && data.type.startsWith("conversation_call_")) {
            const payload = data.payload as { conversationId?: string } | undefined;
            if (payload?.conversationId && payload.conversationId !== conversationIdRef.current) {
              return;
            }
            onCallEventRef.current?.(data as ConversationCallWsEvent);
            return;
          }
          if (data.type === "conversation_message" && data.payload) {
            const payload = data.payload as ConversationMessageWithAuthor;
            if (payload.conversationId !== conversationIdRef.current) return;
            queryClient.setQueryData<ConversationMessageWithAuthor[]>(
              messagesKey(),
              (old) => {
                const list = old ?? [];
                if (list.some((m) => m.id === payload.id)) return old;
                return [...list, payload];
              }
            );
            if (payload.authorUserId !== currentUserIdRef.current) {
              scheduleMarkSeen();
            }
          } else if (data.type === "conversation_seen" && data.payload) {
            const payload = data.payload as ConversationSeenPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            if (payload.userId === currentUserIdRef.current) return;
            queryClient.setQueryData(
              convKey(),
              (old: unknown) => {
                if (!old || typeof old !== "object" || old === null) {
                  return old;
                }
                const conv = old as { participants?: Array<{ userId: string; lastSeenAt?: string | null }> };
                if (!Array.isArray(conv.participants)) return old;
                return {
                  ...conv,
                  participants: conv.participants.map((participant) =>
                    participant.userId === payload.userId
                      ? { ...participant, lastSeenAt: payload.lastSeenAt }
                      : participant
                  ),
                };
              }
            );
          } else if (data.type === "conversation_message_edited" && data.payload) {
            const payload = data.payload as ConversationMessageEditedPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId
                  ? { ...m, content: payload.content, editedAt: payload.editedAt }
                  : {
                      ...m,
                      replyTo:
                        m.replyTo && m.replyTo.id === payload.messageId
                          ? { ...m.replyTo, content: payload.content }
                          : m.replyTo,
                    }
              )
            );
          } else if (data.type === "conversation_message_deleted" && data.payload) {
            const payload = data.payload as ConversationMessageDeletedPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId
                  ? {
                      ...m,
                      deletedAt: payload.deletedAt,
                      content: null,
                      imageUrl: null,
                      pinnedAt: null,
                      pinnedByUserId: null,
                    }
                  : {
                      ...m,
                      replyTo:
                        m.replyTo && m.replyTo.id === payload.messageId
                          ? { ...m.replyTo, deletedAt: payload.deletedAt, content: null, imageUrl: null }
                          : m.replyTo,
                    }
              )
            );
          } else if (data.type === "conversation_message_pinned" && data.payload) {
            const payload = data.payload as ConversationMessagePinnedPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId
                  ? { ...m, pinnedAt: payload.pinnedAt, pinnedByUserId: payload.pinnedByUserId }
                  : m
              )
            );
          } else if (data.type === "conversation_message_unpinned" && data.payload) {
            const payload = data.payload as ConversationMessageUnpinnedPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId ? { ...m, pinnedAt: null, pinnedByUserId: null } : m
              )
            );
          } else if (data.type === "conversation_comment" && data.payload) {
            const payload = data.payload as ConversationCommentWithAuthor;
            if (payload.conversationId !== conversationIdRef.current) return;
            queryClient.setQueryData<ConversationCommentWithAuthor[]>(commentsKey(payload.messageId), (old) => {
              if (!old) return [payload];
              if (old.some((comment) => comment.id === payload.id)) return old;
              return [...old, payload];
            });
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId
                  ? { ...m, commentsCount: payload.commentsCount ?? Math.max(m.commentsCount ?? 0, 0) + 1 }
                  : m
              )
            );
          } else if (data.type === "conversation_comment_edited" && data.payload) {
            const payload = data.payload as ConversationCommentEditedPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            queryClient.setQueryData<ConversationCommentWithAuthor[]>(commentsKey(payload.messageId), (old) =>
              old?.map((comment) =>
                comment.id === payload.commentId
                  ? { ...comment, content: payload.content, editedAt: payload.editedAt }
                  : comment
              )
            );
          } else if (data.type === "conversation_comment_deleted" && data.payload) {
            const payload = data.payload as ConversationCommentDeletedPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            queryClient.setQueryData<ConversationCommentWithAuthor[]>(commentsKey(payload.messageId), (old) =>
              old?.map((comment) =>
                comment.id === payload.commentId
                  ? { ...comment, deletedAt: payload.deletedAt, content: null, imageUrl: null }
                  : comment
              )
            );
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId
                  ? { ...m, commentsCount: Math.max((m.commentsCount ?? 0) - 1, 0) }
                  : m
              )
            );
          } else if (data.type === "conversation_comment_reaction" && data.payload) {
            const payload = data.payload as ConversationCommentReactionPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            queryClient.setQueryData<ConversationCommentWithAuthor[]>(commentsKey(payload.messageId), (old) =>
              old?.map((comment) =>
                comment.id === payload.commentId ? { ...comment, reactions: payload.reactions } : comment
              )
            );
          } else if (data.type === "conversation_poll_updated" && data.payload) {
            const payload = data.payload as ConversationPollUpdatedPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            updateMessages((list) =>
              list.map((m) =>
                m.id === payload.messageId && m.messageType === "poll"
                  ? {
                      ...m,
                      pollResults: {
                        voteCounts: payload.voteCounts,
                        totalVotes: payload.totalVotes,
                        selectedOptionIndices: m.pollResults?.selectedOptionIndices ?? [],
                      },
                    }
                  : m
              )
            );
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (
          !disposed &&
          conversationIdRef.current === activeConversationId &&
          conversationIdRef.current
        ) {
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (markSeenTimeoutRef.current) {
        clearTimeout(markSeenTimeoutRef.current);
        markSeenTimeoutRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "unsubscribe_conversation",
              conversationId: activeConversationId,
            })
          );
        }
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, conversationId, currentUserId]);
}
