-- WiseRealm accounts, coins and shop.
-- Run this whole file once in Supabase: SQL Editor → New query → paste → Run.
-- It is safe to run again after updates (it only adds or replaces things).
--
-- Security model: students can READ their own profile, but every change (buying,
-- equipping, earning coins) goes through the functions below, which check the rules.
-- Only emails listed in `teachers` can start coin-earning games or give coins.
--
-- Privacy model: a teacher can only see students who are in one of THEIR classes or who
-- joined one of THEIR games (teacher_sees). Students never see each other's emails or real names.

-- ---------- Tables ----------
create table if not exists public.teachers (
  email text primary key
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null default 'Hero',
  avatar jsonb not null default '{}'::jsonb,
  coins integer not null default 0 check (coins >= 0),
  owned text[] not null default '{}',
  created_at timestamptz not null default now()
);
-- The student's real name from their school Google account. Only their own teachers see it;
-- in games everyone sees display_name, which the student can change.
alter table public.profiles add column if not exists real_name text;

create table if not exists public.shop_items (
  id text primary key,
  slot text not null,
  name text not null,
  price integer not null check (price >= 0)
);

create table if not exists public.games (
  code text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  mode text,
  created_at timestamptz not null default now(),
  awarded_rounds integer[] not null default '{}'
);

create table if not exists public.game_players (
  code text not null references public.games (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (code, user_id)
);
-- A random "ticket" made by the student's iPad for this game. The projector looks it up with
-- game_roster(), so account IDs never travel over the live game connection.
alter table public.game_players add column if not exists device text;
create unique index if not exists game_players_device on public.game_players (code, device);

create table if not exists public.coin_log (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.teachers enable row level security;
alter table public.profiles enable row level security;
alter table public.shop_items enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.coin_log enable row level security;

-- ---------- Helpers ----------
create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.teachers t where lower(t.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- "Maya Lopez" → "Maya L." (first name + last initial, max 16 characters)
create or replace function public.make_display_name(meta jsonb, email text) returns text
language plpgsql immutable as $$
declare
  -- School accounts often include a student ID number (e.g. "Maya Lopez 1150033"); leave it out.
  full_name text := trim(regexp_replace(coalesce(meta ->> 'full_name', meta ->> 'name', split_part(coalesce(email, 'Hero'), '@', 1)), '[0-9]{3,}', ' ', 'g'));
  parts text[] := regexp_split_to_array(full_name, '\s+');
  n int := coalesce(array_length(parts, 1), 0);
begin
  if n = 0 or length(parts[1]) < 2 then return 'Hero'; end if;
  if n = 1 then return left(parts[1], 16); end if;
  return left(parts[1] || ' ' || left(parts[n], 1) || '.', 16);
end $$;

create or replace function public.real_name_of(meta jsonb) returns text
language sql immutable as $$
  select nullif(left(trim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), 80), '');
$$;

-- ---------- Row level security (read-only access; changes go through functions) ----------
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid());

drop policy if exists "anyone can read the shop" on public.shop_items;
create policy "anyone can read the shop" on public.shop_items for select using (true);

drop policy if exists "read own coin history" on public.coin_log;
create policy "read own coin history" on public.coin_log for select using (user_id = auth.uid());

-- ---------- New accounts get a profile automatically ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, real_name)
  values (new.id, new.email, public.make_display_name(new.raw_user_meta_data, new.email), public.real_name_of(new.raw_user_meta_data))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Student functions ----------
create or replace function public.my_profile() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare prof public.profiles; u auth.users;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into prof from public.profiles where id = auth.uid();
  if not found then
    select * into u from auth.users where id = auth.uid();
    insert into public.profiles (id, email, display_name, real_name)
    values (u.id, u.email, public.make_display_name(u.raw_user_meta_data, u.email), public.real_name_of(u.raw_user_meta_data))
    returning * into prof;
  elsif prof.real_name is null then
    select * into u from auth.users where id = auth.uid();
    update public.profiles set real_name = public.real_name_of(u.raw_user_meta_data) where id = auth.uid() returning * into prof;
  end if;
  return prof;
end $$;

create or replace function public.am_i_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher();
$$;

create or replace function public.buy_item(p_item text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare prof public.profiles; item public.shop_items;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform public.my_profile();
  select * into item from public.shop_items where id = p_item;
  if not found then raise exception 'That item does not exist'; end if;
  select * into prof from public.profiles where id = auth.uid() for update;
  if p_item = any (prof.owned) then raise exception 'You already own that'; end if;
  if item.milestone is not null then raise exception 'That is earned with a learning milestone, not bought'; end if;
  if prof.coins < item.price then raise exception 'Not enough coins'; end if;
  update public.profiles set coins = coins - item.price, owned = array_append(owned, p_item)
    where id = auth.uid() returning * into prof;
  insert into public.coin_log (user_id, amount, reason) values (auth.uid(), -item.price, 'Bought ' || item.name);
  return prof;
end $$;

create or replace function public.set_avatar(p_avatar jsonb) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare prof public.profiles; slot text; v text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform public.my_profile();
  if jsonb_typeof(p_avatar) <> 'object' or length(p_avatar::text) > 600 then raise exception 'Invalid hero'; end if;
  select * into prof from public.profiles where id = auth.uid() for update;
  foreach slot in array array['phat', 'top', 'cape', 'acc', 'pet', 'pet2'] loop
    v := p_avatar ->> slot;
    if v is not null and not (v = any (prof.owned)) then raise exception 'You do not own %', v; end if;
  end loop;
  update public.profiles set avatar = p_avatar where id = auth.uid() returning * into prof;
  return prof;
end $$;

-- A signed-in student joining a live game (so they can earn coins in it).
-- p_device is a random ticket from the student's iPad (see game_players.device).
-- If the teacher picked a class for this game, the student is added to that class too.
drop function if exists public.join_game(text);
create or replace function public.join_game(p_code text, p_device text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.games; cname text;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false); end if;
  if p_device is null or length(p_device) not between 8 and 64 then raise exception 'Invalid device'; end if;
  perform public.my_profile();
  select * into g from public.games where code = p_code and created_at > now() - interval '12 hours';
  if not found then return jsonb_build_object('ok', false); end if;
  if exists (select 1 from public.game_players where code = p_code and device = p_device and user_id <> auth.uid()) then
    raise exception 'Invalid device';
  end if;
  insert into public.game_players (code, user_id, device) values (p_code, auth.uid(), p_device)
    on conflict (code, user_id) do update set device = excluded.device;
  if g.class_id is not null then
    select c.name into cname from public.classes c where c.id = g.class_id and not c.archived;
    if cname is not null then
      insert into public.class_members (class_id, user_id) values (g.class_id, auth.uid()) on conflict do nothing;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'class', cname);
end $$;

-- ---------- Teacher functions ----------
create or replace function public.create_game(p_code text, p_mode text) returns boolean
language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  select * into g from public.games where code = p_code;
  if found then
    if g.teacher_id <> auth.uid() and g.created_at > now() - interval '12 hours' then
      raise exception 'That game code is in use';
    end if;
    delete from public.games where code = p_code; -- also clears its players
  end if;
  insert into public.games (code, teacher_id, mode) values (p_code, auth.uid(), p_mode);
  return true;
end $$;

