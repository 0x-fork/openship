-- Cache clearing must survive API/desktop restarts until a complete refresh succeeds.
-- Nullable by default: existing projects retain their current deployment behavior.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "build_cache_refresh_token" text;
