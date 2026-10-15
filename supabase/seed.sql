-- Local and CI seed data, loaded by `npm run db:reset` after the migrations ([db.seed] in config.toml).
-- Dev/QA data only: never production data, and never reference data the app needs (that goes in a migration).

-- Exchange rates for local work and e2e: the NBU rates of 2026-10-15 (UAH per unit), the USD→X cross rates
-- derived from them as the daily job does (rounded to 10 places), and display rates equal to the cross rates.
with nbu (currency, rate) as (
  values ('USD', 44.9801), ('EUR', 50.3453), ('PLN', 11.5297), ('CZK', 2.0669), ('RON', 9.4209), ('CHF', 53.9899)
),
cross_rates (quote, rate) as (
  select 'UAH', (select rate from nbu where currency = 'USD')
  union all
  select currency, round((select rate from nbu where currency = 'USD') / rate, 10) from nbu where currency <> 'USD'
)
insert into public.fx_rates (rate_date, base, quote, rate, source)
select date '2026-10-15', currency, 'UAH', rate, 'nbu' from nbu
union all
select date '2026-10-15', 'USD', quote, rate, 'nbu' from cross_rates where quote <> 'UAH'
union all
select date '2026-10-15', 'USD', quote, rate, 'display' from cross_rates;