-- p_awards is {"<user id>": coins, ...}. Each student gets at most 300 coins per round,
-- only if they really joined this game, and each round can only be paid out once.
create or replace function public.award_coins(p_code text, p_round integer, p_awards jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare g public.games; rec record; amt integer; uid uuid; paid integer := 0;
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  select * into g from public.games where code = p_code for update;
  if not found or g.teacher_id <> auth.uid() then raise exception 'Not your game'; end if;
  if p_round = any (g.awarded_rounds) then return 0; end if;
  update public.games set awarded_rounds = array_append(awarded_rounds, p_round) where code = p_code;
  for rec in select key, value from jsonb_each_text(p_awards) loop
    begin
      uid := rec.key::uuid;
    exception when others then continue;
    end;
    amt := least(greatest(coalesce(nullif(rec.value, '')::numeric, 0)::integer, 0), 300);
    if amt > 0 and exists (select 1 from public.game_players where code = p_code and user_id = uid) then
      update public.profiles set coins = coins + amt where id = uid;
      insert into public.coin_log (user_id, amount, reason) values (uid, amt, 'Game ' || p_code || ' (' || coalesce(g.mode, 'game') || ')');
      paid := paid + 1;
    end if;
  end loop;
  return paid;
end $$;

-- Only the students in my classes or my games (never every account on the site).
drop function if exists public.list_students();
create or replace function public.list_students()
returns table (id uuid, display_name text, real_name text, email text, coins integer, items integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  return query
    select p.id, p.display_name, p.real_name, p.email, p.coins, coalesce(array_length(p.owned, 1), 0), p.created_at
    from public.profiles p where p.id <> auth.uid() and public.teacher_sees(p.id)
    order by coalesce(p.real_name, p.display_name);
end $$;

-- Bonus (or penalty) coins from the teacher, up to 1000 at a time.
create or replace function public.give_coins(p_user uuid, p_amount integer, p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare newc integer;
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  if abs(p_amount) > 1000 then raise exception 'At most 1000 coins at a time'; end if;
  if not public.teacher_sees(p_user) then raise exception 'That student isn''t in one of your classes or games'; end if;
  update public.profiles set coins = greatest(0, coins + p_amount) where id = p_user returning coins into newc;
  if not found then raise exception 'Student not found'; end if;
  insert into public.coin_log (user_id, amount, reason) values (p_user, p_amount, coalesce(nullif(p_reason, ''), 'From your teacher'));
  return newc;
end $$;

-- Only signed-in users may call the functions above (they also check inside).
revoke all on function public.my_profile(), public.buy_item(text), public.set_avatar(jsonb), public.join_game(text, text),
  public.create_game(text, text), public.award_coins(text, integer, jsonb), public.list_students(),
  public.give_coins(uuid, integer, text), public.am_i_teacher() from public, anon;
grant execute on function public.my_profile(), public.buy_item(text), public.set_avatar(jsonb), public.join_game(text, text),
  public.create_game(text, text), public.award_coins(text, integer, jsonb), public.list_students(),
  public.give_coins(uuid, integer, text), public.am_i_teacher() to authenticated;

-- ================= Classes & progress =================
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  join_code text not null unique,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

-- One row per game played. `questions` holds [{p: prompt, a: answer, n: answered, r: right}, ...]
create table if not exists public.game_sessions (
  id bigserial primary key,
  code text not null,
  round integer not null,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  class_id uuid references public.classes (id) on delete set null,
  mode text,
  set_title text,
  question_count integer not null default 0,
  questions jsonb not null default '[]'::jsonb,
  played_at timestamptz not null default now(),
  unique (code, round)
);

-- One row per signed-in student per game. `missed` lists the question numbers they missed.
create table if not exists public.game_results (
  session_id bigint not null references public.game_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  score integer not null default 0,
  correct integer not null default 0,
  answered integer not null default 0,
  total integer not null default 0,
  rank integer,
  coins integer not null default 0,
  missed jsonb not null default '[]'::jsonb,
  primary key (session_id, user_id)
);
alter table public.game_results add column if not exists players integer; -- how many people played that game
create index if not exists game_results_user on public.game_results (user_id);
create index if not exists game_sessions_class on public.game_sessions (class_id, played_at);

alter table public.games add column if not exists class_id uuid references public.classes (id) on delete set null;

-- Can the signed-in teacher see this student? Only if the student is in one of their
-- classes or joined one of their games.
create or replace function public.teacher_sees(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_teacher() and (
    exists (select 1 from public.class_members m join public.classes c on c.id = m.class_id
            where m.user_id = p_user and c.teacher_id = auth.uid())
    or exists (select 1 from public.game_players gp join public.games g on g.code = gp.code
            where gp.user_id = p_user and g.teacher_id = auth.uid()));
$$;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid() or public.teacher_sees(id));
drop policy if exists "read own coin history" on public.coin_log;
create policy "read own coin history" on public.coin_log for select using (user_id = auth.uid() or public.teacher_sees(user_id));

-- Remove student ID numbers from automatic in-game names (only names the student never changed).
update public.profiles p set display_name = public.make_display_name(u.raw_user_meta_data, u.email)
  from auth.users u where u.id = p.id and p.display_name ~ '[0-9]{3,}'
  and position(substring(p.display_name from '[0-9]{3,}') in coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email, '')) > 0;

-- Backfill real names for accounts made before real_name existed.
update public.profiles p set real_name = public.real_name_of(u.raw_user_meta_data)
  from auth.users u where u.id = p.id and p.real_name is null and public.real_name_of(u.raw_user_meta_data) is not null;

alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_results enable row level security;
-- (No direct table access: everything goes through the functions below.)

create or replace function public.owns_class(p_class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes where id = p_class and teacher_id = auth.uid());
$$;

create or replace function public.new_join_code() returns text
language plpgsql volatile set search_path = public as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.classes where join_code = c);
  end loop;
  return c;
end $$;

-- ---------- Teacher: classes ----------
create or replace function public.create_class(p_name text) returns public.classes
language plpgsql security definer set search_path = public as $$
declare c public.classes;
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  insert into public.classes (teacher_id, name, join_code)
  values (auth.uid(), left(trim(p_name), 60), public.new_join_code()) returning * into c;
  return c;
end $$;

create or replace function public.update_class(p_class uuid, p_name text, p_archived boolean) returns public.classes
language plpgsql security definer set search_path = public as $$
declare c public.classes;
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  update public.classes set name = coalesce(nullif(left(trim(p_name), 60), ''), name), archived = coalesce(p_archived, archived)
    where id = p_class returning * into c;
  return c;
end $$;

create or replace function public.teacher_classes()
returns table (id uuid, name text, join_code text, archived boolean, created_at timestamptz, members integer, games integer, accuracy numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  return query
    select c.id, c.name, c.join_code, c.archived, c.created_at,
      (select count(*)::int from public.class_members m where m.class_id = c.id),
      (select count(*)::int from public.game_sessions s where s.class_id = c.id),
      (select round(100.0 * sum(r.correct) / nullif(sum(r.total), 0), 1) from public.game_results r
         join public.game_sessions s on s.id = r.session_id where s.class_id = c.id)
    from public.classes c where c.teacher_id = auth.uid() order by c.archived, c.created_at;
end $$;

create or replace function public.remove_member(p_class uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  delete from public.class_members where class_id = p_class and user_id = p_user;
  return true;
end $$;

-- ---------- Students: join a class, see my progress ----------
create or replace function public.join_class(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.classes;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform public.my_profile();
  select * into c from public.classes where join_code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')) and not archived;
  if not found then raise exception 'No class with that code'; end if;
  insert into public.class_members (class_id, user_id) values (c.id, auth.uid()) on conflict do nothing;
  return c.name;
end $$;

create or replace function public.leave_class(p_class uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from public.class_members where class_id = p_class and user_id = auth.uid();
  return true;
end $$;

create or replace function public.my_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); out jsonb;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select jsonb_build_object(
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'teacher', coalesce(tp.display_name, 'Teacher')) order by c.name)
        from public.class_members m join public.classes c on c.id = m.class_id left join public.profiles tp on tp.id = c.teacher_id
        where m.user_id = me and not c.archived), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(g order by g ->> 'played_at') from (
        select jsonb_build_object('played_at', s.played_at, 'mode', s.mode, 'set_title', s.set_title, 'score', r.score,
          'correct', r.correct, 'answered', r.answered, 'total', r.total, 'rank', r.rank, 'coins', r.coins,
          'players', coalesce(r.players, (select count(*) from public.game_results r2 where r2.session_id = s.id))) g
        from public.game_results r join public.game_sessions s on s.id = r.session_id
        where r.user_id = me order by s.played_at desc limit 100) x), '[]'::jsonb),
    'coins_earned', coalesce((select sum(amount) from public.coin_log where user_id = me and amount > 0), 0),
    'items', (select coalesce(array_length(owned, 1), 0) from public.profiles where id = me)
  ) into out;
  return out;
end $$;

