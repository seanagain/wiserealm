-- WiseRealm accounts, coins and shop.
-- Run this whole file once in Supabase: SQL Editor → New query → paste → Run.
-- It is safe to run again after updates (it only adds or replaces things).
--
-- Security model: students can READ their own profile, but every change (buying,
-- equipping, earning coins) goes through the functions below, which check the rules.
-- Only emails listed in `teachers` can start coin-earning games or give coins.

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
  full_name text := trim(coalesce(meta ->> 'full_name', meta ->> 'name', split_part(coalesce(email, 'Hero'), '@', 1)));
  parts text[] := regexp_split_to_array(full_name, '\s+');
  n int := coalesce(array_length(parts, 1), 0);
begin
  if n = 0 or parts[1] = '' then return 'Hero'; end if;
  if n = 1 then return left(parts[1], 16); end if;
  return left(parts[1] || ' ' || left(parts[n], 1) || '.', 16);
end $$;

-- ---------- Row level security (read-only access; changes go through functions) ----------
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (id = auth.uid() or public.is_teacher());

drop policy if exists "anyone can read the shop" on public.shop_items;
create policy "anyone can read the shop" on public.shop_items for select using (true);

drop policy if exists "read own coin history" on public.coin_log;
create policy "read own coin history" on public.coin_log for select using (user_id = auth.uid() or public.is_teacher());

-- ---------- New accounts get a profile automatically ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, public.make_display_name(new.raw_user_meta_data, new.email))
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
    insert into public.profiles (id, email, display_name)
    values (u.id, u.email, public.make_display_name(u.raw_user_meta_data, u.email))
    returning * into prof;
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
  foreach slot in array array['phat', 'top', 'cape', 'acc', 'pet'] loop
    v := p_avatar ->> slot;
    if v is not null and not (v = any (prof.owned)) then raise exception 'You do not own %', v; end if;
  end loop;
  update public.profiles set avatar = p_avatar where id = auth.uid() returning * into prof;
  return prof;
end $$;

-- A signed-in student joining a live game (so they can earn coins in it).
create or replace function public.join_game(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  perform public.my_profile();
  if not exists (select 1 from public.games where code = p_code and created_at > now() - interval '12 hours') then
    return false;
  end if;
  insert into public.game_players (code, user_id) values (p_code, auth.uid()) on conflict do nothing;
  return true;
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

create or replace function public.list_students()
returns table (id uuid, display_name text, email text, coins integer, items integer, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  return query
    select p.id, p.display_name, p.email, p.coins, coalesce(array_length(p.owned, 1), 0), p.created_at
    from public.profiles p order by p.display_name;
end $$;

-- Bonus (or penalty) coins from the teacher, up to 1000 at a time.
create or replace function public.give_coins(p_user uuid, p_amount integer, p_reason text) returns integer
language plpgsql security definer set search_path = public as $$
declare newc integer;
begin
  if not public.is_teacher() then raise exception 'Not a teacher'; end if;
  if abs(p_amount) > 1000 then raise exception 'At most 1000 coins at a time'; end if;
  update public.profiles set coins = greatest(0, coins + p_amount) where id = p_user returning coins into newc;
  if not found then raise exception 'Student not found'; end if;
  insert into public.coin_log (user_id, amount, reason) values (p_user, p_amount, coalesce(nullif(p_reason, ''), 'From your teacher'));
  return newc;
end $$;

-- Only signed-in users may call the functions above (they also check inside).
revoke all on function public.my_profile(), public.buy_item(text), public.set_avatar(jsonb), public.join_game(text),
  public.create_game(text, text), public.award_coins(text, integer, jsonb), public.list_students(),
  public.give_coins(uuid, integer, text), public.am_i_teacher() from public, anon;
grant execute on function public.my_profile(), public.buy_item(text), public.set_avatar(jsonb), public.join_game(text),
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
create or replace function public.class_overview(p_class uuid)
returns table (user_id uuid, display_name text, email text, coins integer, games integer, correct integer, total integer,
               accuracy numeric, last_played timestamptz, recent jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.owns_class(p_class) then raise exception 'Not your class'; end if;
  return query
    select p.id, p.display_name, p.email, p.coins,
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
    group by p.id, p.display_name, p.email, p.coins
    order by p.display_name;
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
    'results', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'name', p.display_name, 'score', r.score, 'correct', r.correct,
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
    'profile', (select jsonb_build_object('id', p.id, 'name', p.display_name, 'email', p.email, 'coins', p.coins) from public.profiles p where p.id = p_user),
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

-- ---------- Shop catalog (generated from js/items.js by tools/gen-shop-sql.mjs) ----------
-- BEGIN SHOP ITEMS
insert into public.shop_items (id, slot, name, price) values
  ('hat_top', 'phat', 'Top Hat', 100),
  ('hat_pirate', 'phat', 'Pirate Hat', 120),
  ('hat_viking', 'phat', 'Viking Helmet', 150),
  ('hat_chef', 'phat', 'Chef Hat', 60),
  ('hat_frog', 'phat', 'Frog Hat', 90),
  ('hat_halo', 'phat', 'Halo', 200),
  ('hat_flowers', 'phat', 'Flower Crown', 80),
  ('hat_dragon', 'phat', 'Dragon Helm', 300),
  ('top_armor', 'top', 'Knight Armor', 160),
  ('top_tux', 'top', 'Tuxedo', 140),
  ('top_robe', 'top', 'Wizard Robe', 120),
  ('top_jersey', 'top', 'Team Jersey', 90),
  ('top_hawaii', 'top', 'Island Shirt', 110),
  ('top_hoodie', 'top', 'Cozy Hoodie', 70),
  ('cape_red', 'cape', 'Hero Cape', 100),
  ('cape_royal', 'cape', 'Royal Cape', 180),
  ('cape_shadow', 'cape', 'Shadow Cape', 150),
  ('cape_ice', 'cape', 'Frost Cape', 160),
  ('cape_gold', 'cape', 'Legendary Cape', 400),
  ('acc_glasses', 'acc', 'Smart Glasses', 50),
  ('acc_patch', 'acc', 'Eye Patch', 60),
  ('acc_stache', 'acc', 'Mustache', 70),
  ('acc_mask', 'acc', 'Ninja Mask', 80),
  ('acc_monocle', 'acc', 'Monocle', 90),
  ('acc_shades', 'acc', 'Star Shades', 120),
  ('pet_slime', 'pet', 'Slime Buddy', 150),
  ('pet_cat', 'pet', 'Cat', 200),
  ('pet_owl', 'pet', 'Owl', 250),
  ('pet_duck', 'pet', 'Duck', 120),
  ('pet_dragon', 'pet', 'Baby Dragon', 400)
on conflict (id) do update set slot = excluded.slot, name = excluded.name, price = excluded.price;
delete from public.shop_items where id not in ('hat_top', 'hat_pirate', 'hat_viking', 'hat_chef', 'hat_frog', 'hat_halo', 'hat_flowers', 'hat_dragon', 'top_armor', 'top_tux', 'top_robe', 'top_jersey', 'top_hawaii', 'top_hoodie', 'cape_red', 'cape_royal', 'cape_shadow', 'cape_ice', 'cape_gold', 'acc_glasses', 'acc_patch', 'acc_stache', 'acc_mask', 'acc_monocle', 'acc_shades', 'pet_slime', 'pet_cat', 'pet_owl', 'pet_duck', 'pet_dragon');
-- END SHOP ITEMS
