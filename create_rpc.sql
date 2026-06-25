CREATE OR REPLACE FUNCTION public.claim_next_voiceover_clip()
RETURNS SETOF voiceover_clips AS $$
BEGIN
  RETURN QUERY
  UPDATE voiceover_clips
  SET status = 'processing', updated_at = NOW()
  WHERE id = (
    SELECT id FROM voiceover_clips
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$ LANGUAGE plpgsql;
