# Chore Mission

Self-hosted chore chart for Gabriel. One Node container, SQLite on a volume, no npm dependencies.

## Deploy (VPS, pulls the prebuilt image)

GitHub Actions builds `ghcr.io/slackerchris/chore-mission` (amd64 + arm64) on every push to `main`.

```bash
mkdir chore-mission && cd chore-mission
# grab docker-compose.yml and .env.example from this repo, then:
cp .env.example .env && nano .env          # set FAMILY_PASSWORD
echo <PAT with read:packages> | docker login ghcr.io -u slackerchris --password-stdin   # only needed while the package is private
docker compose pull && docker compose up -d
```

Open `http://<host>:8080`. Change the left side of `8080:8080` in `docker-compose.yml` if the port is taken. Put it behind your reverse proxy for HTTPS (it reads `X-Forwarded-Proto` to mark the login cookie Secure).

Updates: `docker compose pull && docker compose up -d`. The `data/` folder is untouched.

First run seeds your current chores, prizes and goals from `seed.json`. History starts empty. The seed is only used when the database is empty.

## Family password

`FAMILY_PASSWORD` gates the whole site. Each device logs in once and stays logged in for a year (HttpOnly cookie). Changing the password logs every device out. 10 wrong tries locks the login for 5 minutes. Leave it unset only on a trusted LAN.

## First-time setup

1. Log in with the family password, then open the **Setup** tab and create the parent PIN (4 to 8 digits).
2. On his tablet: open the URL, then **Add to Home Screen**. It runs full-screen like an app.

## How the lock works

- Chore check-offs and spins need only the family password, not the PIN.
- Anything in Setup (chores, prizes, goals, name) requires the PIN. The server checks it with scrypt and hands out a 30-minute token, which the page throws away when you leave the tab or the screen turns off.
- 5 wrong PINs locks the PIN check for a minute.

Forgot the PIN:

```bash
docker exec chore-mission node server.js --reset-pin
```

## Data

- Everything lives in `./data/chores.db` (SQLite, WAL mode).
- Backup: copy the `data/` folder, or `sqlite3 data/chores.db ".backup chores-backup.db"`.
- Peek at it: `sqlite3 data/chores.db "select col,id,data from docs"`.

## API (if you want to poke at it)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/col/{setup,days,spins}` | all docs in a collection |
| GET/PUT/PATCH/DELETE | `/api/doc/{col}/{id}` | `setup` writes need `Authorization: Bearer <token>` |
| POST | `/api/pin` | `{"pin":"1234"}` creates the PIN if none, else returns a token |
| GET | `/api/events` | server-sent events, pushes every change so all devices stay in sync |
| GET | `/healthz` | container healthcheck |

## Updating

Push to `main`, wait for the Action to finish, then on the VPS: `docker compose pull && docker compose up -d`.
