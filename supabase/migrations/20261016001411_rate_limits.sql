-- Fixed-window rate limits for the app's server actions (sign-in, sign-up, password reset). Keys are hashed by
-- the app (no raw IP or email is stored). Only the server's service role may count: a caller that could reach
-- the counter could exhaust someone else's budget.

create table private.rate_limit_hits (
  key          text not null check (char_length(key) between 1 and 200),
  window_start timestamptz not null,
  hits         integer not null default 0 check (hits >= 0),
  primary key (key, window_start)
);

create index rate_limit_hits_window_start_idx on private.rate_limit_hits (window_start);

alter table private.rate_limit_hits enable row level security;

-- Counts one hit for p_key in the current window and answers whether it is still within p_max.
create function public.consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_key is null or p_max is null or p_max < 1
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limit_hits as r (key, window_start, hits)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Past windows are never read again; about one call in a hundred sweeps them.
  if random() < 0.01 then
    delete from private.rate_limit_hits r where r.window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
