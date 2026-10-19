-- Raid Picker Database Schema
-- Run this entire script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)

-- 1. Create tables
CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(4) NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'voting', 'revealed')),
    picked_raid_id TEXT,
    host_player_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_host BOOLEAN NOT NULL DEFAULT false,
    has_locked BOOLEAN NOT NULL DEFAULT false,
    veto_used BOOLEAN NOT NULL DEFAULT false,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    raid_id TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(room_id, player_id, raid_id)
);

CREATE TABLE IF NOT EXISTS vetoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    raid_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(room_id, player_id)
);

CREATE TABLE IF NOT EXISTS history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    raid_id TEXT NOT NULL,
    picked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Indexes for fast room lookups
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_votes_room_id ON votes(room_id);
CREATE INDEX IF NOT EXISTS idx_vetoes_room_id ON vetoes(room_id);
CREATE INDEX IF NOT EXISTS idx_history_room_id ON history(room_id);

-- 3. Row Level Security (RLS) - Permissive for friends-only party app
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vetoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;

-- Rooms policies
DROP POLICY IF EXISTS "Public access rooms" ON rooms;
CREATE POLICY "Public access rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);

-- Players policies
DROP POLICY IF EXISTS "Public access players" ON players;
CREATE POLICY "Public access players" ON players FOR ALL USING (true) WITH CHECK (true);

-- Votes policies
DROP POLICY IF EXISTS "Public access votes" ON votes;
CREATE POLICY "Public access votes" ON votes FOR ALL USING (true) WITH CHECK (true);

-- Vetoes policies
DROP POLICY IF EXISTS "Public access vetoes" ON vetoes;
CREATE POLICY "Public access vetoes" ON vetoes FOR ALL USING (true) WITH CHECK (true);

-- History policies
DROP POLICY IF EXISTS "Public access history" ON history;
CREATE POLICY "Public access history" ON history FOR ALL USING (true) WITH CHECK (true);

-- 4. Supabase Realtime Publication
-- Enables live sync for room status and joined players across all devices
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE votes;
ALTER PUBLICATION supabase_realtime ADD TABLE vetoes;
ALTER PUBLICATION supabase_realtime ADD TABLE history;

-- 5. Set replica identity to FULL so realtime updates send old and new records
ALTER TABLE rooms REPLICA IDENTITY FULL;
ALTER TABLE players REPLICA IDENTITY FULL;
ALTER TABLE votes REPLICA IDENTITY FULL;
ALTER TABLE vetoes REPLICA IDENTITY FULL;
ALTER TABLE history REPLICA IDENTITY FULL;