-- ---------- Teacher: save a finished game ----------
-- p_results: [{uid, score, correct, answered, total, rank, coins, missed: [question numbers]}]
-- Only students who really joined this game (game_players) are saved. With a class chosen,
-- those students are also added to the class automatically.
create or replace function public.record_game(p_code text, p_round integer, p_class uuid, p_mode text, p_set_title text,
  p_questions jsonb, p_results jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare g public.games; sid bigint; r jsonb; uid uuid;
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  select * into g from public.games where code = p_code;
  if not found or g.teacher_id <> auth.uid() then raise exception 'Not your game'; end if;
  if p_class is not null and not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  insert into public.game_sessions (code, round, teacher_id, class_id, mode, set_title, question_count, questions)
  values (p_code, p_round, auth.uid(), p_class, left(p_mode, 30), left(p_set_title, 120),
          coalesce(jsonb_array_length(p_questions), 0), coalesce(p_questions, '[]'::jsonb))
  on conflict (code, round) do nothing returning id into sid;
  if sid is null then select id into sid from public.game_sessions where code = p_code and round = p_round; return sid; end if;
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    begin uid := (r ->> 'uid')::uuid; exception when others then continue; end;
    if not exists (select 1 from public.game_players where code = p_code and user_id = uid) then continue; end if;
    insert into public.game_results (session_id, user_id, score, correct, answered, total, rank, players, coins, missed)
    values (sid, uid, coalesce((r ->> 'score')::int, 0), coalesce((r ->> 'correct')::int, 0), coalesce((r ->> 'answered')::int, 0),
            coalesce((r ->> 'total')::int, 0), (r ->> 'rank')::int, (r ->> 'players')::int, coalesce((r ->> 'coins')::int, 0), coalesce(r -> 'missed', '[]'::jsonb))
    on conflict do nothing;
    if p_class is not null then
      insert into public.class_members (class_id, user_id) values (p_class, uid) on conflict do nothing;
    end if;
  end loop;
  return sid;
end $$;

-- ---------- Teacher: progress reports ----------
drop function if exists public.class_overview(uuid);
create or replace function public.class_overview(p_class uuid)
returns table (user_id uuid, display_name text, real_name text, email text, coins integer, games integer, correct integer, total integer,
               accuracy numeric, last_played timestamptz, recent jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  return query
    select p.id, p.display_name, p.real_name, p.email, p.coins,
      count(r.session_id)::int, coalesce(sum(r.correct), 0)::int, coalesce(sum(r.total), 0)::int,
      round(100.0 * sum(r.correct) / nullif(sum(r.total), 0), 1), max(s.played_at),
      coalesce((select jsonb_agg(x.acc order by x.played_at) from (
        select s2.played_at, round(100.0 * r2.correct / nullif(r2.total, 0)) acc
        from public.game_results r2 join public.game_sessions s2 on s2.id = r2.session_id
        where r2.user_id = p.id and s2.class_id = p_class order by s2.played_at desc limit 10) x), '[]'::jsonb)
    from public.class_members m
    join public.profiles p on p.id = m.user_id
    left join public.game_results r on r.user_id = m.user_id
      and r.session_id in (select id from public.game_sessions where class_id = p_class)
    left join public.game_sessions s on s.id = r.session_id
    where m.class_id = p_class
    group by p.id, p.display_name, p.real_name, p.email, p.coins
    order by coalesce(p.real_name, p.display_name);
end $$;

create or replace function public.class_sessions(p_class uuid)
returns table (id bigint, played_at timestamptz, mode text, set_title text, players integer, accuracy numeric, question_count integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  return query
    select s.id, s.played_at, s.mode, s.set_title, count(r.user_id)::int,
      round(100.0 * sum(r.correct) / nullif(sum(r.total), 0), 1), s.question_count
    from public.game_sessions s left join public.game_results r on r.session_id = s.id
    where s.class_id = p_class group by s.id order by s.played_at desc limit 200;
end $$;

create or replace function public.session_detail(p_session bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s public.game_sessions;
begin
  select * into s from public.game_sessions where id = p_session;
  if not found or s.teacher_id <> auth.uid() then raise exception 'Not your game'; end if;
  return jsonb_build_object('id', s.id, 'played_at', s.played_at, 'mode', s.mode, 'set_title', s.set_title, 'questions', s.questions,
    'results', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'name', p.display_name, 'real_name', p.real_name, 'score', r.score, 'correct', r.correct,
        'answered', r.answered, 'total', r.total, 'rank', r.rank, 'missed', r.missed) order by r.rank nulls last, r.score desc)
      from public.game_results r join public.profiles p on p.id = r.user_id where r.session_id = s.id), '[]'::jsonb));
end $$;

