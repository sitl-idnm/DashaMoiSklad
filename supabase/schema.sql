-- Схема Supabase для «Лист сборки».
-- Выполнить в Supabase Dashboard → SQL Editor.

-- 1) Таблица метаданных готовых листов
create table if not exists public.assembly_sheets (
  id            bigint generated always as identity primary key,
  window_start  timestamptz not null,
  window_end    timestamptz not null,
  filename      text        not null,
  storage_path  text        not null,
  demands       int         not null default 0,
  positions     int         not null default 0,
  rows          int         not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists assembly_sheets_created_idx
  on public.assembly_sheets (created_at desc);

-- 2) RLS: публичное чтение списка, запись — только service-role (обходит RLS)
alter table public.assembly_sheets enable row level security;

drop policy if exists "assembly_sheets public read" on public.assembly_sheets;
create policy "assembly_sheets public read"
  on public.assembly_sheets for select
  using (true);

-- 3) Приватный бакет для XLSX-файлов.
--    Если этой строки недостаточно — создайте бакет вручную:
--    Dashboard → Storage → New bucket → name: assembly-sheets, Public: OFF.
insert into storage.buckets (id, name, public)
values ('assembly-sheets', 'assembly-sheets', false)
on conflict (id) do nothing;
