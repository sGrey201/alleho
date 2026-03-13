#!/bin/sh
set -e

# Ждём доступности БД и применяем миграции при старте контейнера
if [ -n "$DATABASE_URL" ]; then
  echo "Waiting for database to be ready..."
  retries=30
  while [ $retries -gt 0 ]; do
    if npx drizzle-kit migrate; then
      echo "Migrations done."
      break
    fi
    retries=$((retries - 1))
    if [ $retries -eq 0 ]; then
      echo "Failed to run migrations: database unreachable after 30 attempts."
      exit 1
    fi
    echo "Database not ready, retrying in 2s... ($retries left)"
    sleep 2
  done
fi

exec "$@"
