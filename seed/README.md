# GoZone seed and maintenance scripts

Run after `docker compose up` reports all services healthy.

**Each script targets its own service's database** — they are separate databases inside the
one Postgres container. Running a script against `gozone_main` (the container default) fails
with "relation does not exist".

## Demo data

| Script | Database | Contents |
|---|---|---|
| `01_auth_seed.sql` | `auth_db` | Demo users (2 passengers, 2 drivers, 1 courier, 1 vendor owner, 1 admin) and driver KYC rows |
| `02_food_seed.sql` | `food_db` | 4 vendors — 2 restaurants, 1 pharmacy, 1 grocery — with their catalogues |
| `03_wallet_seed.sql` | `wallet_db` | Starting wallet balances and commission configuration |
| `04_gps_stream.sql` | `ride_db` | Scripted driver GPS positions for demonstrating live tracking indoors |

```bash
docker exec -i gozone-postgres psql -U gozone -d auth_db   < seed/01_auth_seed.sql
docker exec -i gozone-postgres psql -U gozone -d food_db   < seed/02_food_seed.sql
docker exec -i gozone-postgres psql -U gozone -d wallet_db < seed/03_wallet_seed.sql
docker exec -i gozone-postgres psql -U gozone -d ride_db   < seed/04_gps_stream.sql
```

All four are **idempotent** — re-running them will not duplicate rows. (`02` matches on vendor
plus item name, because its ids are generated at insert time and an `ON CONFLICT (id)` guard
could never fire. An earlier version lacked this and duplicated every catalogue on each run.)

Demo account phone numbers and roles are listed in the root `README.md`, section 20.
**Do not delete the seeded users** — their UUIDs are referenced by food and wallet data.

## Maintenance

| Script | Database | Purpose |
|---|---|---|
| `98_dedupe_menu_items.sql` | `food_db` | Repairs catalogues duplicated by the old non-idempotent seed. Keeps the copy referenced by existing orders, repoints order lines, and backs up removed rows to `menu_items_removed_backup`. |
| `99_clear_stale_demo_data.sql` | `food_db` **and** `ride_db` | Clears stale clutter before a presentation: unfinished orders, queue entries and half-finished trips created before today, plus queue entries orphaned by finished orders. Nothing is deleted — statuses move to a terminal value and the originals are saved in `*_status_backup` tables, with undo statements at the bottom of the file. |

```bash
docker exec -i gozone-postgres psql -U gozone -d food_db < seed/98_dedupe_menu_items.sql

docker exec -i gozone-postgres psql -U gozone -d food_db < seed/99_clear_stale_demo_data.sql
docker exec -i gozone-postgres psql -U gozone -d ride_db < seed/99_clear_stale_demo_data.sql
```

`99` prints "relation does not exist" for the half that does not apply to the database you
pointed it at. That is expected — the file contains both halves and skips the irrelevant one.

## GPS replay

`run_gps_demo.sh` replays the seeded positions so live tracking can be demonstrated without
physically moving a phone. The driver app also pushes real device GPS when it is available.
