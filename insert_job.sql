INSERT INTO jobs (id, video_url, num_clips, status, progress, payload, created_at, updated_at) 
VALUES (
  gen_random_uuid(), 
  'https://youtu.be/fJrctBM0poE?si=Wi7haLVKCA8Ul-Xi', 
  3, 
  'queued', 
  0, 
  '{"intent":"viral", "avoidSimilarClips":"balanced", "generation_mode":"quality"}', 
  now(), 
  now()
) RETURNING id;
