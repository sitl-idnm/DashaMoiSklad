-- 0001 — базовые таблицы (перенос с Supabase на чистый Postgres).
-- Без RLS/политик и Storage: единственный доверенный клиент — наше приложение.

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Метаданные готовых листов сборки (+ превью-данные и выручка).
create table if not exists assembly_sheets (
  id            bigint generated always as identity primary key,
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  filename      text        not null,
  storage_path  text        not null,
  demands       int         not null default 0,
  positions     int         not null default 0,
  rows          int         not null default 0,
  revenue       bigint      not null default 0,
  data          jsonb       not null default '[]'::jsonb,
  source        text        not null default 'auto' check (source in ('auto','manual')),
  created_at    timestamptz not null default now(),
  unique (window_start, window_end)
);
create index if not exists assembly_sheets_created_idx on assembly_sheets (created_at desc);

-- Учётки панели.
create table if not exists moi_sklad_auth (
  username      text primary key,
  salt          text not null,
  password_hash text not null,
  role          text not null default 'operator' check (role in ('admin','operator')),
  created_at    timestamptz not null default now()
);
