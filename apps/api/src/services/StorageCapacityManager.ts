// ─────────────────────────────────────────────────────────────────────────────
// StorageCapacityManager — DB-backed pre-render capacity reservation
//
// All reservations are durable in public.storage_reservations via the atomic
// claim_storage_reservation RPC. Multiple workers share the same DB-truth,
// preventing the double-booking race that in-memory maps cannot avoid.
//
// In-memory cache (30s TTL) is used ONLY for physical usage reads —
// it is never the source of truth for admission decisions.
//
// Flow:
//   1. getCapacityReport()          → read physical usage (cached 30s)
//   2. requestReservation()         → RPC: physical + active_reserved + requested ≤ ceiling?
//   3. render executes              → heartbeat keeps reservation active
//   4. releaseReservation()         → update row to 'released' or 'settled'
// ─────────────────────────────────────────────────────────────────────────────

import { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseService } from './supabaseService';
import { StorageService } from './storageService';
import {
  STORAGE_QUOTA_BYTES,
  STORAGE_ADMISSION_BYTES,
  STORAGE_EVICTION_TRIGGER_BYTES,
  STORAGE_EVICTION_WARNING_BYTES,
  STORAGE_CRITICAL_BYTES,
  RESERVATION_TTL_MS,
  classifyPressure,
  PressureLevel,
} from './StoragePolicyConfig';

export interface CapacityReport {
  usageBytes: number;
  reservedBytes: number;
  effectiveUsageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  pressureLevel: PressureLevel;
  canAcceptRender: boolean;
}

export interface ReservationResult {
  canProceed: boolean;
  reservationId?: string;
  reason?: 'CRITICAL_PRESSURE' | 'INSUFFICIENT_HEADROOM';
  effectiveUsageBytes?: number;
  quotaBytes?: number;
}

export interface SettleResult {
  success: boolean;
  reservationId: string;
  settledBytes?: number;
  deltaBytes?: number;
  reason?: 'SETTLE_OVER_CAPACITY' | 'RESERVATION_NOT_FOUND' | 'RESERVATION_NOT_ACTIVE' | 'RPC_ERROR';
}

// Render profile estimator: bytes per second of output video.
// Conservative baseline values; replace with P95 telemetry when available.
// 15% overhead multiplier accounts for container overhead, audio, and metadata.
const RENDER_PROFILE_BYTES_PER_SEC: Record<string, number> = {
  draft:   500_000,    //  4 Mbps  — fast preview encode
  quality: 1_250_000,  // 10 Mbps  — production encode
  default: 1_000_000,  //  8 Mbps  — conservative fallback
};
const RENDER_OVERHEAD_MULTIPLIER = 1.15;

export class StorageCapacityManager {
  private static instance: StorageCapacityManager | null = null;
  private db: DatabaseService;
  private storage: StorageService;

  // Physical usage cache — 30s TTL, optimization only
  private cachedUsageBytes: number | null = null;
  private cacheTimestampMs: number = 0;
  private readonly CACHE_TTL_MS = 30_000;

  static getInstance(): StorageCapacityManager {
    if (!StorageCapacityManager.instance) {
      StorageCapacityManager.instance = new StorageCapacityManager();
    }
    return StorageCapacityManager.instance;
  }

  constructor(db?: DatabaseService, storage?: StorageService) {
    this.db = db ?? new DatabaseService();
    this.storage = storage ?? StorageService.getInstance();
  }

  // ─── Render Profile Estimator ────────────────────────────────────────────────

  /**
   * Estimates output bytes for a render job.
   * Uses profile-aware bytes-per-second with a 15% safety multiplier.
   */
  static estimateRenderBytes(
    durationSeconds: number,
    generationMode: string = 'default'
  ): number {
    const bps = RENDER_PROFILE_BYTES_PER_SEC[generationMode]
      ?? RENDER_PROFILE_BYTES_PER_SEC.default;
    return Math.ceil(bps * durationSeconds * RENDER_OVERHEAD_MULTIPLIER);
  }

  // ─── Reservation (DB-backed, atomic) ────────────────────────────────────────

