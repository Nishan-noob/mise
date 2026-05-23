import { useEffect, useRef, useCallback } from 'react';
import { WsEvent, WsEventType } from '@mise/shared';
import { useAuthStore } from '../store/authStore';

type Handler<T = unknown> = (payload: T) => void;

interface UseWsOptions {
  onMessage?: (event: WsEvent) => void;
  enabled?: boolean;
}

const WS_BASE = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
})();

export function useWebSocket({ onMessage, enabled = true }: UseWsOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const token = useAuthStore.getState().token;
    if (!token || !mountedRef.current) return;

    const url = `${WS_BASE}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Connected');
      // Clear any reconnect timer
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsEvent;
        onMessageRef.current?.(msg);
      } catch (e) {
        console.error('[WS] Parse error', e);
      }
    };

    ws.onclose = (event) => {
      console.log('[WS] Disconnected', event.code, event.reason);
      if (!mountedRef.current) return;
      // Don't reconnect if explicitly closed by server (auth failure)
      if (event.code === 4001) return;
      // Exponential backoff reconnect
      const delay = Math.min(1000 * 2 ** (reconnectRef.current ? 5 : 0), 30000);
      reconnectRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    ws.onerror = (err) => console.error('[WS] Error', err);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close(1000, 'Component unmounted');
    };
  }, [enabled, connect]);

  return wsRef;
}
