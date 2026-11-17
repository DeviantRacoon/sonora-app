CREATE TABLE IF NOT EXISTS profiles (token_hash text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true, last_seen timestamptz NOT NULL DEFAULT now(), recommendations jsonb, generated_at timestamptz);
CREATE TABLE IF NOT EXISTS taste_events (profile text REFERENCES profiles ON DELETE CASCADE, event_id uuid NOT NULL, kind text NOT NULL, track jsonb NOT NULL, weight real NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(profile,event_id));
CREATE INDEX IF NOT EXISTS taste_events_profile_date ON taste_events(profile,created_at);
CREATE TABLE IF NOT EXISTS preferences (profile text REFERENCES profiles ON DELETE CASCADE, video_id text NOT NULL, kind text NOT NULL, track jsonb NOT NULL, PRIMARY KEY(profile,video_id));
