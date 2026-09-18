// ─────────────────────────────────────────────────────────────────────────────
// StoragePolicyConfig — Excerpt Storage Policy Constants
//
// All byte values are in bytes (not MB, not GiB) to eliminate unit ambiguity.
//
// Pressure Level Thresholds (percentage of STORAGE_QUOTA_BYTES):
//   NORMAL   < STORAGE_EVICTION_WARNING_BYTES  (< 75%)
//   WARNING  < STORAGE_EVICTION_TRIGGER_BYTES  (75–85%)
//   EVICTION >= STORAGE_EVICTION_TRIGGER_BYTES (85–95%)
//   CRITICAL >= STORAGE_CRITICAL_BYTES         (> 95%)
//
// Eviction Policy:
//   Target: STORAGE_TARGET_BYTES (65%) — evict only enough to reach this floor.
//   This hysteresis band prevents repeated micro-eviction cycles.
//
// Expiration Policy (separate from quota eviction):
//   Processing artifacts (jobs/, sources/, test_*): EXPIRATION_HOURS_PROCESSING
//   Creator clips: NOT subject to time-based expiration unless expires_at is set.
// ─────────────────────────────────────────────────────────────────────────────

function readEnvBytes(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`[StoragePolicyConfig]: Invalid value for ${key}="${raw}", using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

// Configured total quota (default: 1 GiB = 1,073,741,824 bytes)
export const STORAGE_QUOTA_BYTES = readEnvBytes(
  'STORAGE_QUOTA_BYTES',
  1_073_741_824
);

// Soft warning threshold — system logs warnings but does not yet evict
// Default: 75% of quota
export const STORAGE_EVICTION_WARNING_BYTES = readEnvBytes(
  'STORAGE_EVICTION_WARNING_BYTES',
  Math.floor(STORAGE_QUOTA_BYTES * 0.75)
);

// Hard eviction trigger — system begins evicting eligible artifacts
// Default: 85% of quota
export const STORAGE_EVICTION_TRIGGER_BYTES = readEnvBytes(
  'STORAGE_EVICTION_TRIGGER_BYTES',
  Math.floor(STORAGE_QUOTA_BYTES * 0.85)
);

// Pre-render admission ceiling — maximum effective usage (reconciled physical + active reservations + requested)
// allowed for admitting new render jobs. Sits between EVICTION_TRIGGER (85%) and CRITICAL (95%).
// At 86%, eviction runs to recover headroom while safe renders can proceed; at 90%+, new render reservations are blocked.
// Default: 90% of quota
export const STORAGE_ADMISSION_BYTES = readEnvBytes(
  'STORAGE_ADMISSION_BYTES',
  Math.floor(STORAGE_QUOTA_BYTES * 0.90)
);

// Eviction target floor — evict until usage drops below this
// Default: 65% of quota (20% hysteresis band)
export const STORAGE_TARGET_BYTES = readEnvBytes(
  'STORAGE_TARGET_BYTES',
  Math.floor(STORAGE_QUOTA_BYTES * 0.65)
);

// Critical threshold — new renders are rejected to prevent further growth
// Default: 95% of quota
export const STORAGE_CRITICAL_BYTES = readEnvBytes(
  'STORAGE_CRITICAL_BYTES',
  Math.floor(STORAGE_QUOTA_BYTES * 0.95)
);

// Grace period after artifact creation during which eviction is blocked
// Default: 24 hours (86,400,000 ms)
export const STORAGE_GRACE_PERIOD_MS = readEnvBytes(
  'STORAGE_GRACE_PERIOD_MS',
  24 * 60 * 60 * 1000
);

// Processing artifact expiration: jobs/, sources/, test_* are deleted after this many hours
// Creator clips are NOT subject to this — only quota pressure or explicit expires_at
export const EXPIRATION_HOURS_PROCESSING = readEnvBytes(
  'EXPIRATION_HOURS_PROCESSING',
  24
);

// Maximum reservation TTL: a reservation that exceeds this is auto-released
// Default: 2 hours (render jobs should never take longer)
export const RESERVATION_TTL_MS = readEnvBytes(
  'RESERVATION_TTL_MS',
  2 * 60 * 60 * 1000
);

// Conservative estimated output bitrate for pre-render byte estimation (bits per second)
// Used when no explicit estimate is available: 8 Mbps → 1 MB/s → 60 MB/min
export const RENDER_ESTIMATED_BITRATE_BPS = readEnvBytes(
  'RENDER_ESTIMATED_BITRATE_BPS',
  8_000_000
);

export type PressureLevel = 'NORMAL' | 'WARNING' | 'EVICTION' | 'CRITICAL';

/**
 * Returns the pressure level for a given usage in bytes.
 */
export function classifyPressure(usageBytes: number): PressureLevel {
  if (usageBytes >= STORAGE_CRITICAL_BYTES)         return 'CRITICAL';
  if (usageBytes >= STORAGE_EVICTION_TRIGGER_BYTES) return 'EVICTION';
  if (usageBytes >= STORAGE_EVICTION_WARNING_BYTES)  return 'WARNING';
  return 'NORMAL';
}

/**
 * Human-readable summary of the current config (for logs and health endpoints).
 */
export function getStoragePolicyConfigSummary(): Record<string, string> {
  const fmt = (b: number) => `${(b / (1024 * 1024)).toFixed(0)} MB (${b} bytes)`;
  return {
    quota:                      fmt(STORAGE_QUOTA_BYTES),
    warning:                    fmt(STORAGE_EVICTION_WARNING_BYTES),
    admission:                  fmt(STORAGE_ADMISSION_BYTES),
    eviction_trigger:           fmt(STORAGE_EVICTION_TRIGGER_BYTES),
    eviction_target:            fmt(STORAGE_TARGET_BYTES),
    critical:                   fmt(STORAGE_CRITICAL_BYTES),
    grace_period_ms:            String(STORAGE_GRACE_PERIOD_MS),
    expiration_processing_hours: String(EXPIRATION_HOURS_PROCESSING),
  };
}
