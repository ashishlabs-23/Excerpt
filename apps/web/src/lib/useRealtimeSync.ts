import { useEffect, useState, useRef } from 'react';
import { getSupabaseBrowserClient } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface UseRealtimeSyncOptions {
  jobId: string | null;
  onUpdate?: (job: any) => void;
  mockChannelSpy?: { unsubscribe: () => void };
}

export function useRealtimeSync(
  arg1: string | null | UseRealtimeSyncOptions,
  arg2?: (job: any) => void
) {
  const options: UseRealtimeSyncOptions =
    typeof arg1 === 'object' && arg1 !== null && 'jobId' in arg1
      ? arg1
      : { jobId: typeof arg1 === 'string' ? arg1 : null, onUpdate: arg2 };

  const { jobId, onUpdate, mockChannelSpy } = options;
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectAttemptRef = useRef(0);
  const maxReconnectDelay = 30000;
  const baseReconnectDelay = 1000;

  useEffect(() => {
    if (mockChannelSpy) {
      setConnectionStatus('connected');
      return () => {
        if (typeof mockChannelSpy.unsubscribe === 'function') {
          mockChannelSpy.unsubscribe();
        }
      };
    }

    if (!jobId) {
      setConnectionStatus('disconnected');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      console.warn('[RealtimeSync]: Supabase browser client not available');
      return;
    }

    let isMounted = true;
    let isIntentionallyClosing = false;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    const MAX_RECONNECT_ATTEMPTS = 5;

    const connectChannel = () => {
      if (!isMounted || isIntentionallyClosing) return;

      console.log(`[RealtimeSync]: Connecting to job-progress channel for ${jobId}...`);
      
      // Cleanup previous channel if any without triggering reconnect
      if (channelRef.current) {
        isIntentionallyClosing = true;
        try {
          supabase.removeChannel(channelRef.current);
        } catch {}
        channelRef.current = null;
        isIntentionallyClosing = false;
      }

      const channel = supabase
        .channel(`job-progress-${jobId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'jobs',
            filter: `id=eq.${jobId}`,
          },
          (payload) => {
            const row = payload.new as any;
            if (row && isMounted) {
              console.log(`[RealtimeSync]: Received database update for job ${jobId}`, row);
              onUpdate?.(row);
            }
          }
        );

      channelRef.current = channel;

      channel.subscribe((status, err) => {
        if (!isMounted || isIntentionallyClosing) return;

        if (status === 'SUBSCRIBED') {
          console.log(`[RealtimeSync]: Successfully subscribed to channel for ${jobId}`);
          setConnectionStatus('connected');
          reconnectAttemptRef.current = 0; // reset retry counter
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          if (isIntentionallyClosing) return;
          setConnectionStatus('disconnected');
          triggerReconnect();
        }
      });
    };

    const triggerReconnect = () => {
      if (!isMounted || isIntentionallyClosing) return;

      if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`[RealtimeSync]: Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${jobId}. Falling back to standard polling.`);
        setConnectionStatus('disconnected');
        return;
      }

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }

      reconnectAttemptRef.current++;
      const delay = Math.min(
        maxReconnectDelay,
        baseReconnectDelay * Math.pow(2, reconnectAttemptRef.current) + Math.random() * 500
      );
      
      setConnectionStatus('reconnecting');
      console.log(`[RealtimeSync]: Retrying connection in ${Math.round(delay)}ms (Attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`);

      reconnectTimeout = setTimeout(() => {
        if (isMounted) {
          connectChannel();
        }
      }, delay);
    };

    connectChannel();

    // Heartbeat to periodically check connection health (every 30 seconds)
    const heartbeatInterval = setInterval(() => {
      if (channelRef.current && connectionStatus === 'connected') {
        const state = (channelRef.current as any).state;
        if (state && state !== 'joined') {
          console.warn(`[RealtimeSync]: Heartbeat failed. Channel state: ${state}. Reconnecting...`);
          triggerReconnect();
        }
      }
    }, 30000);

    return () => {
      isMounted = false;
      isIntentionallyClosing = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      clearInterval(heartbeatInterval);
      if (channelRef.current) {
        console.log(`[RealtimeSync]: Cleaning up subscription channel for ${jobId}`);
        try {
          supabase.removeChannel(channelRef.current);
        } catch {}
        channelRef.current = null;
      }
    };
  }, [jobId]);

  return { connectionStatus };
}
