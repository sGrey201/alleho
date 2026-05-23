# Nginx: HTTP и HTTPS

В репозитории по умолчанию **`default.conf`** уже настроен на HTTPS (редирект с 80 на 443). После деплоя сайт доступен по **https://hovial.com**.

## Первая установка (ещё нет сертификатов)

Если сертификатов ещё нет, nginx с дефолтным конфигом не запустится. Временно подставьте HTTP-конфиг:

1. На сервере скопируйте `default-http.conf` в `default.conf`:
   ```bash
   cp nginx/default-http.conf nginx/default.conf
   ```

2. Запустите/перезапустите nginx, установите certbot и получите сертификат (см. шаги 1–3 ниже). Затем верните конфиг из репозитория (при следующем деплое подтянется правильный `default.conf`) или вручную скопируйте содержимое `default-https.conf` в `default.conf`, перезапустите nginx.

## Получение сертификата (certbot)

1. На сервере установите certbot (если ещё не установлен):
   ```bash
   sudo apt update && sudo apt install certbot -y
   ```

2. В каталоге с `docker-compose.prod.yml` создайте каталог для проверки домена:
   ```bash
   mkdir -p certbot-webroot
   ```

3. Получите сертификат:
   ```bash
   sudo certbot certonly --webroot -w $(pwd)/certbot-webroot -d hovial.com -d www.hovial.com
   ```
   Файлы появятся в `/etc/letsencrypt/live/hovial.com/`.

4. Убедитесь, что используется конфиг с HTTPS (в репо это уже `default.conf`). Перезапустите nginx:
   ```bash
   docker-compose -f docker-compose.prod.yml --env-file .env.prod restart nginx
   ```

После этого **http://hovial.com** перенаправляет на **https://hovial.com**.

## WebSocket (`/ws`)

Для real-time (стена здоровья, мессенджер) в конфиге есть `location /ws` с заголовками `Upgrade` и `Connection: upgrade`. Без них в логах app будут частые `GET /ws` каждые ~2 с, а сообщения не приходят в реальном времени.

После изменения nginx-конфига: `docker compose ... restart nginx`.

В контейнере `app` нужен `REDIS_URL` (в `docker-compose.prod.yml` по умолчанию `redis://redis:6379`) — через Redis идёт pub/sub для WebSocket.

## Обновление сертификата

Let's Encrypt выдаёт сертификаты на 90 дней. Обновите так:
```bash
sudo certbot renew
docker-compose -f docker-compose.prod.yml --env-file .env.prod restart nginx
```
Или настройте cron: `0 3 * * * certbot renew --quiet`.

выводит отчет об использовании дискового пространства
```bash
df -h -t ext4
```

предоставляет информацию об используемой и неиспользуемой оперативной памяти.
```bash
free -h
```

диспетчер процессов системы
```bash
top
```
