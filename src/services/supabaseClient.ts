/**
 * ============================================================================
 * supabaseClient.ts — CLOUD DATABASE CONNECTION
 * ============================================================================
 *
 * Creates the single shared connection to Supabase (a hosted PostgreSQL
 * service with real-time capability) used throughout the application.
 *
 * The client is created ONCE at module load and reused everywhere, rather than
 * being constructed per request. This matters because Supabase maintains a
 * WebSocket for real-time updates; creating multiple clients would open
 * redundant connections.
 *
 * KEY DESIGN DECISION — the null case
 * -----------------------------------
 * If either credential is missing, this module exports `null` rather than
 * throwing an error or creating a broken client. This is deliberate and is
 * what enables the offline fallback described in services/database.ts: every
 * data function begins with `if (supabase)`, so a null client transparently
 * routes all storage to the browser's localStorage instead.
 *
 * The practical consequence is that the prototype runs with no configuration
 * at all — it can be cloned and started with `npm run dev`, and remains fully
 * demonstrable without database credentials or an internet connection.
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

// Read credentials from .env.local (which is git-ignored, keeping keys out of
// version control). The NEXT_PUBLIC_ prefix is a Next.js convention meaning
// the value is deliberately exposed to browser code.
//
// The anon (anonymous) key is safe to expose by design: it grants only the
// permissions defined by the database's Row Level Security policies, unlike
// the service-role key, which must never reach the client.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * The shared database client, or null when credentials are absent.
 *
 * Typed with <Database> (from types/supabase.ts) so that TypeScript checks
 * every query against the real schema — a misspelled column name or a wrong
 * value type is caught at compile time rather than failing at runtime.
 */
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient<Database>(supabaseUrl, supabaseAnonKey)
  : null;
