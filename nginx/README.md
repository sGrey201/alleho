# Nginx: HTTP и HTTPS

По умолчанию используется `default.conf` — сайт доступен по **http://alleho.ru** (порт 80).

## Включение HTTPS

1. На сервере установите certbot (если ещё не установлен):
   ```bash
   sudo apt update && sudo apt install certbot -y
   ```

2. Убедитесь, что контейнеры запущены. В каталоге с `docker-compose.prod.yml` (например `~/alleho`) создайте каталог для проверки домена:
   ```bash
   mkdir -p certbot-webroot
   ```

3. Получите сертификат (путь к `certbot-webroot` — тот же каталог, где лежит compose):
   ```bash
   sudo certbot certonly --webroot -w $(pwd)/certbot-webroot -d alleho.ru -d www.alleho.ru
   ```
   Или явно: `sudo certbot certonly --webroot -w /root/alleho/certbot-webroot -d alleho.ru -d www.alleho.ru`
   Certbot создаст файлы в `/etc/letsencrypt/live/alleho.ru/`.

4. Замените конфиг Nginx на вариант с HTTPS:
   ```bash
   cp nginx/default-https.conf nginx/default.conf
   ```

5. Перезапустите Nginx:
   ```bash
   docker-compose -f docker-compose.prod.yml --env-file .env.prod restart nginx
   ```

После этого **http://alleho.ru** будет перенаправлять на **https://alleho.ru**.

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
