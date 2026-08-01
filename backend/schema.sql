-- SQL Migration Script for Supabase PostgreSQL Database (CheckAM)
-- Copy and paste this script into the Supabase SQL Editor to initialize your tables.

CREATE TABLE IF NOT EXISTS public.claims (
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

CREATE INDEX IF NOT EXISTS idx_claims_claim ON public.claims (claim);

-- User Profiles table linked to auth.users schema
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  reputation_score NUMERIC DEFAULT 0,
  contributions INTEGER DEFAULT 0,
  subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium')),
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger function to automatically create a public profile when a new user signs up in Supabase Auth
-- Auto-promotes vchidiebere.vc@gmail.com to Admin and Premium status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, subscription_status, role)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), 
    CASE WHEN new.email = 'vchidiebere.vc@gmail.com' THEN 'premium' ELSE 'free' END,
    CASE WHEN new.email = 'vchidiebere.vc@gmail.com' THEN 'admin' ELSE 'user' END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger (drop first to prevent duplicate bindings)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Disable Row Level Security (RLS) to allow database access from client and server APIs
ALTER TABLE IF EXISTS public.claims DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
