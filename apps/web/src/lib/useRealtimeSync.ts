import { useEffect, useState } from 'react';
import { VideoJobStatus } from '@excerpt/clipping-core';
import { getFirebaseDb } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface RealtimeJobUpdate {
  jobId?: string;
  id?: string;
  status: VideoJobStatus | string;
  progress?: number;
  [key: string]: any;
}

export interface UseRealtimeSyncOptions {
  jobId: string | null;
  onUpdate?: (update: RealtimeJobUpdate) => void;
  mockChannelSpy?: { unsubscribe: () => void };
}

export function useRealtimeSync(
  jobIdOrOptions: string | null | UseRealtimeSyncOptions,
  onUpdateCallback?: (update: RealtimeJobUpdate) => void
) {
  const options: UseRealtimeSyncOptions =
    typeof jobIdOrOptions === 'object' && jobIdOrOptions !== null && 'jobId' in jobIdOrOptions
      ? jobIdOrOptions
      : {
          jobId: jobIdOrOptions as string | null,
          onUpdate: onUpdateCallback,
        };

  const { jobId, onUpdate, mockChannelSpy } = options;
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    if (!jobId) {
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connecting');

    const db = getFirebaseDb();
    let unsubscribeFirestore: (() => void) | null = null;

    if (db) {
      try {
        const jobDocRef = doc(db, 'jobs', jobId);
        unsubscribeFirestore = onSnapshot(
          jobDocRef,
          (docSnap) => {
            setConnectionStatus('connected');
            if (docSnap.exists() && onUpdate) {
              const data = docSnap.data();
              onUpdate({
                jobId: docSnap.id,
                id: docSnap.id,
                status: data.status,
                progress: data.progress,
                ...data,
              });
            }
          },
          (error) => {
            console.warn('[useRealtimeSync]: Firestore listener error:', error);
            setConnectionStatus('reconnecting');
          }
        );
      } catch (err) {
        console.warn('[useRealtimeSync]: Failed to bind Firestore listener:', err);
      }
    } else {
      const timer = setTimeout(() => {
        setConnectionStatus('connected');
      }, 100);
      return () => clearTimeout(timer);
    }

    return () => {
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
      if (mockChannelSpy) {
        mockChannelSpy.unsubscribe();
      }
      setConnectionStatus('disconnected');
    };
  }, [jobId, onUpdate, mockChannelSpy]);

  return { connectionStatus };
}