-- Questions the class gets wrong most often (across every game played with this class).
create or replace function public.class_hard_questions(p_class uuid)
returns table (prompt text, answer text, asked integer, right_count integer, pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  return query
    select q ->> 'p', max(q ->> 'a'), sum((q ->> 'n')::int)::int, sum((q ->> 'r')::int)::int,
      round(100.0 * sum((q ->> 'r')::int) / nullif(sum((q ->> 'n')::int), 0), 1)
    from public.game_sessions s, jsonb_array_elements(s.questions) q
    where s.class_id = p_class and coalesce((q ->> 'n')::int, 0) > 0
    group by q ->> 'p'
    order by 5 asc nulls last, 3 desc
    limit 50;
end $$;

create or replace function public.student_detail(p_class uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  return jsonb_build_object(
    'profile', (select jsonb_build_object('id', p.id, 'name', p.display_name, 'real_name', p.real_name, 'email', p.email, 'coins', p.coins)
       from public.profiles p join public.class_members m on m.user_id = p.id and m.class_id = p_class where p.id = p_user),
    'games', coalesce((select jsonb_agg(g order by g ->> 'played_at') from (
        select jsonb_build_object('played_at', s.played_at, 'mode', s.mode, 'set_title', s.set_title, 'score', r.score, 'correct', r.correct,
          'answered', r.answered, 'total', r.total, 'rank', r.rank,
          'players', coalesce(r.players, (select count(*) from public.game_results r2 where r2.session_id = s.id))) g
        from public.game_results r join public.game_sessions s on s.id = r.session_id
        where r.user_id = p_user and s.class_id = p_class order by s.played_at desc limit 60) x), '[]'::jsonb),
    'missed', coalesce((select jsonb_agg(jsonb_build_object('prompt', m.prompt, 'answer', m.answer, 'times', m.times) order by m.times desc, m.last desc) from (
        select s.questions -> (mi.value)::int ->> 'p' prompt, max(s.questions -> (mi.value)::int ->> 'a') answer, count(*)::int times, max(s.played_at) last
        from public.game_results r join public.game_sessions s on s.id = r.session_id, jsonb_array_elements_text(r.missed) mi
        where r.user_id = p_user and s.class_id = p_class
        group by 1 limit 30) m), '[]'::jsonb));
end $$;

revoke all on function public.create_class(text), public.update_class(uuid, text, boolean), public.teacher_classes(),
  public.remove_member(uuid, uuid), public.join_class(text), public.leave_class(uuid), public.my_stats(),
  public.record_game(text, integer, uuid, text, text, jsonb, jsonb), public.class_overview(uuid), public.class_sessions(uuid),
  public.session_detail(bigint), public.class_hard_questions(uuid), public.student_detail(uuid, uuid) from public, anon;
grant execute on function public.create_class(text), public.update_class(uuid, text, boolean), public.teacher_classes(),
  public.remove_member(uuid, uuid), public.join_class(text), public.leave_class(uuid), public.my_stats(),
  public.record_game(text, integer, uuid, text, text, jsonb, jsonb), public.class_overview(uuid), public.class_sessions(uuid),
  public.session_detail(bigint), public.class_hard_questions(uuid), public.student_detail(uuid, uuid) to authenticated;

-- ================= Teacher accounts: question sets & colleagues =================
create table if not exists public.question_sets (
  id text primary key,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Untitled set',
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists question_sets_teacher on public.question_sets (teacher_id);
alter table public.question_sets enable row level security;

create or replace function public.list_sets()
returns table (id text, title text, items jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  return query select q.id, q.title, q.items, q.updated_at from public.question_sets q
    where q.teacher_id = auth.uid() order by q.updated_at desc;
end $$;

create or replace function public.save_set(p_id text, p_title text, p_items jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare owner uuid; t timestamptz := now();
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  if p_id is null or length(p_id) > 40 then raise exception 'Invalid set id'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 1000 or length(p_items::text) > 400000 then
    raise exception 'That set is too big (max 1000 questions)';
  end if;
  select teacher_id into owner from public.question_sets where id = p_id;
  if found and owner <> auth.uid() then raise exception 'Not your set'; end if;
  insert into public.question_sets (id, teacher_id, title, items, updated_at)
  values (p_id, auth.uid(), left(coalesce(nullif(trim(p_title), ''), 'Untitled set'), 120), p_items, t)
  on conflict (id) do update set title = excluded.title, items = excluded.items, updated_at = t;
  return t;
end $$;

create or replace function public.delete_set(p_id text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  delete from public.question_sets where id = p_id and teacher_id = auth.uid();
  return true;
end $$;

-- Teachers can add colleagues (who then get their own separate classes and sets).
create or replace function public.list_teachers() returns table (email text, signed_up boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  return query select t.email, exists (select 1 from auth.users u where lower(u.email) = lower(t.email)) from public.teachers t order by t.email;
end $$;

create or replace function public.add_teacher(p_email text) returns boolean
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(p_email));
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That doesn''t look like an email address'; end if;
  insert into public.teachers (email) values (e) on conflict do nothing;
  return true;
end $$;

create or replace function public.remove_teacher(p_email text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  if lower(trim(p_email)) = lower(coalesce(auth.jwt() ->> 'email', '')) then raise exception 'You can''t remove yourself'; end if;
  delete from public.teachers where lower(email) = lower(trim(p_email));
  return true;
end $$;

-- Which shop items (e.g. emotes) the players in my game own, so the projector only shows real ones.
create or replace function public.players_owned(p_users uuid[]) returns table (id uuid, owned text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  return query select p.id, p.owned from public.profiles p where p.id = any (p_users) and public.teacher_sees(p.id);
end $$;

-- The projector asks: which signed-in student is on which iPad in my game?
create or replace function public.game_roster(p_code text)
returns table (device text, user_id uuid, display_name text, real_name text, avatar jsonb, owned text[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.games g where g.code = p_code and g.teacher_id = auth.uid()) then
    raise exception 'Not your game';
  end if;
  return query select gp.device, p.id, p.display_name, p.real_name, p.avatar, p.owned
    from public.game_players gp join public.profiles p on p.id = gp.user_id
    where gp.code = p_code and gp.device is not null;
end $$;

-- Students who sign in and join this game are added to this class automatically.
create or replace function public.set_game_class(p_code text, p_class uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.games g where g.code = p_code and g.teacher_id = auth.uid()) then
    raise exception 'Not your game';
  end if;
  if p_class is not null and not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  update public.games set class_id = p_class where code = p_code;
  if p_class is not null then
    insert into public.class_members (class_id, user_id)
      select p_class, gp.user_id from public.game_players gp where gp.code = p_code on conflict do nothing;
  end if;
  return true;
end $$;

revoke all on function public.list_sets(), public.save_set(text, text, jsonb), public.delete_set(text), public.list_teachers(),
  public.add_teacher(text), public.remove_teacher(text), public.players_owned(uuid[]),
  public.game_roster(text), public.set_game_class(text, uuid) from public, anon;
grant execute on function public.list_sets(), public.save_set(text, text, jsonb), public.delete_set(text), public.list_teachers(),
  public.add_teacher(text), public.remove_teacher(text), public.players_owned(uuid[]),
  public.game_roster(text), public.set_game_class(text, uuid) to authenticated;

-- ================= Solo practice (study games) =================
-- Teachers assign question sets to classes; students practice them in single-player games.
-- The database checks every answer against the set, tracks mastery per card (0-3 stars),
-- and pays at most 50 practice coins per student per day.
create table if not exists public.class_sets (
  class_id uuid not null references public.classes (id) on delete cascade,
  set_id text not null references public.question_sets (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (class_id, set_id)
);
create table if not exists public.practice_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id text not null references public.question_sets (id) on delete cascade,
  card_key text not null,
  box integer not null default 0,
  seen integer not null default 0,
  right_count integer not null default 0,
  last_seen timestamptz,
  primary key (user_id, set_id, card_key)
);
create table if not exists public.practice_sessions (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id text references public.question_sets (id) on delete set null,
  game text,
  correct integer not null default 0,
  answered integer not null default 0,
  score integer not null default 0,
  duration_s integer not null default 0,
  coins integer not null default 0,
  played_at timestamptz not null default now()
);
create index if not exists practice_sessions_user on public.practice_sessions (user_id, played_at);
alter table public.class_sets enable row level security;
alter table public.practice_cards enable row level security;
alter table public.practice_sessions enable row level security;

create or replace function public.card_key(prompt text) returns text
language sql immutable as $$ select left(lower(trim(coalesce(prompt, ''))), 500) $$;

create or replace function public.safe_tz(p_tz text) returns text
language plpgsql stable as $$
begin
  perform now() at time zone p_tz;
  return p_tz;
exception when others then return 'UTC';
end $$;

create or replace function public.can_practice(p_set text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_sets cs join public.class_members m on m.class_id = cs.class_id
                 join public.classes c on c.id = cs.class_id
                 where cs.set_id = p_set and m.user_id = auth.uid() and not c.archived)
      or exists (select 1 from public.question_sets q where q.id = p_set and q.teacher_id = auth.uid());
$$;

create or replace function public.practice_streak(p_user uuid, p_tz text) returns integer
language plpgsql stable security definer set search_path = public as $$
declare tz text := public.safe_tz(p_tz); d date := (now() at time zone tz)::date; n int := 0;
begin
  if not exists (select 1 from public.practice_sessions where user_id = p_user and (played_at at time zone tz)::date = d) then d := d - 1; end if;
  while exists (select 1 from public.practice_sessions where user_id = p_user and (played_at at time zone tz)::date = d) loop
    n := n + 1; d := d - 1;
  end loop;
  return n;
end $$;

-- ---------- Teacher: assign sets ----------
create or replace function public.assign_set(p_class uuid, p_set text, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  if not exists (select 1 from public.question_sets where id = p_set and teacher_id = auth.uid()) then
    raise exception 'That set isn''t saved to your account yet';
  end if;
  if p_on then insert into public.class_sets (class_id, set_id) values (p_class, p_set) on conflict do nothing;
  else delete from public.class_sets where class_id = p_class and set_id = p_set; end if;
  return true;
end $$;

create or replace function public.class_assigned_sets(p_class uuid) returns table (set_id text, title text, cards integer, assigned_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  return query select q.id, q.title, jsonb_array_length(q.items), cs.assigned_at
    from public.class_sets cs join public.question_sets q on q.id = cs.set_id where cs.class_id = p_class order by cs.assigned_at;
end $$;

drop function if exists public.class_practice(uuid, text);
create or replace function public.class_practice(p_class uuid, p_tz text)
returns table (user_id uuid, display_name text, real_name text, sessions integer, minutes integer, last_practiced timestamptz,
               mastered integer, total_cards integer, streak integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  return query
    select p.id, p.display_name, p.real_name,
      (select count(*)::int from public.practice_sessions s where s.user_id = p.id and s.set_id in (select cs.set_id from public.class_sets cs where cs.class_id = p_class)),
      (select coalesce(sum(s.duration_s), 0)::int / 60 from public.practice_sessions s where s.user_id = p.id and s.set_id in (select cs.set_id from public.class_sets cs where cs.class_id = p_class)),
      (select max(s.played_at) from public.practice_sessions s where s.user_id = p.id),
      (select count(*)::int from public.practice_cards pc where pc.user_id = p.id and pc.box >= 3 and pc.set_id in (select cs.set_id from public.class_sets cs where cs.class_id = p_class)),
      (select coalesce(sum(jsonb_array_length(q.items)), 0)::int from public.class_sets cs join public.question_sets q on q.id = cs.set_id where cs.class_id = p_class),
      public.practice_streak(p.id, p_tz)
    from public.class_members m join public.profiles p on p.id = m.user_id
    where m.class_id = p_class order by coalesce(p.real_name, p.display_name);
end $$;

-- ---------- Students: practice ----------
create or replace function public.my_practice(p_tz text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); tz text := public.safe_tz(p_tz);
begin
  if me is null then raise exception 'Not signed in'; end if;
  return jsonb_build_object(
    'sets', coalesce((select jsonb_agg(x order by x ->> 'class_name', x ->> 'title') from (
      select distinct on (q.id) jsonb_build_object('id', q.id, 'title', q.title, 'class_name', c.name, 'items', q.items,
        'cards', jsonb_array_length(q.items),
        'mastered', (select count(*) from public.practice_cards pc where pc.user_id = me and pc.set_id = q.id and pc.box >= 3),
        'seen', (select count(*) from public.practice_cards pc where pc.user_id = me and pc.set_id = q.id)) x
      from public.class_members m join public.classes c on c.id = m.class_id and not c.archived
      join public.class_sets cs on cs.class_id = c.id join public.question_sets q on q.id = cs.set_id
      where m.user_id = me order by q.id) y), '[]'::jsonb),
    'streak', public.practice_streak(me, tz),
    'today_coins', (select coalesce(sum(coins), 0) from public.practice_sessions where user_id = me and (played_at at time zone tz)::date = (now() at time zone tz)::date),
    'cap', 50);
end $$;

create or replace function public.my_cards(p_set text) returns table (card_key text, box integer, seen integer, right_count integer, last_seen timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_practice(p_set) then raise exception 'That set isn''t assigned to your class'; end if;
  return query select pc.card_key, pc.box, pc.seen, pc.right_count, pc.last_seen from public.practice_cards pc where pc.user_id = auth.uid() and pc.set_id = p_set;
end $$;

-- p_answers: [{q: question number in the set, a: the answer text the student chose}]
create or replace function public.save_practice(p_set text, p_game text, p_answers jsonb, p_score integer, p_duration integer, p_tz text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); tz text := public.safe_tz(p_tz); items jsonb; a jsonb; item jsonb; ok boolean;
  n_right int := 0; n_ans int := 0; today int; earn int; sid bigint; dur int := greatest(1, least(coalesce(p_duration, 0), 7200));
begin
  if me is null then raise exception 'Not signed in'; end if;
  if not public.can_practice(p_set) then raise exception 'That set isn''t assigned to your class'; end if;
  perform public.my_profile();
  select q.items into items from public.question_sets q where q.id = p_set;
  for a in select * from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) limit 300 loop
    begin item := items -> ((a ->> 'q')::int); exception when others then continue; end;
    if item is null then continue; end if;
    ok := lower(trim(coalesce(a ->> 'a', ''))) = lower(trim(coalesce(item ->> 'answer', '')));
    n_ans := n_ans + 1; if ok then n_right := n_right + 1; end if;
    insert into public.practice_cards as pc (user_id, set_id, card_key, box, seen, right_count, last_seen)
    values (me, p_set, public.card_key(item ->> 'prompt'), case when ok then 1 else 0 end, 1, case when ok then 1 else 0 end, now())
    on conflict (user_id, set_id, card_key) do update set
      box = case when ok then least(3, pc.box + 1) else 0 end, seen = pc.seen + 1,
      right_count = pc.right_count + case when ok then 1 else 0 end, last_seen = now();
  end loop;
  select coalesce(sum(coins), 0) into today from public.practice_sessions
    where user_id = me and (played_at at time zone tz)::date = (now() at time zone tz)::date;
  -- 1 coin per 2 right answers (+3 for a full session), at most 20 per game and 50 per day.
  earn := least(20, n_right / 2 + case when n_ans >= 10 then 3 else 0 end, greatest(0, 50 - today));
  if n_ans > dur * 2 then earn := 0; end if; -- impossibly fast: no coins
  insert into public.practice_sessions (user_id, set_id, game, correct, answered, score, duration_s, coins)
  values (me, p_set, left(p_game, 20), n_right, n_ans, greatest(0, coalesce(p_score, 0)), dur, earn) returning id into sid;
  if earn > 0 then
    update public.profiles set coins = coins + earn where id = me;
    insert into public.coin_log (user_id, amount, reason) values (me, earn, 'Practice: ' || coalesce(p_game, 'game'));
  end if;
  return jsonb_build_object('correct', n_right, 'answered', n_ans, 'coins', earn, 'today_coins', today + earn, 'cap', 50,
    'streak', public.practice_streak(me, tz));
end $$;

revoke all on function public.assign_set(uuid, text, boolean), public.class_assigned_sets(uuid), public.class_practice(uuid, text),
  public.my_practice(text), public.my_cards(text), public.save_practice(text, text, jsonb, integer, integer, text) from public, anon;
grant execute on function public.assign_set(uuid, text, boolean), public.class_assigned_sets(uuid), public.class_practice(uuid, text),
  public.my_practice(text), public.my_cards(text), public.save_practice(text, text, jsonb, integer, integer, text) to authenticated;

-- ================= Display names =================
-- Students can change their own name; teachers can rename students in their classes.
create or replace function public.clean_name(p_name text) returns text
language plpgsql immutable as $$
declare n text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if length(n) < 2 or length(n) > 16 then raise exception 'Names must be 2 to 16 characters'; end if;
  -- Letters from any language (Chinese, Spanish, Arabic...), numbers, spaces and . ' -
  -- Written so it works the same whatever the database's language settings are.
  if n ~ '[\x01-\x1f\x7f!"#$%&()*+,/:;<=>?@\[\\\]^_`{|}~\u00a0\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]' then raise exception 'Names can only use letters, numbers, spaces, periods, apostrophes and dashes'; end if;
  return n;
end $$;

create or replace function public.set_display_name(p_name text) returns public.profiles
language plpgsql security definer set search_path = public as $$
declare prof public.profiles;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform public.my_profile();
  perform public.check_student_name(auth.uid(), public.clean_name(p_name));
  update public.profiles set display_name = public.clean_name(p_name) where id = auth.uid() returning * into prof;
  return prof;
end $$;

create or replace function public.rename_student(p_user uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  if not exists (select 1 from public.class_members m join public.classes c on c.id = m.class_id
                 where m.user_id = p_user and c.teacher_id = auth.uid()) then
    raise exception 'That student isn''t in one of your classes';
  end if;
  n := public.clean_name(p_name);
  update public.profiles set display_name = n where id = p_user;
  return n;
end $$;

revoke all on function public.set_display_name(text), public.rename_student(uuid, text) from public, anon;
grant execute on function public.set_display_name(text), public.rename_student(uuid, text) to authenticated;

-- ================= Deleting data =================
-- A student can delete their whole account (profile, coins, items, results, practice).
-- Everything else in the database is linked with "on delete cascade", so it all goes too.
create or replace function public.delete_my_data() returns boolean
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if public.is_teacher() then
    raise exception 'Teacher accounts can''t be deleted here. Ask the site owner to remove you from the teachers list first.';
  end if;
  delete from auth.users where id = auth.uid();
  return true;
end $$;

-- A teacher deletes a student's data (for example, when a family asks). If the student is
-- ONLY known to this teacher, the whole account is deleted. If they are also in another
-- teacher's class, only this teacher's records about them are removed.
create or replace function public.delete_student_data(p_user uuid) returns text
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.teacher_sees(p_user) then raise exception 'That student isn''t in one of your classes or games'; end if;
  if exists (select 1 from public.teachers t join public.profiles p on lower(p.email) = lower(t.email) where p.id = p_user) then
    raise exception 'That is a teacher account';
  end if;
  if not exists (select 1 from public.class_members m join public.classes c on c.id = m.class_id
                 where m.user_id = p_user and c.teacher_id <> auth.uid())
     and not exists (select 1 from public.game_players gp join public.games g on g.code = gp.code
                 where gp.user_id = p_user and g.teacher_id <> auth.uid())
     and not exists (select 1 from public.game_results r join public.game_sessions s on s.id = r.session_id
                 where r.user_id = p_user and s.teacher_id <> auth.uid()) then
    delete from auth.users where id = p_user;
    return 'deleted';
  end if;
  delete from public.game_results r using public.game_sessions s where s.id = r.session_id and r.user_id = p_user and s.teacher_id = auth.uid();
  delete from public.class_members m using public.classes c where c.id = m.class_id and m.user_id = p_user and c.teacher_id = auth.uid();
  delete from public.game_players gp using public.games g where g.code = gp.code and gp.user_id = p_user and g.teacher_id = auth.uid();
  delete from public.practice_cards pc using public.question_sets q where q.id = pc.set_id and pc.user_id = p_user and q.teacher_id = auth.uid();
  delete from public.practice_sessions ps using public.question_sets q where q.id = ps.set_id and ps.user_id = p_user and q.teacher_id = auth.uid();
  return 'removed';
end $$;

revoke all on function public.delete_my_data(), public.delete_student_data(uuid) from public, anon;
grant execute on function public.delete_my_data(), public.delete_student_data(uuid) to authenticated;

-- ================= Free plan usage (shared by all teachers) =================
-- The projector counts roughly how many live-game messages each game uses and adds them here
-- every minute, so all teachers can see how close the site is to the free plan's limits.
-- (An estimate: Supabase's own Usage page has the exact numbers.)
create table if not exists public.usage_daily (
  day date not null default current_date,
  teacher_id uuid not null references auth.users (id) on delete cascade,
  msgs bigint not null default 0,
  primary key (day, teacher_id)
);
alter table public.usage_daily enable row level security;

create or replace function public.add_usage(p_msgs integer) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  if coalesce(p_msgs, 0) <= 0 then return false; end if;
  insert into public.usage_daily (day, teacher_id, msgs) values (current_date, auth.uid(), least(p_msgs, 200000))
    on conflict (day, teacher_id) do update set msgs = public.usage_daily.msgs + excluded.msgs;
  return true;
end $$;

-- Totals only (no student names). Months are calendar months in UTC.
create or replace function public.site_usage() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare m timestamptz := date_trunc('month', now());
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  return jsonb_build_object(
    'month_start', m,
    'db_bytes', pg_database_size(current_database()),
    'students', (select count(*) from public.profiles p where not exists (select 1 from public.teachers t where lower(t.email) = lower(coalesce(p.email, '')))),
    'active_users', (select count(*) from auth.users u where u.last_sign_in_at >= m),
    'msgs_month', (select coalesce(sum(msgs), 0) from public.usage_daily where day >= m::date),
    'msgs_today', (select coalesce(sum(msgs), 0) from public.usage_daily where day = current_date),
    'games_month', (select count(*) from public.game_sessions where played_at >= m),
    'practice_month', (select count(*) from public.practice_sessions where played_at >= m),
    'by_teacher', coalesce((select jsonb_agg(x order by x ->> 'msgs' desc) from (
        select jsonb_build_object('email', t.email, 'name', coalesce(tp.display_name, t.email),
          'msgs', (select coalesce(sum(d.msgs), 0) from public.usage_daily d where d.teacher_id = u.id and d.day >= m::date),
          'games', (select count(*) from public.game_sessions s where s.teacher_id = u.id and s.played_at >= m)) x
        from public.teachers t left join auth.users u on lower(u.email) = lower(t.email)
        left join public.profiles tp on tp.id = u.id) y), '[]'::jsonb));
end $$;

revoke all on function public.add_usage(integer), public.site_usage() from public, anon;
grant execute on function public.add_usage(integer), public.site_usage() to authenticated;

-- ================= Houses & the class village =================
-- Each student has ONE house (the same house shows up in every class village they're in).
-- A class village is just the houses of the class's current members, plus the teacher's house,
-- worked out each time it's opened: joining or leaving a class adds or removes a house.
-- Classmates can look at each other's houses (in-game name and hero only). Nobody else can.
alter table public.shop_items add column if not exists milestone text; -- set = earned by learning, can't be bought
alter table public.profiles add column if not exists unlocked text[] not null default '{}'; -- milestones reached

create table if not exists public.houses (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.houses enable row level security; -- no policies: only the functions below can read or write

-- A student's learning numbers, for milestones. (Only used inside the functions below.)
create or replace function public.house_progress(p_user uuid, p_tz text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'classes', (select count(*) from public.class_members m join public.classes c on c.id = m.class_id where m.user_id = p_user and not c.archived),
    'games', (select count(*) from public.game_results where user_id = p_user),
    'correct', (select coalesce(sum(correct), 0) from public.game_results where user_id = p_user),
    'practices', (select count(*) from public.practice_sessions where user_id = p_user),
    'streak', public.practice_streak(p_user, p_tz),
    'mastered', (select count(*) from public.practice_cards where user_id = p_user and box >= 3));
$$;

-- May this person use this piece of furniture / wallpaper / floor?
create or replace function public.house_item_ok(p_id text, p_slot text, p_owned text[], p_unlocked text[], p_teacher boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_items s where s.id = p_id and s.slot = p_slot
    and (p_teacher or (s.milestone is null and (s.price = 0 or p_id = any (p_owned))) or (s.milestone is not null and s.milestone = any (p_unlocked))));
$$;

-- My house, my milestone progress, and newly reached milestones (kept forever once reached).
-- Keep the list in sync with MILESTONES in js/furniture.js.
create or replace function public.my_house(p_tz text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prog jsonb; got text[]; h jsonb; un text[];
begin
  if me is null then raise exception 'Not signed in'; end if;
  perform public.my_profile();
  prog := public.house_progress(me, p_tz);
  select coalesce(array_agg(m.id), '{}') into got from (values
    ('m_class', 'classes', 1), ('m_game1', 'games', 1), ('m_game10', 'games', 10), ('m_game25', 'games', 25),
    ('m_correct100', 'correct', 100), ('m_practice10', 'practices', 10), ('m_streak5', 'streak', 5),
    ('m_master20', 'mastered', 20), ('m_master75', 'mastered', 75)) as m(id, stat, need)
    where (prog ->> m.stat)::int >= m.need;
  update public.profiles set unlocked = array(select distinct x from unnest(unlocked || got) x order by x)
    where id = me returning unlocked into un;
  select data into h from public.houses where user_id = me;
  return jsonb_build_object('house', h, 'progress', prog, 'unlocked', to_jsonb(un), 'teacher', public.is_teacher());
end $$;

-- Save my house. Checks everything: only furniture I may use, inside the room, limits.
create or replace function public.save_house(p_house jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); prof public.profiles; teach boolean := public.is_teacher();
  e jsonb; items jsonb := '[]'::jsonb; cnt jsonb := '{}'::jsonb; x int; y int; c int; w text; f text; ext int := 0;
begin
  if me is null then raise exception 'Not signed in'; end if;
  perform public.my_profile();
  if jsonb_typeof(p_house) <> 'object' or length(p_house::text) > 6000 then raise exception 'Invalid house'; end if;
  select * into prof from public.profiles where id = me;
  w := coalesce(p_house ->> 'wall', 'w_plain'); f := coalesce(p_house ->> 'floor', 'fl_wood');
  if not public.house_item_ok(w, 'wall', prof.owned, prof.unlocked, teach) then raise exception 'You can''t use that wallpaper yet'; end if;
  if not public.house_item_ok(f, 'floor', prof.owned, prof.unlocked, teach) then raise exception 'You can''t use that floor yet'; end if;
  if jsonb_typeof(p_house -> 'ext') = 'number' then ext := least(5, greatest(0, (p_house ->> 'ext')::int)); end if;
  if jsonb_typeof(p_house -> 'items') = 'array' then
    if jsonb_array_length(p_house -> 'items') > 40 then raise exception 'That''s too many things for one house (40 at most)'; end if;
    for e in select * from jsonb_array_elements(p_house -> 'items') loop
      if jsonb_typeof(e) <> 'array' or jsonb_array_length(e) < 3 then raise exception 'Invalid house'; end if;
      if not public.house_item_ok(e ->> 0, 'furn', prof.owned, prof.unlocked, teach) then raise exception 'You can''t use % yet', e ->> 0; end if;
      x := (e ->> 1)::int; y := (e ->> 2)::int;
      if x < 0 or x > 11 or y < 0 or y > 8 then raise exception 'Invalid house'; end if;
      c := coalesce((cnt ->> (e ->> 0))::int, 0) + 1;
      if c > 4 then raise exception 'You can place up to 4 of each thing'; end if;
      cnt := cnt || jsonb_build_object(e ->> 0, c);
      items := items || jsonb_build_array(jsonb_build_array(e ->> 0, x, y, case when e ->> 3 in ('1', 'true') then 1 else 0 end));
    end loop;
  end if;
  insert into public.houses (user_id, data, updated_at)
    values (me, jsonb_build_object('wall', w, 'floor', f, 'ext', ext, 'items', items), now())
    on conflict (user_id) do update set data = excluded.data, updated_at = now();
  return true;
end $$;

-- A class village: the teacher's house and every current member's house.
-- Only the class's teacher and its members can open it. Shows in-game names and heroes only.
create or replace function public.class_village(p_class uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.classes;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select * into c from public.classes where id = p_class;
  if not found or (c.teacher_id <> me and not exists (select 1 from public.class_members where class_id = p_class and user_id = me)) then
    raise exception 'You can only visit villages of your own classes';
  end if;
  return jsonb_build_object('name', c.name,
    'live', case when c.live_until > now() then jsonb_build_object('code', c.live_code, 'left', extract(epoch from c.live_until - now())::int) end,
    'teacher', (select jsonb_build_object('name', p.display_name, 'avatar', p.avatar, 'house', h.data, 'me', p.id = me)
      from public.profiles p left join public.houses h on h.user_id = p.id where p.id = c.teacher_id),
    'houses', coalesce((select jsonb_agg(jsonb_build_object('name', p.display_name, 'avatar', p.avatar, 'house', h.data, 'me', p.id = me) order by m.joined_at, p.id)
      from public.class_members m join public.profiles p on p.id = m.user_id left join public.houses h on h.user_id = m.user_id
      where m.class_id = p_class and m.user_id <> c.teacher_id), '[]'::jsonb));
end $$;

-- Live village (class time): the teacher switches it on for a while; their screen is the hub that
-- passes everyone's walking along. The code names the live channel; only class members get it.
alter table public.classes add column if not exists live_code text;
alter table public.classes add column if not exists live_until timestamptz;
create or replace function public.set_village_live(p_class uuid, p_minutes integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c public.classes;
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  if coalesce(p_minutes, 0) <= 0 then
    update public.classes set live_code = null, live_until = null where id = p_class;
    return null;
  end if;
  update public.classes set
    live_code = case when live_until > now() and live_code is not null then live_code else 'v' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 14) end,
    live_until = now() + make_interval(mins => least(p_minutes, 90))
    where id = p_class returning * into c;
  return jsonb_build_object('code', c.live_code, 'left', extract(epoch from c.live_until - now())::int);
end $$;

-- Teacher: reset a student's house (just in case).
create or replace function public.reset_house(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.teacher_sees(p_user) then raise exception 'That student isn''t in one of your classes or games'; end if;
  delete from public.houses where user_id = p_user;
  return true;
end $$;

revoke all on function public.house_progress(uuid, text), public.house_item_ok(text, text, text[], text[], boolean),
  public.practice_streak(uuid, text) from public, anon, authenticated;
revoke all on function public.my_house(text), public.save_house(jsonb), public.class_village(uuid), public.reset_house(uuid),
  public.set_village_live(uuid, integer) from public, anon;
grant execute on function public.my_house(text), public.save_house(jsonb), public.class_village(uuid), public.reset_house(uuid),
  public.set_village_live(uuid, integer) to authenticated;

-- ================= Name filter =================
-- Blocks rude or sensitive names (English and Chinese) when students change their in-game name.
-- On by default. A teacher can switch it off or add extra words (teacher page); a student is
-- checked with the words of every teacher whose class they're in.
create table if not exists public.teacher_settings (
  teacher_id uuid primary key references auth.users (id) on delete cascade,
  name_filter boolean not null default true,
  blocked_words text[] not null default '{}'
);
alter table public.teacher_settings enable row level security; -- only through the functions below

-- BEGIN NAME FILTER
-- (generated from js/namefilter.js by tools/gen-shop-sql.mjs)
create or replace function public.name_filter_contains() returns text[] language sql immutable as $$ select array['fuck', 'fuk', 'fck', 'fvck', 'shit', 'bitch', 'biatch', 'cunt', 'pussy', 'whore', 'slut', 'bastard', 'asshole', 'dumbass', 'butthole', 'motherf', 'nigger', 'nigga', 'faggot', 'retard', 'porn', 'penis', 'vagina', 'rapist', 'boob', 'piss', 'dildo', 'hitler', 'killyourself', 'tranny', 'blowjob', 'handjob', 'jerkoff', 'wank', 'twat', 'horny', 'nude', 'naked', '幹你', '干你', '幹您', '操你', '肏', '屌', '靠北', '靠杯', '靠腰', '雞掰', '鸡掰', '機掰', '机掰', '雞巴', '鸡巴', '他媽', '他妈', '你媽', '你妈', '媽的', '妈的', '去死', '白痴', '白癡', '智障', '腦殘', '脑残', '婊子', '賤人', '贱人', '王八蛋', '混蛋', '傻逼', '傻屄', '屄', '草泥馬', '草泥马', '尼瑪', '尼玛', '三小', '北七', '廢物', '废物', '屁眼', '色情', '做愛', '做爱', '性交', '陰莖', '阴茎', '陰道', '阴道', '奶子', '強姦', '强奸', '自殺', '自杀', '支那', '黑鬼', '垃圾人', '死胖子', '蠢貨', '蠢货']::text[] $$;
create or replace function public.name_filter_exact() returns text[] language sql immutable as $$ select array['ass', 'dick', 'cock', 'sex', 'sexy', 'cum', 'tit', 'tits', 'butt', 'damn', 'hell', 'crap', 'rape', 'nazi', 'kys', 'stfu', 'wtf', 'chink', 'spic', 'kike', 'gook', 'niga', 'fag', 'hoe', 'thot', 'pedo', 'anal', '幹', '操', '屎', '屁', '賤', '贱', '婊', '滾', '滚', '豬', '猪', '笨蛋', '垃圾']::text[] $$;
-- END NAME FILTER

-- Lower case, digits/symbols used as letters (0→o, 1→i, @→a...), then spaces and symbols removed.
create or replace function public.name_leet(p text) returns text language sql immutable as $$
  select translate(lower(coalesce(p, '')), '013457@$!', 'oieastasi');
$$;
create or replace function public.name_norm(p text) returns text language sql immutable as $$
  select regexp_replace(public.name_leet(p), '[[:space:]0-9!-/:-@\[-`{-~]', '', 'g');
$$;
create or replace function public.name_blocked(p_name text, p_extra text[]) returns boolean
language plpgsql immutable as $$
declare c text := public.name_norm(p_name); coll text; toks text[]; w text;
begin
  if c = '' then return false; end if;
  coll := regexp_replace(c, '(.)\1+', '\1', 'g');
  toks := regexp_split_to_array(public.name_leet(p_name), '[[:space:]0-9!-/:-@\[-`{-~]+');
  foreach w in array public.name_filter_contains() || coalesce((select array_agg(public.name_norm(x)) from unnest(p_extra) x), '{}') loop
    if w <> '' and (position(w in c) > 0 or (w = regexp_replace(w, '(.)\1+', '\1', 'g') and position(w in coll) > 0)) then return true; end if;
  end loop;
  foreach w in array public.name_filter_exact() loop
    if w = any (toks) or c = w then return true; end if;
  end loop;
  return false;
end $$;

-- Teacher: my filter setting and extra words.
create or replace function public.my_name_filter() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  return coalesce((select jsonb_build_object('on', name_filter, 'words', to_jsonb(blocked_words)) from public.teacher_settings where teacher_id = auth.uid()),
    jsonb_build_object('on', true, 'words', '[]'::jsonb));
end $$;
create or replace function public.set_name_filter(p_on boolean, p_words text[]) returns boolean
language plpgsql security definer set search_path = public as $$
declare w text[];
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  select coalesce(array_agg(distinct x), '{}') into w from (select lower(trim(x)) x from unnest(coalesce(p_words, '{}')) x limit 200) t where length(x) between 1 and 30;
  insert into public.teacher_settings (teacher_id, name_filter, blocked_words) values (auth.uid(), coalesce(p_on, true), w)
    on conflict (teacher_id) do update set name_filter = excluded.name_filter, blocked_words = excluded.blocked_words;
  return true;
end $$;

-- Is this name allowed for this student? (Filter is on unless all their classes' teachers turned it off.)
create or replace function public.check_student_name(p_user uuid, p_name text) returns void
language plpgsql stable security definer set search_path = public as $$
declare on_ boolean; words text[];
begin
  select bool_or(coalesce(ts.name_filter, true)) into on_ from public.class_members m join public.classes c on c.id = m.class_id
    left join public.teacher_settings ts on ts.teacher_id = c.teacher_id where m.user_id = p_user and not c.archived;
  if not coalesce(on_, true) then return; end if;
  select coalesce(array_agg(distinct w), '{}') into words from public.class_members m join public.classes c on c.id = m.class_id
    join public.teacher_settings ts on ts.teacher_id = c.teacher_id and ts.name_filter, unnest(ts.blocked_words) w
    where m.user_id = p_user and not c.archived;
  if public.name_blocked(p_name, words) then raise exception 'That name isn''t allowed. Please choose a different one.'; end if;
end $$;

revoke all on function public.check_student_name(uuid, text) from public, anon, authenticated;
revoke all on function public.my_name_filter(), public.set_name_filter(boolean, text[]) from public, anon;
grant execute on function public.my_name_filter(), public.set_name_filter(boolean, text[]) to authenticated;

-- ---------- Shop catalog (generated from js/items.js and js/furniture.js by tools/gen-shop-sql.mjs) ----------
-- BEGIN SHOP ITEMS
insert into public.shop_items (id, slot, name, price, milestone) values
  ('hat_top', 'phat', 'Top Hat', 100, null),
  ('hat_pirate', 'phat', 'Pirate Hat', 120, null),
  ('hat_viking', 'phat', 'Viking Helmet', 150, null),
  ('hat_chef', 'phat', 'Chef Hat', 60, null),
  ('hat_frog', 'phat', 'Frog Hat', 90, null),
  ('hat_halo', 'phat', 'Halo', 200, null),
  ('hat_flowers', 'phat', 'Flower Crown', 80, null),
  ('hat_dragon', 'phat', 'Dragon Helm', 300, null),
  ('top_armor', 'top', 'Knight Armor', 160, null),
  ('top_tux', 'top', 'Tuxedo', 140, null),
  ('top_robe', 'top', 'Wizard Robe', 120, null),
  ('top_jersey', 'top', 'Team Jersey', 90, null),
  ('top_hawaii', 'top', 'Island Shirt', 110, null),
  ('top_hoodie', 'top', 'Cozy Hoodie', 70, null),
  ('cape_red', 'cape', 'Hero Cape', 100, null),
  ('cape_royal', 'cape', 'Royal Cape', 180, null),
  ('cape_shadow', 'cape', 'Shadow Cape', 150, null),
  ('cape_ice', 'cape', 'Frost Cape', 160, null),
  ('cape_gold', 'cape', 'Legendary Cape', 400, null),
  ('acc_glasses', 'acc', 'Smart Glasses', 50, null),
  ('acc_patch', 'acc', 'Eye Patch', 60, null),
  ('acc_stache', 'acc', 'Mustache', 70, null),
  ('acc_mask', 'acc', 'Ninja Mask', 80, null),
  ('acc_monocle', 'acc', 'Monocle', 90, null),
  ('acc_shades', 'acc', 'Star Shades', 120, null),
  ('pet_slime', 'pet', 'Slime Buddy', 150, null),
  ('pet_cat', 'pet', 'Cat', 200, null),
  ('pet_owl', 'pet', 'Owl', 250, null),
  ('pet_duck', 'pet', 'Duck', 120, null),
  ('pet_dragon', 'pet', 'Baby Dragon', 400, null),
  ('hat_cowboy', 'phat', 'Cowboy Hat', 110, null),
  ('hat_party', 'phat', 'Party Hat', 70, null),
  ('hat_bunny', 'phat', 'Bunny Ears', 90, null),
  ('hat_cat', 'phat', 'Cat Ears', 80, null),
  ('hat_astro', 'phat', 'Astronaut Helmet', 350, null),
  ('hat_grad', 'phat', 'Graduation Cap', 150, null),
  ('hat_santa', 'phat', 'Santa Hat', 120, null),
  ('hat_mushroom', 'phat', 'Mushroom Cap', 100, null),
  ('top_space', 'top', 'Space Suit', 200, null),
  ('top_super', 'top', 'Superhero Suit', 180, null),
  ('top_lab', 'top', 'Lab Coat', 120, null),
  ('top_pirate', 'top', 'Pirate Coat', 150, null),
  ('top_rainbow', 'top', 'Rainbow Sweater', 100, null),
  ('cape_ember', 'cape', 'Ember Cape', 170, null),
  ('cape_forest', 'cape', 'Forest Cape', 140, null),
  ('cape_galaxy', 'cape', 'Galaxy Cape', 250, null),
  ('acc_clown', 'acc', 'Clown Nose', 50, null),
  ('acc_fangs', 'acc', 'Vampire Fangs', 80, null),
  ('acc_hearts', 'acc', 'Heart Eyes', 100, null),
  ('acc_bandage', 'acc', 'Bandage', 40, null),
  ('acc_freckles', 'acc', 'Freckles', 30, null),
  ('pet_penguin', 'pet', 'Penguin', 220, null),
  ('pet_bunny', 'pet', 'Bunny', 180, null),
  ('pet_ghost', 'pet', 'Ghost', 260, null),
  ('pet_robot', 'pet', 'Robot', 320, null),
  ('pet_fox', 'pet', 'Fox', 240, null),
  ('pet_phoenix', 'pet', 'Phoenix', 500, null),
  ('emote_hi', 'emote', 'Hi!', 0, null),
  ('emote_gg', 'emote', 'GG', 0, null),
  ('emote_nice', 'emote', 'Nice one!', 0, null),
  ('emote_67', 'emote', '67', 150, null),
  ('emote_sheesh', 'emote', 'Sheesh', 100, null),
  ('emote_bruh', 'emote', 'Bruh', 80, null),
  ('emote_oof', 'emote', 'Oof', 60, null),
  ('emote_bigbrain', 'emote', 'Big Brain', 120, null),
  ('emote_letsgo', 'emote', 'Let’s Go', 100, null),
  ('emote_aura', 'emote', '+1000 Aura', 200, null),
  ('emote_thanks', 'emote', 'Thank You', 90, null),
  ('emote_hype', 'emote', 'Hype', 250, null),
  ('emote_dance', 'emote', 'Victory Dance', 300, null),
  ('emote_mindblown', 'emote', 'Mind Blown', 150, null),
  ('emote_clutch', 'emote', 'Clutch!', 120, null),
  ('emote_freeze', 'emote', 'Brain Freeze', 90, null),
  ('emote_respect', 'emote', 'Respect', 100, null),
  ('emote_knewit', 'emote', 'I Knew It!', 80, null),
  ('emote_twist', 'emote', 'Plot Twist!', 110, null),
  ('f_bed', 'furn', 'Cozy Bed', 0, null),
  ('f_chair', 'furn', 'Wooden Chair', 0, null),
  ('f_table', 'furn', 'Little Table', 0, null),
  ('f_rug', 'furn', 'Round Rug', 0, null),
  ('f_plant', 'furn', 'Potted Plant', 30, null),
  ('f_lamp', 'furn', 'Floor Lamp', 40, null),
  ('f_beanbag', 'furn', 'Beanbag', 60, null),
  ('f_rug_star', 'furn', 'Starry Rug', 70, null),
  ('f_desk', 'furn', 'Desk', 80, null),
  ('f_guitar', 'furn', 'Guitar', 90, null),
  ('f_bookshelf', 'furn', 'Bookshelf', 90, null),
  ('f_fridge', 'furn', 'Snack Fridge', 100, null),
  ('f_sofa', 'furn', 'Comfy Sofa', 120, null),
  ('f_tv', 'furn', 'TV', 150, null),
  ('f_fishtank', 'furn', 'Fish Tank', 160, null),
  ('f_fireplace', 'furn', 'Fireplace', 220, null),
  ('f_piano', 'furn', 'Piano', 250, null),
  ('f_arcade', 'furn', 'Arcade Machine', 300, null),
  ('f_throne', 'furn', 'Golden Throne', 400, null),
  ('f_clock', 'furn', 'Wall Clock', 25, null),
  ('f_poster', 'furn', 'Space Poster', 35, null),
  ('f_shelf', 'furn', 'Wall Shelf', 45, null),
  ('f_window', 'furn', 'Window', 50, null),
  ('f_painting', 'furn', 'Mountain Painting', 60, null),
  ('m_mat', 'furn', 'Welcome Mat', 0, 'm_class'),
  ('m_trophy1', 'furn', 'Bronze Trophy', 0, 'm_game1'),
  ('m_trophy2', 'furn', 'Silver Trophy', 0, 'm_game10'),
  ('m_trophy3', 'furn', 'Gold Trophy', 0, 'm_game25'),
  ('m_telescope', 'furn', 'Telescope', 0, 'm_correct100'),
  ('m_studydesk', 'furn', 'Study Desk', 0, 'm_practice10'),
  ('m_torch', 'furn', 'Streak Torch', 0, 'm_streak5'),
  ('m_wisdom', 'furn', 'Bookshelf of Wisdom', 0, 'm_master20'),
  ('m_globe', 'furn', 'Giant Globe', 0, 'm_master75'),
  ('w_plain', 'wall', 'Cream Wall', 0, null),
  ('w_blue', 'wall', 'Sky Blue Wall', 30, null),
  ('w_stripes', 'wall', 'Candy Stripes', 50, null),
  ('w_brick', 'wall', 'Brick Wall', 60, null),
  ('w_stars', 'wall', 'Night Sky', 80, null),
  ('fl_wood', 'floor', 'Wood Floor', 0, null),
  ('fl_tile', 'floor', 'White Tiles', 30, null),
  ('fl_carpet', 'floor', 'Blue Carpet', 50, null),
  ('fl_check', 'floor', 'Checkerboard', 60, null),
  ('fl_grass', 'floor', 'Indoor Grass', 80, null)
on conflict (id) do update set slot = excluded.slot, name = excluded.name, price = excluded.price, milestone = excluded.milestone;
delete from public.shop_items where id not in ('hat_top', 'hat_pirate', 'hat_viking', 'hat_chef', 'hat_frog', 'hat_halo', 'hat_flowers', 'hat_dragon', 'top_armor', 'top_tux', 'top_robe', 'top_jersey', 'top_hawaii', 'top_hoodie', 'cape_red', 'cape_royal', 'cape_shadow', 'cape_ice', 'cape_gold', 'acc_glasses', 'acc_patch', 'acc_stache', 'acc_mask', 'acc_monocle', 'acc_shades', 'pet_slime', 'pet_cat', 'pet_owl', 'pet_duck', 'pet_dragon', 'hat_cowboy', 'hat_party', 'hat_bunny', 'hat_cat', 'hat_astro', 'hat_grad', 'hat_santa', 'hat_mushroom', 'top_space', 'top_super', 'top_lab', 'top_pirate', 'top_rainbow', 'cape_ember', 'cape_forest', 'cape_galaxy', 'acc_clown', 'acc_fangs', 'acc_hearts', 'acc_bandage', 'acc_freckles', 'pet_penguin', 'pet_bunny', 'pet_ghost', 'pet_robot', 'pet_fox', 'pet_phoenix', 'emote_hi', 'emote_gg', 'emote_nice', 'emote_67', 'emote_sheesh', 'emote_bruh', 'emote_oof', 'emote_bigbrain', 'emote_letsgo', 'emote_aura', 'emote_thanks', 'emote_hype', 'emote_dance', 'emote_mindblown', 'emote_clutch', 'emote_freeze', 'emote_respect', 'emote_knewit', 'emote_twist', 'f_bed', 'f_chair', 'f_table', 'f_rug', 'f_plant', 'f_lamp', 'f_beanbag', 'f_rug_star', 'f_desk', 'f_guitar', 'f_bookshelf', 'f_fridge', 'f_sofa', 'f_tv', 'f_fishtank', 'f_fireplace', 'f_piano', 'f_arcade', 'f_throne', 'f_clock', 'f_poster', 'f_shelf', 'f_window', 'f_painting', 'm_mat', 'm_trophy1', 'm_trophy2', 'm_trophy3', 'm_telescope', 'm_studydesk', 'm_torch', 'm_wisdom', 'm_globe', 'w_plain', 'w_blue', 'w_stripes', 'w_brick', 'w_stars', 'fl_wood', 'fl_tile', 'fl_carpet', 'fl_check', 'fl_grass');
-- END SHOP ITEMS

-- Tell Supabase's API to pick up new and changed functions right away.
notify pgrst, 'reload schema';
