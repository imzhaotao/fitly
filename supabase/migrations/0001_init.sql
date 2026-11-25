-- Fitly 初始表结构。所有读写走服务端（secret key），表开启 RLS 且不建任何策略，
-- 因此浏览器拿到的 publishable key 无法直接读写这些表。

create extension if not exists pgcrypto;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  name text not null,
  template_id text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_workspace_idx on public.plans (workspace_id, updated_at desc);

create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  label text not null,
  auto boolean not null default false,
  data jsonb not null,
  audit jsonb,
  created_at timestamptz not null default now()
);
create index if not exists snapshots_plan_idx on public.snapshots (plan_id, created_at desc);

create table if not exists public.shares (
  code text primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  snapshot_ids uuid[] not null,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  share_code text not null references public.shares (code) on delete cascade,
  snapshot_id uuid not null,
  nickname text,
  comment text,
  created_at timestamptz not null default now()
);
create index if not exists votes_share_idx on public.votes (share_code, created_at desc);

create table if not exists public.events (
  id bigint generated always as identity primary key,
  workspace_id text,
  name text not null,
  props jsonb,
  created_at timestamptz not null default now()
);

alter table public.plans enable row level security;
alter table public.snapshots enable row level security;
alter table public.shares enable row level security;
alter table public.votes enable row level security;
alter table public.events enable row level security;