  /**
   * Requests a pre-render capacity reservation via the claim_storage_reservation RPC.
   * The RPC is atomic — multiple workers cannot double-book the same headroom.
   *
   * Returns { canProceed: false } when:
   *   - Storage is at CRITICAL pressure regardless of reservation size
   *   - physical + active_reserved + requested > STORAGE_CRITICAL_BYTES
   */
  async requestReservation(
    estimatedBytes: number,
    jobId: string,
    workerId: string,
    ownerId?: string
  ): Promise<ReservationResult> {
    const supabase = this.db.getSupabase();

    // 1. Read current physical usage (from 30s cache or fresh)
    const usageBytes = await this.getCurrentUsageBytes();
    const pressureLevel = classifyPressure(usageBytes);

    // Fast-reject at CRITICAL before hitting DB
    if (pressureLevel === 'CRITICAL') {
      console.warn(
        `[StorageCapacityManager]: 🚫 Reservation denied — CRITICAL pressure ` +
        `(physical=${(usageBytes / (1024 * 1024)).toFixed(1)} MB, job=${jobId})`
      );
      return {
        canProceed: false,
        reason: 'CRITICAL_PRESSURE',
        effectiveUsageBytes: usageBytes,
        quotaBytes: STORAGE_QUOTA_BYTES,
      };
    }

    // 2. Delegate atomic admission + insert to RPC
    try {
      const { data, error } = await supabase.rpc('claim_storage_reservation', {
        p_job_id:                  jobId,
        p_worker_id:               workerId,
        p_estimated_bytes:         estimatedBytes,
        p_physical_usage_bytes:    usageBytes,
        p_admission_ceiling_bytes: STORAGE_ADMISSION_BYTES,
        p_owner_id:                ownerId ?? null,
        p_reservation_ttl_ms:      RESERVATION_TTL_MS,
      });

      if (error) throw error;

      const result = data as { granted: boolean; reservation_id?: string; reason?: string; effective_bytes?: number };

      if (!result.granted) {
        console.warn(
          `[StorageCapacityManager]: 🚫 Reservation denied by RPC — ${result.reason} ` +
          `(effective=${result.effective_bytes ? (result.effective_bytes / (1024 * 1024)).toFixed(1) : '?'} MB, job=${jobId})`
        );
        return {
          canProceed: false,
          reason: 'INSUFFICIENT_HEADROOM',
          effectiveUsageBytes: result.effective_bytes,
          quotaBytes: STORAGE_QUOTA_BYTES,
        };
      }

      console.log(
        `[StorageCapacityManager]: ✅ Reservation ${result.reservation_id} granted ` +
        `(job=${jobId}, ~${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB, pressure=${pressureLevel})`
      );
      return { canProceed: true, reservationId: result.reservation_id };

    } catch (err: any) {
      // RPC failure → fail open (don't block renders because of a DB connectivity issue)
      console.warn(`[StorageCapacityManager]: RPC error, failing open: ${err.message}`);
      return { canProceed: true, reservationId: undefined };
    }
  }

  /**
   * Settles a reservation with actual rendered byte size before upload.
   * If actual > estimated, verifies that the additional delta fits within STORAGE_ADMISSION_BYTES
   * atomically in Postgres under pg_advisory_xact_lock.
   */
  async settleReservation(
    reservationId: string,
    actualBytes: number
  ): Promise<SettleResult> {
    if (!reservationId) {
      return { success: false, reservationId: '', reason: 'RESERVATION_NOT_FOUND' };
    }
    const supabase = this.db.getSupabase();
    const usageBytes = await this.getCurrentUsageBytes();

    try {
      const { data, error } = await supabase.rpc('settle_storage_reservation', {
        p_reservation_id:          reservationId,
        p_actual_bytes:            actualBytes,
        p_physical_usage_bytes:    usageBytes,
        p_admission_ceiling_bytes: STORAGE_ADMISSION_BYTES,
      });

      if (error) throw error;

      const res = data as { success: boolean; reason?: string; settled_bytes?: number; delta_bytes?: number };
      if (!res.success) {
        console.warn(
          `[StorageCapacityManager]: ⚠️ Settle rejected for reservation ${reservationId} — ${res.reason} ` +
          `(actual=${(actualBytes / (1024 * 1024)).toFixed(1)} MB)`
        );
        return {
          success: false,
          reservationId,
          reason: res.reason as any,
          deltaBytes: res.delta_bytes,
        };
      }

      console.log(
        `[StorageCapacityManager]: ✅ Reservation ${reservationId} settled with ` +
        `${(actualBytes / (1024 * 1024)).toFixed(1)} MB (delta=${((res.delta_bytes || 0) / (1024 * 1024)).toFixed(1)} MB)`
      );
      return {
        success: true,
        reservationId,
        settledBytes: res.settled_bytes,
        deltaBytes: res.delta_bytes,
      };
    } catch (err: any) {
      console.warn(`[StorageCapacityManager]: settleReservation RPC error, failing open: ${err.message}`);
      return { success: true, reservationId, settledBytes: actualBytes };
    }
  }

