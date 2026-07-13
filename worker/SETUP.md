# Настройка бэкенда (Cloudflare Worker + приватный репозиторий)

Данные (сотрудники, клиенты, записи) хранятся в **приватном** GitHub-репозитории
и доступны только через Cloudflare Worker. Токен доступа лежит **только на
сервере** (в секретах Worker) — ни в публичном коде, ни в браузерах его нет.

```
Витрина/Админка (GitHub Pages)  ──HTTPS──▶  Cloudflare Worker (booking-api)  ──▶  приватный репозиторий booking-system-data (data.json)
        публичные данные / бронь                держит токен, проверяет доступ                 все данные, включая контакты
```

## 1. Приватный репозиторий данных

1. Создайте **приватный** репозиторий: [github.com/new](https://github.com/new)
   → имя `booking-system-data`, отметьте **Private** и **Add a README**.
   (Файл `data.json` Worker создаст сам при первой настройке администратора.)

## 2. Токен доступа к нему

1. Создайте fine-grained токен:
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. **Repository access** → *Only select repositories* → выберите `booking-system-data`.
3. **Permissions** → *Repository permissions* → **Contents: Read and write**.
4. Сгенерируйте и скопируйте токен (`github_pat_…`).

## 3. Деплой Worker

Нужен аккаунт Cloudflare и `wrangler` (`npm i -g wrangler`, затем `wrangler login`).

```bash
cd worker

# Проверьте wrangler.toml: DATA_REPO и CORS_ORIGIN должны соответствовать вашим
# (по умолчанию: borinsobaka-lab/booking-system-data и
#  https://borinsobaka-lab.github.io).

# Секреты (в репозиторий НЕ попадают):
wrangler secret put DATA_TOKEN       # вставьте github_pat_… из шага 2
wrangler secret put SESSION_SECRET   # любая длинная случайная строка

wrangler deploy
```

После деплоя получите адрес Worker, например
`https://booking-api.<ваш-субдомен>.workers.dev`.

## 4. Подключить витрину к Worker

Витрина/админка ходят в API, если при сборке задана переменная `VITE_API_BASE`.
Проще всего — через секрет репозитория `booking-system` (workflow деплоя уже
пробрасывает его в сборку):

1. В репозитории `booking-system` → **Settings → Secrets and variables → Actions
   → New repository variable**: имя `VITE_API_BASE`, значение — адрес Worker
   (без слэша в конце).
2. Перезапустите деплой (push в `main` или **Actions → Deploy → Run workflow**).

Без `VITE_API_BASE` приложение работает в **локальном режиме** (данные в браузере) —
удобно для разработки и демо.

## Что где хранится

- **Приватный** `booking-system-data/data.json` — всё: учётки сотрудников
  (логин + соль + хэш пароля, без открытых паролей), услуги, специалисты,
  расписание, записи клиентов с контактами.
- **Публичный** `booking-system` — только код. Персональных данных нет.
- Worker отдаёт витрине только публичные данные (услуги, специалисты, занятость
  по времени — **без** имён, телефонов и почт). Полные данные с контактами —
  только авторизованным сотрудникам.

## Проверка/локальный запуск

```bash
cd worker
node --test                 # тесты логики API (без сети)
node test/mock-server.mjs   # локальный мок API в памяти (http://localhost:8787)
```

## Эндпоинты API

| Метод | Путь | Кто | Назначение |
|------|------|-----|-----------|
| GET  | `/api/status` | все | есть ли суперадминистратор |
| GET  | `/api/public` | все | данные витрины без персональных данных |
| POST | `/api/bookings` | клиент | создать бронь (сервер проверяет занятость) |
| POST | `/api/auth/setup` | все (один раз) | создать суперадминистратора |
| POST | `/api/auth/login` | сотрудник | вход, выдаёт токен сессии |
| GET  | `/api/data` | сотрудник (токен) | полные данные для админки |
| PUT  | `/api/data` | сотрудник (токен) | сохранить данные (учётки — только owner) |
