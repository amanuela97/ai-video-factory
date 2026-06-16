-- AI Video Factory — Supabase Schema
-- Run this in the Supabase SQL editor

-- ============================================================
-- VIDEOS TABLE
-- Master record for each video generated
-- ============================================================
create table videos (
  id uuid primary key default gen_random_uuid(),
  title text,
  topic text,
  duration_seconds int,
  status text default 'queued',   -- queued | done | failed
  blob_url text,
  thumbnail_url text,
  total_cost numeric default 0,
  scene_count int default 0,
  created_at timestamp default now()
);

-- ============================================================
-- JOBS TABLE
-- Tracks pipeline execution state for each video
-- ============================================================
create table jobs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id) on delete cascade,
  status text default 'queued',
  -- Status values: queued | generating_script | generating_voice |
  --                generating_images | rendering | uploading | done | failed
  current_step text default 'pending',
  input_topic text,
  input_duration int,
  user_phone text,
  retry_count int default 0,
  error text,
  created_at timestamp default now()
);

-- ============================================================
-- USAGE EVENTS TABLE
-- Tracks per-service cost for every API call
-- ============================================================
create table usage_events (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id) on delete cascade,
  service text,    -- gemini | elevenlabs | images | blob
  model text,      -- gemini-1.5-flash | eleven_monolingual_v1 | flux | nano-banana
  cost numeric,
  metadata jsonb,
  created_at timestamp default now()
);

-- ============================================================
-- SCENES TABLE (optional — useful for debugging)
-- Stores per-scene breakdown from Gemini
-- ============================================================
create table scenes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id) on delete cascade,
  scene_index int,
  start_time int,
  end_time int,
  narration text,
  visual_prompt text,
  curiosity_hook text,
  retention_reason text,
  image_url text,
  created_at timestamp default now()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index idx_jobs_status on jobs(status);
create index idx_jobs_created_at on jobs(created_at);
create index idx_usage_events_video_id on usage_events(video_id);
create index idx_videos_status on videos(status);
