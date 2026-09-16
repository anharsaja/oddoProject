#!/bin/bash
# Creates the second database used by the integration tests.
#
# oddo_dev is created by the image itself from POSTGRES_DB; only oddo_test is
# missing. This script runs ONCE, when the data volume is first initialised.
# If the volume already exists without oddo_test, recreate it:
#   pnpm docker:reset   (docker compose down -v)
#   pnpm docker:up
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE oddo_test;
EOSQL

echo "oddo init: database oddo_test created"
