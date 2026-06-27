#!/bin/bash

# Запуск из корня репозитория
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
APP_IMAGE=svorobyev201/hovial:latest

echo "🚀 Старт деплоя приложения..."

# 1️⃣ Перетягиваем новый образ
echo "🔄 Pulling latest Docker image..."
docker pull $APP_IMAGE

# 2️⃣ Убеждаемся, что db и redis доступны (без рестарта, если уже работают)
echo "🔍 Ensuring db and redis are up..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d db redis

# 3️⃣ Применяем миграции
echo "📦 Running database migrations..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm app npm run migrate

# 4️⃣ Пересоздаём только app с новым образом (nginx, livekit, db, redis не трогаем)
echo "🔼 Recreating app container..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps --force-recreate app

# 5️⃣ Краткий статус работающих контейнеров
echo "✅ Deployment completed!"
echo "📋 Running containers:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --status running --format "  {{.Service}} — {{.Status}}"
