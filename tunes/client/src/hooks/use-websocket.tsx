import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useToast } from "@/hooks/use-toast";
import { getGuestMusicCapability, musicCredentialForRequest } from "@/lib/musicCredential";

interface WebSocketMessage {
  type: "player_state" | "guest_request" | "guest_request_status" | "connection_status" | "music_error"
    | "SONG_REQUESTS_TOGGLE" | "GUEST_PLAY_TOGGLE" | "PLAYLIST_SHARING_TOGGLE"
    | "PLAYLIST_UPDATE" | "CONNECTION_STATUS" | "ERROR" | "THEME_UPDATE" | "RECENTLY_PLAYED_TOGGLE";
  payload?: unknown;
  playing?: boolean;
  position?: number;
  externalId?: string;
  [key: string]: unknown;
}

interface WebSocketOptions {
  enabled?: boolean;
  showConnectionToasts?: boolean;
}

type MessageHandler = (message: WebSocketMessage) => void | Promise<void>;
const SERVER_EVENTS = ["player_state", "guest_request", "guest_request_status", "connection_status", "music_error"] as const;

export function useWebSocket(
  connectionKey: string | undefined,
  onMessage: MessageHandler,
  options: WebSocketOptions = { enabled: true, showConnectionToasts: true },
) {
  const socketRef = useRef<Socket | null>(null);
  const mountedRef = useRef(true);
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const cleanup = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (options.enabled === false || !connectionKey) return cleanup;
    let cancelled = false;

    const connect = async () => {
      const guestCapability = getGuestMusicCapability(connectionKey);
      let token: string | undefined;
      if (!guestCapability) {
        try { token = await musicCredentialForRequest(); } catch { token = undefined; }
      }
      if (cancelled || (!token && !guestCapability)) return;

      const socket = io("/", {
        path: "/ws",
        auth: guestCapability ? { guestCapability } : (callback: (data: Record<string, string>) => void) => {
          void musicCredentialForRequest().then((freshToken) => callback({ token: freshToken })).catch(() => callback({}));
        },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 10_000,
        reconnectionAttempts: 10,
        timeout: 20_000,
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;
      socket.on("connect", () => {
        if (!mountedRef.current) return;
        setIsConnected(true);
        setConnectionError(null);
        if (options.showConnectionToasts) toast({ description: "Connected to Music." });
      });
      socket.on("disconnect", () => {
        if (!mountedRef.current) return;
        setIsConnected(false);
      });
      socket.on("connect_error", (error: Error) => {
        if (!mountedRef.current) return;
        setIsConnected(false);
        setConnectionError(error.message);
      });
      for (const event of SERVER_EVENTS) {
        socket.on(event, (payload: Record<string, unknown> = {}) => {
          if (!mountedRef.current) return;
          void Promise.resolve(onMessage({ type: event, ...payload })).catch(() => undefined);
        });
      }
    };
    void connect();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup, connectionKey, onMessage, options.enabled, options.showConnectionToasts, toast]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    if (message.type === "player_state") {
      const payload: Record<string, unknown> = { playing: message.playing };
      if (message.position !== undefined) payload.position = message.position;
      if (message.externalId !== undefined) payload.externalId = message.externalId;
      socket.emit("player_state", payload);
    } else if (message.type === "guest_request") {
      socket.emit("guest_request", message.payload);
    }
  }, []);

  return { sendMessage, isConnected, connectionError };
}
