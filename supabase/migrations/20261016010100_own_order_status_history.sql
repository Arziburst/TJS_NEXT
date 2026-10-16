-- The customer's view of an order's status history (#108): how the order moved, with the times, and nothing the
-- shop keeps for itself.
--
-- order_status_history stays admins-only (RLS, #27): its author (changed_by) and its row ids are the shop's. A
-- customer reads their own orders' steps through own_order_status_history only: the status and its time, never
-- the author, a note or an id. A guest order (user_id null), another customer's order, an unknown number and an
-- anonymous caller all read as no rows.

-- The steps of order `p_number` of the calling customer, oldest first: the status it was placed in at its
-- placement time, then the status of every change at the time it was made. Security definer, because the history
-- table is closed to customers; the owner check is here: orders.user_id must be the caller.
create function public.own_order_status_history(p_number bigint)
returns table (status public.order_status, changed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with own as (
    select o.id, o.status, o.created_at
      from public.orders o
     where o.number = p_number
       and o.user_id is not null
       and o.user_id = (select auth.uid())
  ),
  changes as (
    select h.id, h.from_status, h.to_status, h.created_at
      from public.order_status_history h
      join own on own.id = h.order_id
  )
  select steps.status, steps.changed_at
    from (
      -- the placement: the first change's starting status, or the current one when it never changed
      select coalesce(
               (select c.from_status from changes c order by c.created_at, c.id limit 1),
               own.status
             ) as status,
             own.created_at as changed_at,
             0 as step,
             null::uuid as id
        from own
      union all
      select c.to_status, c.created_at, 1, c.id
        from changes c
    ) steps
   order by steps.changed_at, steps.step, steps.id;
$$;

revoke all on function public.own_order_status_history(bigint) from public, anon;
grant execute on function public.own_order_status_history(bigint) to authenticated;
