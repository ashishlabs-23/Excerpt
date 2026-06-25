import { useEffect, useState, useRef } from 'react';
import { getSupabaseBrowserClient } from './supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

export function useRealtimeSync(jobId: string | null, onUpdate: (job: any) => void) {
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectAttemptRef = useRef(0);
  const maxReconnectDelay = 30000;
  const baseReconnectDelay = 1000;

  useEffect(() => {
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
    let reconnectTimeout: NodeJS.Timeout;

    const connectChannel = () => {
      if (!isMounted) return;

      console.log(`[RealtimeSync]: Connecting to job-progress channel for ${jobId}...`);
      
      // Cleanup previous channel if any
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
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
              onUpdate(row);
            }
          }
        );

      channelRef.current = channel;

      channel.subscribe((status, err) => {
        if (!isMounted) return;

        if (status === 'SUBSCRIBED') {
          console.log(`[RealtimeSync]: Successfully subscribed to channel for ${jobId}`);
          setConnectionStatus('connected');
          reconnectAttemptRef.current = 0; // reset retry counter
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn(`[RealtimeSync]: Subscription error/closed for ${jobId}:`, err);
          setConnectionStatus('disconnected');
          triggerReconnect();
        }
      });
    };

    const triggerReconnect = () => {
      if (!isMounted) return;

      const delay = Math.min(
        maxReconnectDelay,
        baseReconnectDelay * Math.pow(2, reconnectAttemptRef.current) + Math.random() * 1000
      );
      
      reconnectAttemptRef.current++;
      setConnectionStatus('reconnecting');
      console.log(`[RealtimeSync]: Retrying connection in ${Math.round(delay)}ms (Attempt ${reconnectAttemptRef.current})`);

      reconnectTimeout = setTimeout(() => {
        connectChannel();
      }, delay);
    };

    connectChannel();

    // Heartbeat to periodically check connection health (every 15 seconds)
    const heartbeatInterval = setInterval(() => {
      if (channelRef.current && connectionStatus === 'connected') {
        const state = (channelRef.current as any).state;
        if (state && state !== 'joined') {
          console.warn(`[RealtimeSync]: Heartbeat failed. Channel state: ${state}. Reconnecting...`);
          triggerReconnect();
        }
      }
    }, 15000);

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      clearInterval(heartbeatInterval);
      if (channelRef.current) {
        console.log(`[RealtimeSync]: Cleaning up subscription channel for ${jobId}`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [jobId]);

  return { connectionStatus };
}
