-- Migration: 20260917_storage_reservations.sql
-- Storage capacity reservations and atomic RPCs for concurrent render admission control

CREATE TABLE IF NOT EXISTS storage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  owner_id TEXT,
  estimated_bytes BIGINT NOT NULL,
  settled_bytes BIGINT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled', 'released', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_storage_reservations_status_expires
ON storage_reservations(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_storage_reservations_job_id
ON storage_reservations(job_id);

CREATE INDEX IF NOT EXISTS idx_storage_reservations_owner_id
ON storage_reservations(owner_id);

-- Atomic RPC: claim_storage_reservation
-- Pre-render capacity reservation executed under transaction-level advisory lock
CREATE OR REPLACE FUNCTION claim_storage_reservation(
  p_job_id TEXT,
  p_worker_id TEXT,
  p_estimated_bytes BIGINT,
  p_physical_usage_bytes BIGINT,
  p_admission_ceiling_bytes BIGINT,
  p_owner_id TEXT DEFAULT NULL,
  p_reservation_ttl_ms BIGINT DEFAULT 120000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_active_reserved BIGINT;
  v_effective_bytes BIGINT;
  v_new_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- 0. Acquire transaction-level advisory lock across concurrent workers
  -- Automatically released when the transaction ends (commit or abort).
  PERFORM pg_advisory_xact_lock(hashtext('excerpt_storage_capacity_lock'));

  -- 1. Expire stale active reservations whose TTL has passed
  UPDATE storage_reservations
  SET status = 'expired'
  WHERE status = 'active'
    AND expires_at < NOW();

  -- 2. Compute total currently committed active reservations
  SELECT COALESCE(SUM(estimated_bytes), 0)
  INTO v_active_reserved
  FROM storage_reservations
  WHERE status = 'active';

  -- 3. Check if effective_usage (reconciled_physical + active_reserved + requested) exceeds admission ceiling
  v_effective_bytes := p_physical_usage_bytes + v_active_reserved + p_estimated_bytes;

  IF v_effective_bytes > p_admission_ceiling_bytes THEN
    RETURN jsonb_build_object(
      'granted', false,
      'reason', 'INSUFFICIENT_HEADROOM',
      'effective_bytes', v_effective_bytes,
      'ceiling_bytes', p_admission_ceiling_bytes
    );
  END IF;

  -- 4. Calculate reservation expiry
  v_expires_at := NOW() + (p_reservation_ttl_ms || ' milliseconds')::interval;

  -- 5. Insert active reservation
  INSERT INTO storage_reservations (
    job_id,
    worker_id,
    owner_id,
    estimated_bytes,
    status,
    expires_at
  )
  VALUES (
    p_job_id,
    p_worker_id,
    p_owner_id,
    p_estimated_bytes,
    'active',
    v_expires_at
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'granted', true,
    'reservation_id', v_new_id,
    'effective_bytes', v_effective_bytes
  );
END;
$$;

-- Atomic RPC: settle_storage_reservation
-- Called after FFmpeg render completes and actual bytes are known.
-- If actual > estimated, verifies that the additional delta fits within admission ceiling
-- before committing the settled reservation.
CREATE OR REPLACE FUNCTION settle_storage_reservation(
  p_reservation_id UUID,
  p_actual_bytes BIGINT,
  p_physical_usage_bytes BIGINT,
  p_admission_ceiling_bytes BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res RECORD;
  v_delta BIGINT;
  v_active_reserved BIGINT;
  v_effective_bytes BIGINT;
BEGIN
  -- 0. Acquire transaction-level advisory lock
  PERFORM pg_advisory_xact_lock(hashtext('excerpt_storage_capacity_lock'));

  -- 1. Fetch the target reservation
  SELECT * INTO v_res
  FROM storage_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'RESERVATION_NOT_FOUND'
    );
  END IF;

  IF v_res.status != 'active' THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'RESERVATION_NOT_ACTIVE',
      'status', v_res.status
    );
  END IF;

  -- 2. Calculate delta between actual and estimated
  v_delta := p_actual_bytes - v_res.estimated_bytes;

  -- 3. If rendered artifact grew larger than estimated, verify delta fits within ceiling
  IF v_delta > 0 THEN
    SELECT COALESCE(SUM(estimated_bytes), 0)
    INTO v_active_reserved
    FROM storage_reservations
    WHERE status = 'active';

    v_effective_bytes := p_physical_usage_bytes + v_active_reserved + v_delta;

    IF v_effective_bytes > p_admission_ceiling_bytes THEN
      RETURN jsonb_build_object(
        'success', false,
        'reason', 'SETTLE_OVER_CAPACITY',
        'delta_bytes', v_delta,
        'effective_bytes', v_effective_bytes,
        'ceiling_bytes', p_admission_ceiling_bytes
      );
    END IF;
  END IF;

  -- 4. Update reservation with settled actual bytes
  UPDATE storage_reservations
  SET settled_bytes = p_actual_bytes,
      status = 'settled'
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'settled_bytes', p_actual_bytes,
    'delta_bytes', v_delta
  );
END;
$$;