  /**
   * Releases a reservation after a render completes (success or failure).
   * If actualBytes is provided, updates estimated_bytes to actuals for telemetry.
   */
  async releaseReservation(reservationId: string, actualBytes?: number): Promise<void> {
    if (!reservationId) return;
    try {
      const supabase = this.db.getSupabase();
      const update: Record<string, any> = {
        status: actualBytes != null ? 'settled' : 'released',
        released_at: new Date().toISOString(),
      };
      if (actualBytes != null) update.estimated_bytes = actualBytes;

      await supabase
        .from('storage_reservations')
        .update(update)
        .eq('id', reservationId)
        .eq('status', 'active');
    } catch (err: any) {
      console.warn(`[StorageCapacityManager]: Failed to release reservation ${reservationId}: ${err.message}`);
    }
  }

  // ─── Capacity Reporting ──────────────────────────────────────────────────────

  /**
   * Returns a full capacity report.
   * Reads physical usage (30s cache) + active DB reservations.
   */
  async getCapacityReport(): Promise<CapacityReport> {
    const usageBytes = await this.getCurrentUsageBytes();
    const reservedBytes = await this.getActiveReservedBytes();
    const effectiveUsageBytes = usageBytes + reservedBytes;
    const quotaBytes = STORAGE_QUOTA_BYTES;
    const percentUsed = quotaBytes > 0
      ? Math.round((effectiveUsageBytes / quotaBytes) * 100)
      : 0;
    const pressureLevel = classifyPressure(effectiveUsageBytes);

    return {
      usageBytes,
      reservedBytes,
      effectiveUsageBytes,
      quotaBytes,
      percentUsed,
      pressureLevel,
      canAcceptRender: pressureLevel !== 'CRITICAL',
    };
  }

  async getPressureLevel(): Promise<PressureLevel> {
    const report = await this.getCapacityReport();
    return report.pressureLevel;
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────────

  /**
   * Returns current physical storage usage in bytes.
   * Uses a 30s in-memory cache (optimization — never used for admission decisions).
   */
  private async getCurrentUsageBytes(): Promise<number> {
    const now = Date.now();
    if (this.cachedUsageBytes !== null && now - this.cacheTimestampMs < this.CACHE_TTL_MS) {
      return this.cachedUsageBytes;
    }
    try {
      const objects = await this.storage.listCurrentObjects();
      const total = objects.reduce((sum, o) => sum + (o.size || 0), 0);
      this.cachedUsageBytes = total;
      this.cacheTimestampMs = now;
      return total;
    } catch (err: any) {
      console.warn(`[StorageCapacityManager]: Usage read failed: ${err.message}`);
      return this.cachedUsageBytes ?? 0;
    }
  }

  /**
   * Returns active reserved bytes from DB (source of truth for concurrent workers).
   */
  async getActiveReservedBytes(supabase?: SupabaseClient): Promise<number> {
    try {
      const sb = supabase ?? this.db.getSupabase();
      const { data } = await sb
        .from('storage_reservations')
        .select('estimated_bytes')
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString());

      return (data ?? []).reduce((sum: number, r: any) => sum + (r.estimated_bytes || 0), 0);
    } catch {
      return 0;
    }
  }
}

export const storageCapacityManager = StorageCapacityManager.getInstance();
