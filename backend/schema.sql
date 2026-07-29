-- SQL Migration Script for Supabase PostgreSQL Database
-- Copy and paste this script into the Supabase SQL Editor to create the claims table.

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  claim TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('True', 'False', 'Misleading', 'Unverified')),
  consensus INTEGER DEFAULT 0,
  votes_helpful INTEGER DEFAULT 0,
  votes_not_helpful INTEGER DEFAULT 0,
  explanation TEXT NOT NULL,
  citations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for fast text lookups during real-time scans
CREATE INDEX IF NOT EXISTS idx_claims_claim ON claims (claim);
