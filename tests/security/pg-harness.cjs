// Shared PGlite harness for the database tests (not a test file itself).
const path = require("node:path");

function loadPglite() {
  const candidates = [process.env.PGLITE_PATH && path.join(process.env.PGLITE_PATH, "@electric-sql", "pglite"), "@electric-sql/pglite"];
  for (const candidate of candidates.filter(Boolean)) {
    try { return require(candidate).PGlite; } catch { /* try next */ }
  }
  return null;
}

// pgcrypto and pg_cron are not available in PGlite.
function prepare(sql) {
  sql = sql.replace(/\r\n/g, "\n").replace("create extension if not exists pgcrypto;", "");
  const start = sql.indexOf("create extension if not exists pg_cron;");
  const endMarker = "$$ select public.delete_old_contacts(); $$\n);";
  const end = sql.indexOf(endMarker);
  if (start >= 0 && end > start) sql = sql.slice(0, start) + sql.slice(end + endMarker.length);
  return sql;
}

// Minimal Supabase-like platform: roles, default privileges, auth schema.
const PLATFORM = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create table auth.sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    refreshed_at timestamp,
    not_after timestamptz);
  create type auth.factor_type as enum ('totp', 'webauthn', 'phone');
  create type auth.factor_status as enum ('unverified', 'verified');
  create table auth.mfa_factors (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    factor_type auth.factor_type not null default 'totp',
    status auth.factor_status not null default 'unverified');
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

module.exports = { loadPglite, prepare, PLATFORM };
