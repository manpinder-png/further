-- Live-learning hardening.  0001 describes the product shape; this migration
-- adds the auditability and atomic state transitions the demo needs when two
-- real phones are connected.

create table concept_aliases (
  normalized_title text primary key,
  concept_id uuid not null references concepts on delete cascade,
  source text not null default 'model', -- model | user | curator
  created_at timestamptz not null default now()
);

create table concept_cards (
  concept_id uuid primary key references concepts on delete cascade,
  hook text[] not null,
  citations jsonb not null default '[]', -- [{url,title,start,end}]
  resource_id uuid references resources on delete set null,
  generated_at timestamptz not null default now(),
  model text not null
);

create table session_participants (
  session_id uuid not null references sessions on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  accepted_at timestamptz,
  joined_at timestamptz,
  ended_at timestamptz,
  primary key (session_id, user_id)
);

create table explorer_presence (
  user_id uuid primary key references profiles on delete cascade,
  active_concepts text[] not null default '{}',
  mastery jsonb not null default '{}',
  language text not null default 'en',
  open_to_match boolean not null default true,
  last_active timestamptz not null default now()
);

create table session_messages (
  id bigserial primary key,
  session_id uuid not null references sessions on delete cascade,
  author_id uuid references profiles on delete set null,
  kind text not null check (kind in ('human', 'facilitator')),
  body text not null check (char_length(body) between 1 and 1000),
  guard jsonb,
  created_at timestamptz not null default now()
);
create index session_messages_session_time_idx on session_messages (session_id, created_at);

alter table concept_aliases enable row level security;
alter table concept_cards enable row level security;
alter table session_participants enable row level security;
alter table explorer_presence enable row level security;
alter table session_messages enable row level security;
create policy "read aliases" on concept_aliases for select using (true);
create policy "read cards" on concept_cards for select using (true);
create policy "session participants can read themselves" on session_participants for select using (user_id = auth.uid());
create policy "write own presence" on explorer_presence for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "session members read messages" on session_messages for select using (
  exists (select 1 from session_participants p where p.session_id = session_messages.session_id and p.user_id = auth.uid())
);

-- Event log is canonical; user_nodes is its current, indexed projection.  This
-- single transaction prevents two browser tabs from losing a mastery update.
create or replace function record_learning_event(
  p_concept_id uuid,
  p_kind text,
  p_payload jsonb default '{}'::jsonb
) returns user_nodes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_node user_nodes%rowtype;
  v_interest real;
  v_mastery real;
  v_elapsed_hours double precision;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_kind not in ('seed','open','dwell','skip','watch','explain','session') then
    raise exception 'invalid event kind';
  end if;

  insert into user_nodes (user_id, concept_id, interest, mastery, state, last_touched)
  values (v_user, p_concept_id, 0.5, 0, 'seeded', now())
  on conflict (user_id, concept_id) do nothing;

  select * into v_node from user_nodes
    where user_id = v_user and concept_id = p_concept_id for update;
  v_elapsed_hours := greatest(0, extract(epoch from now() - v_node.last_touched) / 3600.0);
  v_interest := greatest(0, least(1, v_node.interest * power(0.5, v_elapsed_hours / 72.0)));
  v_mastery := v_node.mastery;

  if p_kind = 'open' then v_interest := least(1, v_interest + 0.3); end if;
  if p_kind = 'dwell' then v_interest := least(1, v_interest + 0.2); end if;
  if p_kind = 'skip' then v_interest := greatest(0, v_interest - 0.3); end if;
  if p_kind = 'watch' then v_mastery := least(1, v_mastery + 0.2); end if;
  if p_kind = 'explain' then
    v_mastery := least(1, v_mastery + greatest(0, least(3, coalesce((p_payload->>'score')::int, 0))) / 3.0 * 0.5);
    v_interest := least(1, v_interest + 0.1);
  end if;
  if p_kind = 'session' then
    v_mastery := least(1, v_mastery + 0.2);
    v_interest := least(1, v_interest + 0.2);
  end if;

  update user_nodes set
    interest = v_interest,
    mastery = v_mastery,
    state = case when v_mastery >= 0.7 then 'understood'
                 when v_node.state = 'seeded' and p_kind not in ('seed','skip') then 'explored'
                 else v_node.state end,
    learned_with = coalesce(p_payload->>'with', v_node.learned_with),
    last_touched = now()
  where user_id = v_user and concept_id = p_concept_id
  returning * into v_node;

  insert into events (user_id, concept_id, kind, payload)
  values (v_user, p_concept_id, p_kind, coalesce(p_payload, '{}'::jsonb));
  return v_node;
