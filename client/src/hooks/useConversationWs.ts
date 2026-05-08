import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

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

export function useConversationWs(conversationId: string | undefined, enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  useEffect(() => {
    if (!enabled || !conversationId) return;

    const messagesKey = () => ["/api/conversations", conversationIdRef.current, "messages"];
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
        if (!old) return old;
        return updater(old);
      });
    };

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "subscribe_conversation", conversationId }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === "conversation_message" && data.payload) {
            const payload = data.payload as ConversationMessageWithAuthor;
            if (payload.conversationId !== conversationIdRef.current) return;
            queryClient.setQueryData<ConversationMessageWithAuthor[]>(
              messagesKey(),
              (old) => {
                if (!old) return old;
                if (old.some((m) => m.id === payload.id)) return old;
                return [...old, payload];
              }
            );
          } else if (data.type === "conversation_seen" && data.payload) {
            const payload = data.payload as ConversationSeenPayload;
            if (payload.conversationId !== conversationIdRef.current) return;
            queryClient.setQueryData(
              ["/api/conversations", conversationIdRef.current],
              (old: unknown) => {
                if (!old || typeof old !== "object" || old === null) return old;
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
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (conversationIdRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "unsubscribe_conversation", conversationId }));
        }
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled, conversationId]);
}
