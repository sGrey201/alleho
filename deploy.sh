#!/bin/bash

# Запуск из корня репозитория
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env.prod"
APP_IMAGE=svorobyev201/alleho:latest

echo "🚀 Старт деплоя приложения..."

# 1️⃣ Перетягиваем новый образ
echo "🔄 Pulling latest Docker image..."
docker pull $APP_IMAGE

# 2️⃣ Останавливаем текущие контейнеры (без удаления volumes)
echo "🛑 Stopping current containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

# 3️⃣ Поднимаем только db и redis, затем применяем миграции
echo "🔼 Starting db and redis..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d db redis

echo "📦 Running database migrations..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm app npm run migrate

# 4️⃣ Поднимаем все контейнеры с новым образом
echo "🔼 Starting all containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# 5️⃣ Проверяем статус
echo "✅ Deployment completed!"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