end;
$$;

-- The 60-second handshake must be atomic.  A client can only record its own
-- answer; the second acceptance creates exactly one session and its two rows.
create or replace function answer_match_request(p_request_id uuid, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_request match_requests%rowtype;
  v_session uuid;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if p_decision not in ('accept','decline') then raise exception 'invalid decision'; end if;
  select * into v_request from match_requests where id = p_request_id for update;
  if not found or v_user not in (v_request.from_user, v_request.to_user) then raise exception 'request not found'; end if;
  if v_request.status <> 'pending' or now() >= v_request.expires_at then
    update match_requests set status = 'expired' where id = p_request_id and status = 'pending';
    return jsonb_build_object('status', 'expired');
  end if;
  if p_decision = 'decline' then
    update match_requests set status = 'declined' where id = p_request_id;
    return jsonb_build_object('status', 'declined');
  end if;
  update match_requests set
    from_accepted = from_accepted or v_user = from_user,
    to_accepted = to_accepted or v_user = to_user
  where id = p_request_id returning * into v_request;
  if v_request.from_accepted and v_request.to_accepted then
    insert into sessions (concept_id, participants) values (v_request.concept_id, array[v_request.from_user, v_request.to_user]) returning id into v_session;
    insert into session_participants (session_id, user_id, accepted_at, joined_at)
      values (v_session, v_request.from_user, now(), now()), (v_session, v_request.to_user, now(), now());
    update match_requests set status = 'accepted' where id = p_request_id;
    return jsonb_build_object('status', 'accepted', 'session_id', v_session);
  end if;
  return jsonb_build_object('status', 'waiting');
end;
$$;

-- A participant may end a room once; the server applies the agreed session
-- credit to both maps in one transaction instead of trusting either browser.
create or replace function finish_learning_session(
  p_session_id uuid,
  p_concept_ids uuid[],
  p_summary jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_participant record;
  v_concept uuid;
begin
  if v_user is null or not exists (select 1 from session_participants where session_id = p_session_id and user_id = v_user) then
    raise exception 'not a session participant';
  end if;
  if exists (select 1 from sessions where id = p_session_id and ended_at is not null) then
    return jsonb_build_object('status', 'already_finished');
  end if;
  update sessions set ended_at = now(), summary = p_summary where id = p_session_id;
  for v_participant in select user_id from session_participants where session_id = p_session_id loop
    for v_concept in select unnest(p_concept_ids) loop
      insert into user_nodes (user_id, concept_id, interest, mastery, state, last_touched)
      values (v_participant.user_id, v_concept, 0.5, 0, 'seeded', now())
      on conflict (user_id, concept_id) do nothing;
      update user_nodes set
        interest = least(1, interest + 0.2),
        mastery = least(1, mastery + 0.2),
        state = case when mastery + 0.2 >= 0.7 then 'understood' else 'explored' end,
        last_touched = now()
      where user_id = v_participant.user_id and concept_id = v_concept;
      insert into events (user_id, concept_id, kind, payload)
      values (v_participant.user_id, v_concept, 'session', jsonb_build_object('session_id', p_session_id));
    end loop;
    update session_participants set ended_at = now() where session_id = p_session_id and user_id = v_participant.user_id;
  end loop;
  return jsonb_build_object('status', 'finished');
end;
$$;
