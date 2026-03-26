-- Run this SQL in your Supabase SQL Editor to create the draft_state table

CREATE TABLE IF NOT EXISTS draft_state (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id uuid REFERENCES leagues(id) ON DELETE CASCADE UNIQUE NOT NULL,
  is_active boolean DEFAULT false,
  current_pick integer DEFAULT 0,
  turn_order jsonb DEFAULT '[]'::jsonb,
  picks jsonb DEFAULT '[]'::jsonb,
  turn_start_time timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE draft_state;

-- Allow authenticated users to read draft state
CREATE POLICY "Users can read draft state" ON draft_state
  FOR SELECT USING (true);

-- Allow authenticated users to insert/update draft state
CREATE POLICY "Users can insert draft state" ON draft_state
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update draft state" ON draft_state
  FOR UPDATE USING (true);

-- Enable RLS
ALTER TABLE draft_state ENABLE ROW LEVEL SECURITY;
