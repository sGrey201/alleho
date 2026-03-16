import { Server as HttpServer } from "http";
import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";
// @ts-expect-error no types
import { parse as parseCookie } from "cookie";
// @ts-expect-error no types
import * as cookieSignature from "cookie-signature";
import {
  getRedisSubscriber,
  type HealthWallMessageWithAuthor,
  type ConversationMessageWithAuthor,
} from "./redis";

const WS_PATH = "/ws";
const HEALTH_WALL_CHANNEL_PREFIX = "health-wall:channel:";
const CONVERSATION_CHANNEL_PREFIX = "conversation:channel:";

export type SessionStore = {
  get: (sid: string, callback: (err: unknown, session?: { userId?: string } | null) => void) => void;
};

export function setupWebSocket(
  httpServer: HttpServer,
  sessionStore: SessionStore,
  sessionSecret: string
): void {
  const wss = new WebSocketServer({ noServer: true });

  const channelToSockets = new Map<string, Set<WsWebSocket>>();
  const socketToChannels = new Map<WsWebSocket, Set<string>>();
  const conversationChannelToSockets = new Map<string, Set<WsWebSocket>>();
  const socketToConversationChannels = new Map<WsWebSocket, Set<string>>();

  function subscribeSocketToChannel(ws: WsWebSocket, patientUserId: string): void {
    const channel = HEALTH_WALL_CHANNEL_PREFIX + patientUserId;
    if (!channelToSockets.has(channel)) {
      channelToSockets.set(channel, new Set());
    }
    channelToSockets.get(channel)!.add(ws);
    if (!socketToChannels.has(ws)) {
      socketToChannels.set(ws, new Set());
    }
    socketToChannels.get(ws)!.add(channel);
  }

  function unsubscribeSocketFromChannel(ws: WsWebSocket, patientUserId: string): void {
    const channel = HEALTH_WALL_CHANNEL_PREFIX + patientUserId;
    const set = channelToSockets.get(channel);
    if (set) {
      set.delete(ws);
      if (set.size === 0) channelToSockets.delete(channel);
    }
    const channels = socketToChannels.get(ws);
    if (channels) channels.delete(channel);
  }

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

  function cleanupSocket(ws: WsWebSocket): void {
    const channels = socketToChannels.get(ws);
    if (channels) {
      Array.from(channels).forEach((ch) => {
        const set = channelToSockets.get(ch);
        if (set) {
          set.delete(ws);
          if (set.size === 0) channelToSockets.delete(ch);
        }
      });
      socketToChannels.delete(ws);
    }
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
      if (channel.startsWith(HEALTH_WALL_CHANNEL_PREFIX)) {
        const sockets = channelToSockets.get(channel);
        if (!sockets || sockets.size === 0) return;
        try {
          const payload = JSON.parse(message) as HealthWallMessageWithAuthor;
          const data = JSON.stringify({ type: "health_wall_message", payload });
          Array.from(sockets).forEach((ws) => {
            if (ws.readyState === 1) ws.send(data);
          });
        } catch {
          // ignore
        }
      } else if (channel.startsWith(CONVERSATION_CHANNEL_PREFIX)) {
        const sockets = conversationChannelToSockets.get(channel);
        if (!sockets || sockets.size === 0) return;
        try {
          const payload = JSON.parse(message) as ConversationMessageWithAuthor;
          const data = JSON.stringify({ type: "conversation_message", payload });
          Array.from(sockets).forEach((ws) => {
            if (ws.readyState === 1) ws.send(data);
          });
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

  wss.on("connection", (ws: WsWebSocket, _req: unknown, _userId: string) => {
    const subscribedChannels = new Set<string>();

    ws.on("message", (raw: string | Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString() : "";
        const data = JSON.parse(text) as {
          type: string;
          patientUserId?: string;
          conversationId?: string;
        };
        if (data.type === "subscribe" && data.patientUserId) {
          const channel = HEALTH_WALL_CHANNEL_PREFIX + data.patientUserId;
          const wasEmpty = !channelToSockets.has(channel);
          subscribeSocketToChannel(ws, data.patientUserId);
          subscribedChannels.add(channel);
          if (redisSub && wasEmpty) redisSub.subscribe(channel);
        } else if (data.type === "unsubscribe" && data.patientUserId) {
          unsubscribeSocketFromChannel(ws, data.patientUserId);
          subscribedChannels.delete(HEALTH_WALL_CHANNEL_PREFIX + data.patientUserId);
        } else if (data.type === "subscribe_conversation" && data.conversationId) {
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
    });

    ws.on("error", () => {
      cleanupSocket(ws);
    });
  });
}
