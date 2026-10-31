-- Further schema (plan §5.1): one shared concept graph + a personal overlay per user.
-- Owner: Connor. RLS on every table (E9 / N3).
create extension if not exists vector;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  static_profile jsonb default '{}',     -- layer 1: who you are
  preferences jsonb default '{}',        -- layer 2: inferred learning style, pace
  current_intent text,                   -- layer 3: point-in-time need
  open_to_match boolean default true,
  language text default 'en',
  is_adult boolean not null default false, -- N4: 18+ for peer matching
  created_at timestamptz default now()
);

create table concepts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text,
  domain text default 'ai-tech',
  embedding vector(384),
  cover_url text                         -- Muse Image tile, decorative only
);
create index concepts_embedding_idx on concepts using hnsw (embedding vector_cosine_ops);

create table concept_edges (
  src uuid references concepts, dst uuid references concepts,
  kind text check (kind in ('prerequisite','related','part_of')),
  primary key (src, dst, kind)
);

create table user_nodes (
  user_id uuid references profiles on delete cascade, concept_id uuid references concepts,
  interest real default 0.5,
  mastery real default 0,
  state text default 'seeded' check (state in ('seeded','explored','understood')),
  learned_with text,
  last_touched timestamptz default now(),
  primary key (user_id, concept_id)
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid references concepts,
  url text not null, kind text, title text, provider text, start_seconds int,
  verified_at timestamptz
);

create table events (
  id bigserial primary key,
  user_id uuid references profiles on delete cascade, concept_id uuid references concepts,
  kind text, payload jsonb, created_at timestamptz default now()
);
create index events_user_time_idx on events (user_id, created_at);

create table match_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid references profiles, to_user uuid references profiles, concept_id uuid references concepts,
  reason text, score real,
  status text default 'pending' check (status in ('pending','accepted','declined','expired')),
  from_accepted boolean default false, to_accepted boolean default false,
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '60 seconds'
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid references concepts, participants uuid[], summary jsonb,
  started_at timestamptz default now(), ended_at timestamptz
);

create table blocks (
  blocker uuid references profiles on delete cascade, blocked uuid references profiles on delete cascade,
  created_at timestamptz default now(), primary key (blocker, blocked)
);
create table reports (
  id bigserial primary key, reporter uuid references profiles, reported uuid references profiles,
  session_id uuid references sessions, reason text, created_at timestamptz default now()
);
create table mcp_tokens (
  user_id uuid references profiles on delete cascade, token_hash text not null unique,
  created_at timestamptz default now(), last_used timestamptz
);
create table rate_hits (
  user_id uuid, bucket text, at timestamptz default now()
);
create index rate_hits_idx on rate_hits (user_id, bucket, at);

-- Row Level Security ----------------------------------------------------------
alter table profiles enable row level security;
alter table concepts enable row level security;
alter table concept_edges enable row level security;
alter table user_nodes enable row level security;
alter table resources enable row level security;
alter table events enable row level security;
alter table match_requests enable row level security;
alter table sessions enable row level security;
alter table blocks enable row level security;
alter table reports enable row level security;
alter table mcp_tokens enable row level security;
alter table rate_hits enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own nodes" on user_nodes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own events" on events for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own blocks" on blocks for all using (blocker = auth.uid()) with check (blocker = auth.uid());
create policy "file reports" on reports for insert with check (reporter = auth.uid());
create policy "own tokens" on mcp_tokens for select using (user_id = auth.uid());
-- Shared graph: readable by everyone, writable only by the service role (no policy = denied).
create policy "read concepts" on concepts for select using (true);
create policy "read edges" on concept_edges for select using (true);
create policy "read resources" on resources for select using (true);
-- Matching: you can see and answer requests you're part of.
create policy "my matches" on match_requests for select using (auth.uid() in (from_user, to_user));
create policy "answer matches" on match_requests for update using (auth.uid() in (from_user, to_user));
create policy "my sessions" on sessions for select using (auth.uid() = any (participants));
