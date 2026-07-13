# Настройка бэкенда (Cloudflare Worker + приватный репозиторий)

Данные (сотрудники, клиенты, записи) хранятся в **приватном** GitHub-репозитории
и доступны только через Cloudflare Worker. Токен доступа лежит **только на
сервере** (в секретах Worker) — ни в публичном коде, ни в браузерах его нет.

```
Витрина/Админка (GitHub Pages)  ──HTTPS──▶  Cloudflare Worker (booking-api)  ──▶  приватный репозиторий booking-system-data (data.json)
        публичные данные / бронь                держит токен, проверяет доступ                 все данные, включая контакты
```

> **Регистрации нет.** В системе нельзя «создать администратора» из интерфейса —
> это было бы дырой (любой мог бы стать владельцем). Суперадминистратор
> заводится **вручную** (шаг 2), сотрудников создаёт уже он внутри панели.

## 1. Приватный репозиторий данных

1. Создайте **приватный** репозиторий: [github.com/new](https://github.com/new)
   → имя `booking-system-data`, отметьте **Private** и **Add a README**.

## 2. Завести суперадминистратора (вручную)

Сгенерируйте `data.json` с единственным владельцем (пароль в открытом виде
никуда не пишется — только соль и хэш):

```bash
cd worker
node seed-owner.mjs <логин> <пароль> "Ваше имя" > data.json
```

Закоммитьте получившийся `data.json` в корень приватного репозитория
`booking-system-data` (ветка `main`). Всё — владелец заведён.

> Сменить пароль потом можно прямо в панели («Пользователи» → у себя
> «Сменить пароль») или заново сгенерировав `data.json` этим скриптом.

## 3. Токен доступа к репозиторию

1. Создайте fine-grained токен:
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
2. **Repository access** → *Only select repositories* → выберите `booking-system-data`.
3. **Permissions** → *Repository permissions* → **Contents: Read and write**.
4. Сгенерируйте и скопируйте токен (`github_pat_…`).

## 4. Деплой Worker

> **Где код Worker'а?** Он уже написан и лежит в ЭТОМ репозитории (`booking-system`)
> в папке **`worker/`**: точка входа `worker.js`, логика `src/api.js` / `src/store.js`
> / `src/logic.js`, конфиг `wrangler.toml`. Писать с нуля ничего не нужно.
>
> **Мастер «Create Worker» в дашборде Cloudflare не используем** — там нет нашей
> папки `worker/`. Деплой идёт из кода одним из способов ниже.

### Способ A (рекомендуется) — из командной строки, `wrangler`

`wrangler deploy` сам создаёт Worker `booking-api` и заливает код — предварительно
создавать приложение в дашборде не нужно.

```bash
git clone https://github.com/borinsobaka-lab/booking-system
cd booking-system/worker

npm i -g wrangler
wrangler login

# Проверьте wrangler.toml: DATA_REPO и CORS_ORIGIN должны соответствовать вашим
# (по умолчанию: borinsobaka-lab/booking-system-data и
#  https://borinsobaka-lab.github.io).

# Секреты (в репозиторий НЕ попадают):
wrangler secret put DATA_TOKEN       # вставьте github_pat_… из шага 3
wrangler secret put SESSION_SECRET   # любая длинная случайная строка

wrangler deploy
```

После деплоя получите адрес Worker, например
`https://booking-api.<ваш-субдомен>.workers.dev`.

### Способ B — через дашборд, «Connect GitHub»

Если удобнее деплоить из GitHub (Workers Builds):
1. **Connect GitHub** → выберите репозиторий `borinsobaka-lab/booking-system`.
2. В настройках сборки укажите **Root directory = `worker`** (наш `wrangler.toml`
   лежит в подпапке, а не в корне репозитория). Build command можно оставить
   пустым, deploy command — `npx wrangler deploy`.
3. Секреты **DATA_TOKEN** и **SESSION_SECRET** добавьте в дашборде:
   *Worker → Settings → Variables and Secrets* (тип Secret).

Оба способа дают один и тот же результат. Проще — способ A.

## 5. Подключить витрину к Worker

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
node mock-server.mjs   # локальный мок API в памяти (http://localhost:8787)
```

## Эндпоинты API

| Метод | Путь | Кто | Назначение |
|------|------|-----|-----------|
| GET  | `/api/public` | все | данные витрины без персональных данных |
| POST | `/api/bookings` | клиент | создать бронь (сервер проверяет занятость) |
| POST | `/api/auth/login` | сотрудник | вход, выдаёт токен сессии |
| GET  | `/api/data` | сотрудник (токен) | полные данные для админки |
| PUT  | `/api/data` | сотрудник (токен) | сохранить данные (учётки — только owner) |

Регистрации/создания владельца через API нет — суперадминистратор заводится
скриптом `seed-owner.mjs` (шаг 2).
