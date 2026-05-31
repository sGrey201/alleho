import { Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";
// @ts-expect-error no types
import { parse as parseCookie } from "cookie";
// @ts-expect-error no types
import * as cookieSignature from "cookie-signature";
import { getRedisSubscriber, type ConversationMessageWithAuthor } from "./redis";
import { registerConversationBroadcaster, registerDoctorBroadcaster } from "./wsBroadcast";

const WS_PATH = "/ws";
const CONVERSATION_CHANNEL_PREFIX = "conversation:channel:";
const DOCTOR_EVENTS_CHANNEL_PREFIX = "doctor:events:";

export type SessionStore = {
  get: (sid: string, callback: (err: unknown, session?: { userId?: string } | null) => void) => void;
};

export function setupWebSocket(
  httpServer: HttpServer,
  sessionStore: SessionStore,
  sessionSecret: string
): void {
  const wss = new WebSocketServer({ noServer: true });

  const conversationChannelToSockets = new Map<string, Set<WsWebSocket>>();
  const socketToConversationChannels = new Map<WsWebSocket, Set<string>>();
  const doctorToSockets = new Map<string, Set<WsWebSocket>>();

  function subscribeSocketToConversationChannel(ws: WsWebSocket, conversationId: string): void {
    const channel = CONVERSATION_CHANNEL_PREFIX + conversationId;
    if (!conversationChannelToSockets.has(channel)) {
      conversationChannelToSockets.set(channel, new Set());
    }
    conversationChannelToSockets.get(channel)!.add(ws);
    if (!socketToConversationChannels.has(ws)) {
      socketToConversationChannels.set(ws, new Set());
    }
    socketToConversationChannels.get(ws)!.add(channel);
  }

  function unsubscribeSocketFromConversationChannel(ws: WsWebSocket, conversationId: string): void {
    const channel = CONVERSATION_CHANNEL_PREFIX + conversationId;
    const set = conversationChannelToSockets.get(channel);
    if (set) {
      set.delete(ws);
      if (set.size === 0) conversationChannelToSockets.delete(channel);
    }
    socketToConversationChannels.get(ws)?.delete(channel);
  }

  function sendToConversationChannel(conversationId: string, data: string): void {
    const channel = CONVERSATION_CHANNEL_PREFIX + conversationId;
    const sockets = conversationChannelToSockets.get(channel);
    if (!sockets || sockets.size === 0) return;
    Array.from(sockets).forEach((ws) => {
      if (ws.readyState === 1) ws.send(data);
    });
  }

  function sendToDoctor(doctorUserId: string, data: string): void {
    const sockets = doctorToSockets.get(doctorUserId);
    if (!sockets || sockets.size === 0) return;
    Array.from(sockets).forEach((ws) => {
      if (ws.readyState === 1) ws.send(data);
    });
  }

  registerConversationBroadcaster(sendToConversationChannel);
  registerDoctorBroadcaster(sendToDoctor);

  function cleanupSocket(ws: WsWebSocket): void {
    const convChannels = socketToConversationChannels.get(ws);
    if (convChannels) {
      Array.from(convChannels).forEach((ch) => {
        const set = conversationChannelToSockets.get(ch);
        if (set) {
          set.delete(ws);
          if (set.size === 0) conversationChannelToSockets.delete(ch);
        }
      });
      socketToConversationChannels.delete(ws);
    }
  }

  const redisSub = getRedisSubscriber();
  if (redisSub) {
    redisSub.on("message", (channel: string, message: string) => {
      if (channel.startsWith(CONVERSATION_CHANNEL_PREFIX)) {
        const conversationId = channel.slice(CONVERSATION_CHANNEL_PREFIX.length);
        try {
          const parsed = JSON.parse(message) as
            | { type?: string; payload?: unknown }
            | ConversationMessageWithAuthor;
          let data: string | null = null;
          const knownTypes = new Set([
            "conversation_message",
            "conversation_seen",
            "conversation_message_edited",
            "conversation_message_deleted",
            "conversation_message_pinned",
            "conversation_message_unpinned",
            "conversation_comment",
            "conversation_comment_edited",
            "conversation_comment_deleted",
            "conversation_comment_reaction",
            "conversation_poll_updated",
          ]);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "type" in parsed &&
            typeof (parsed as { type?: unknown }).type === "string" &&
            knownTypes.has((parsed as { type: string }).type) &&
            "payload" in parsed
          ) {
            data = JSON.stringify({
              type: (parsed as { type: string }).type,
              payload: (parsed as { payload: unknown }).payload,
            });
          } else {
            data = JSON.stringify({ type: "conversation_message", payload: parsed });
          }
          if (!data) return;
          sendToConversationChannel(conversationId, data);
        } catch {
          // ignore
        }
      } else if (channel.startsWith(DOCTOR_EVENTS_CHANNEL_PREFIX)) {
        const doctorUserId = channel.slice(DOCTOR_EVENTS_CHANNEL_PREFIX.length);
        try {
          const parsed = JSON.parse(message) as {
            type?: string;
            timestamp?: string;
          };
          if (parsed.type !== "doctor_chats_updated") return;
          const data = JSON.stringify({
            type: "doctor_chats_updated",
            payload: {
              timestamp: parsed.timestamp ?? null,
            },
          });
          sendToDoctor(doctorUserId, data);
        } catch {
          // ignore
        }
      }
    });
  }

  httpServer.on("upgrade", (request, socket, head) => {
    const url = request.url?.split("?")[0] || "";
    if (url !== WS_PATH) {
      socket.destroy();
      return;
    }

    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const cookies = parseCookie(cookieHeader);
    const sidCookie = cookies["connect.sid"];
    if (!sidCookie) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const sid = sidCookie.startsWith("s:")
      ? cookieSignature.unsign(sidCookie.slice(2), sessionSecret)
      : sidCookie;
    if (!sid) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    sessionStore.get(sid, (err, session) => {
      const sess = session as { userId?: string } | undefined | null;
      if (err || !sess?.userId) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request, sess.userId);
      });
    });
  });

  wss.on("connection", (ws: WsWebSocket, _req: unknown, userId: string) => {
    if (!doctorToSockets.has(userId)) {
      doctorToSockets.set(userId, new Set());
    }
    doctorToSockets.get(userId)!.add(ws);
    if (redisSub) {
      void redisSub.subscribe(DOCTOR_EVENTS_CHANNEL_PREFIX + userId);
    }

    ws.on("message", (raw: string | Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString() : "";
        const data = JSON.parse(text) as {
          type: string;
          conversationId?: string;
        };
        if (data.type === "subscribe_conversation" && data.conversationId) {
          const channel = CONVERSATION_CHANNEL_PREFIX + data.conversationId;
          const wasEmpty = !conversationChannelToSockets.has(channel);
          subscribeSocketToConversationChannel(ws, data.conversationId);
          if (redisSub && wasEmpty) redisSub.subscribe(channel);
        } else if (data.type === "unsubscribe_conversation" && data.conversationId) {
          unsubscribeSocketFromConversationChannel(ws, data.conversationId);
        }
      } catch {
        // ignore invalid JSON
      }
    });

    ws.on("close", () => {
      cleanupSocket(ws);
      const doctorSockets = doctorToSockets.get(userId);
      if (doctorSockets) {
        doctorSockets.delete(ws);
        if (doctorSockets.size === 0) {
          doctorToSockets.delete(userId);
          if (redisSub) {
            void redisSub.unsubscribe(DOCTOR_EVENTS_CHANNEL_PREFIX + userId);
          }
        }
      }
    });

    ws.on("error", () => {
      cleanupSocket(ws);
      const doctorSockets = doctorToSockets.get(userId);
      if (doctorSockets) {
        doctorSockets.delete(ws);
        if (doctorSockets.size === 0) {
          doctorToSockets.delete(userId);
          if (redisSub) {
            void redisSub.unsubscribe(DOCTOR_EVENTS_CHANNEL_PREFIX + userId);
          }
        }
      }
    });
  });
}
