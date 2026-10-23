#!/usr/bin/env bash
# T47: a backup and restore drill. Dumps the SOURCE database, restores it into an empty TARGET database, and checks that
# every table has the same number of rows. Reads two connection strings from the environment (never from the command line,
# never printed): SOURCE_DATABASE_URL (the database to back up) and TARGET_DATABASE_URL (an EMPTY database to restore into;
# for the staging drill use a scratch database, never the staging or production database itself).
# Exit code 0 only if every table matches. Needs pg_dump, pg_restore and psql (PostgreSQL 14 or newer).
set -euo pipefail
: "${SOURCE_DATABASE_URL:?set SOURCE_DATABASE_URL}"
: "${TARGET_DATABASE_URL:?set TARGET_DATABASE_URL}"
[ "$SOURCE_DATABASE_URL" != "$TARGET_DATABASE_URL" ] || { echo "source and target are the same database: refusing" >&2; exit 2; }
dump=$(mktemp)
trap 'rm -f "$dump"' EXIT

tables=$(psql "$TARGET_DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'")
[ "$tables" = 0 ] || { echo "target is not empty ($tables tables in public): refusing to restore into it" >&2; exit 2; }

echo "dumping..."
pg_dump --format=custom --no-owner --no-privileges --file="$dump" "$SOURCE_DATABASE_URL"
echo "dump size: $(wc -c < "$dump") bytes"
echo "restoring..."
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET_DATABASE_URL" "$dump"

counts() {
  psql "$1" -Atc "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1" |
  while read -r t; do
    printf '%s %s\n' "$t" "$(psql "$1" -Atc "select count(*) from public.\"$t\"")"
  done
}
counts "$SOURCE_DATABASE_URL" > "$dump.src"
counts "$TARGET_DATABASE_URL" > "$dump.dst"
if diff -u "$dump.src" "$dump.dst"; then
  echo "OK: $(wc -l < "$dump.src") tables, every row count matches"
  rm -f "$dump.src" "$dump.dst"
else
  echo "MISMATCH between source and restored copy" >&2
  exit 1
fi
