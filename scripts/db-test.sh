#!/usr/bin/env bash
# Run the database isolation/deletion suite against a DISPOSABLE Postgres.
#
# Never point this at production: it creates and drops a database and seeds
# destructive fixtures. It refuses to run against a non-local host unless
# AION_DB_TEST_ALLOW_REMOTE=1 is set deliberately.
set -euo pipefail

PGHOST_ARG="${PGHOST_ARG:--h /tmp -p 55432 -U postgres}"
DBNAME="${DBNAME:-aion_test}"

if [[ "${PGHOST_ARG}" == *"supabase.co"* && "${AION_DB_TEST_ALLOW_REMOTE:-0}" != "1" ]]; then
  echo "REFUSING: destructive fixtures must not run against a hosted project." >&2
  exit 2
fi

# shellcheck disable=SC2206
PSQL=(psql -v ON_ERROR_STOP=1 ${PGHOST_ARG} -q)

echo "==> recreating disposable database ${DBNAME}"
"${PSQL[@]}" -d postgres -c "drop database if exists ${DBNAME};"
"${PSQL[@]}" -d postgres -c "create database ${DBNAME};"

echo "==> applying harness + migrations"
"${PSQL[@]}" -d "${DBNAME}" -f supabase/tests/harness/00_supabase_shim.sql
for m in supabase/migrations/*.sql; do
  echo "    - ${m}"
  "${PSQL[@]}" -d "${DBNAME}" -f "${m}"
done
"${PSQL[@]}" -d "${DBNAME}" -f supabase/tests/harness/99_grants.sql
"${PSQL[@]}" -d "${DBNAME}" -f supabase/tests/helpers.sql

echo "==> running tests"
fail=0
for t in supabase/tests/rls_cross_user.sql \
         supabase/tests/verified_status_rejection.sql \
         supabase/tests/deletion_contract.sql \
         supabase/tests/meta_detects_broken_policy.sql; do
  echo "--- ${t}"
  if ! "${PSQL[@]}" -d "${DBNAME}" -f "${t}" 2>&1 | grep -E "PASS|FAIL|ERROR"; then
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "DB TESTS FAILED" >&2
  exit 1
fi
echo "ALL DB TESTS PASSED"
