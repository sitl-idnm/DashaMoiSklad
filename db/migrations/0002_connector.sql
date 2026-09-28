-- 0002 — коннектор ВБ ↔ МойСклад (замена MPsklad).
-- ВБ — источник правды; эти таблицы — наша доменная модель.
-- Изоляция по client_id обеспечивается на уровне приложения.

-- ─────────────── Клиенты и доступы ───────────────
create table if not exists clients (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  inn              text,
  moysklad_org_id  text,
  writes_enabled   jsonb not null default '{}'::jsonb,  -- { products,orders,stock,prices : bool }
  archived         boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists clients_created_idx on clients (created_at desc);

create table if not exists wb_credentials (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  scope           text not null check (scope in ('content','marketplace','prices','statistics')),
  token_encrypted text not null,
  token_last4     text not null,
  valid           boolean,
  checked_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (client_id, scope)
);

create table if not exists ms_credentials (
  id                 uuid primary key default gen_random_uuid(),
  client_id          uuid not null references clients(id) on delete cascade,
  login              text not null,
  password_encrypted text not null,
  created_at         timestamptz not null default now(),
  unique (client_id)
);

create table if not exists operator_clients (
  operator_username text not null,
  client_id         uuid not null references clients(id) on delete cascade,
  primary key (operator_username, client_id)
);

-- ─────────────── Группировка клиентов ───────────────
create table if not exists client_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists client_group_members (
  group_id  uuid not null references client_groups(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  primary key (group_id, client_id)
);

-- ─────────────── Доменная модель из ВБ ───────────────
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  wb_nm_id        bigint not null,
  vendor_code     text,
  title           text,
  brand           text,
  subject         text,
  characteristics jsonb,
  photos          jsonb,
  ms_product_id   text,
  updated_at      timestamptz not null default now(),
  unique (client_id, wb_nm_id)
);
create index if not exists products_client_idx on products (client_id);

create table if not exists product_variants (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  wb_chrt_id    bigint,
  tech_size     text,
  barcode       text not null,
  ms_variant_id text,
  updated_at    timestamptz not null default now(),
  unique (product_id, barcode)
);
create index if not exists product_variants_barcode_idx on product_variants (barcode);

create table if not exists orders (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  wb_order_id         bigint not null,
  wb_rid              text,
  supply_id           text,
  status              text,
  nm_id               bigint,
  barcode             text,
  price               bigint,
  address             jsonb,
  created_at_wb       timestamptz,
  ms_customerorder_id text,
  sticker             jsonb,
  kiz                 jsonb,
  updated_at          timestamptz not null default now(),
  unique (client_id, wb_order_id)
);
create index if not exists orders_client_status_idx on orders (client_id, status);

create table if not exists stock (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  barcode      text not null,
  warehouse_id text,
  qty          integer not null default 0,
  source       text not null check (source in ('wb','ms')),
  updated_at   timestamptz not null default now(),
  unique (client_id, barcode, warehouse_id, source)
);
create index if not exists stock_client_idx on stock (client_id);

create table if not exists prices (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references clients(id) on delete cascade,
  nm_id      bigint not null,
  price      bigint,
  discount   integer,
  updated_at timestamptz not null default now(),
  unique (client_id, nm_id)
);
create index if not exists prices_client_idx on prices (client_id);

-- ─────────────── Оркестрация синхронизации ───────────────
create table if not exists sync_runs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  entity      text not null check (entity in ('products','orders','stock','prices')),
  direction   text not null check (direction in ('pull','push','dry_run')),
  cursor      jsonb,
  stats       jsonb not null default '{}'::jsonb,
  status      text not null default 'running' check (status in ('running','done','error')),
  error       text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sync_runs_client_idx on sync_runs (client_id, started_at desc);

create table if not exists sync_jobs (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references sync_runs(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  entity     text not null check (entity in ('products','orders','stock','prices')),
  payload    jsonb not null default '{}'::jsonb,
  state      text not null default 'queued' check (state in ('queued','processing','done','error')),
  attempts   integer not null default 0,
  error      text,
  created_at timestamptz not null default now()
);
create index if not exists sync_jobs_state_idx on sync_jobs (state, created_at);
