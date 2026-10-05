# 🚀 Chore Mission

A tiny self-hosted chore tracker that turns chores into a game: kids earn stars for doing chores, then spend them on a prize wheel. One Node container, SQLite on a volume, zero npm dependencies.

Built for Gabriel, but works for any kid with a tablet.

## Features

- **Stars** — every chore is worth stars; check-offs sync live across devices.
- **Prize wheel** — earn enough stars, then spin to win a prize.
- **Free spins** — parents can grant a free spin from Setup.
- **Prize cooldown** — a won prize leaves the wheel until Sunday (or 7 days, whichever is sooner); its slot becomes a FREE SPIN.
- **Stats** — all-time stars, streaks, monthly hit rate, and a calendar heatmap.
- **Parent PIN** — Setup is locked behind a 4–8 digit PIN.
- **Family password** — optional password gating the whole site.
- **PWA** — add to the home screen for a full-screen app with an offline shell.
- **Version tracking** — version shown in the app and at `/version`.

## How it works

1. Grown-ups add chores (each worth stars) and prizes in **Setup**.
2. The kid checks off chores — stars accumulate and never reset.
3. When he has enough stars (the "goal"), the wheel unlocks. A spin costs the goal, so he keeps earning for the next spin.
4. A won prize is off the wheel for the rest of the week (back Sunday).
5. The monthly goal tracks a bigger reward.

## Requirements

- Node.js 22+ (uses the built-in `node:sqlite`).
- No npm dependencies.

## Quick start

```bash
PORT=8080 DATA_DIR=./data node server.js
# open http://localhost:8080
```

First run seeds the database from `seed.json` — only when the database is empty.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `FAMILY_PASSWORD` | *(unset)* | Optional password gating the whole site. Leave unset only on a trusted LAN. |
| `PORT` | `8080` | HTTP port. |
| `DATA_DIR` | `./data` | Where the SQLite database lives. |
| `TZ` | `America/New_York` | Container timezone (set in `docker-compose.yml`). |

## Deploy (VPS)

GitHub Actions builds `ghcr.io/slackerchris/chore-mission` (amd64 + arm64) on every push to `main`.

```bash
mkdir chore-mission && cd chore-mission
# copy docker-compose.yml and .env.example from this repo, then:
cp .env.example .env && nano .env          # set FAMILY_PASSWORD
echo <PAT with read:packages> | docker login ghcr.io -u slackerchris --password-stdin   # only needed while the package is private
docker compose pull && docker compose up -d
```

Open `http://<host>:8080`. For a proxy-only setup, bind `127.0.0.1:8080:8080` in `docker-compose.yml`.

The container starts as root, makes the mounted `data/` folder writable by the app's `node` user, then drops privileges.

## HTTPS

Run behind a reverse proxy that terminates TLS — otherwise the family password travels in cleartext. The app reads `X-Forwarded-Proto` to mark the login cookie `Secure`.

**Caddy**

```caddy
chores.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

**nginx**

```nginx
server {
    listen 443 ssl;
    server_name chores.example.com;
    ssl_certificate     /etc/letsencrypt/live/chores.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chores.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Family password

`FAMILY_PASSWORD` gates the whole site. Each device logs in once and stays logged in for a year (HttpOnly cookie). Changing the password logs every device out. 10 wrong tries locks the login for 5 minutes.

## First-time setup

1. Log in with the family password, then open **Setup** and create the parent PIN (4–8 digits).
2. On his tablet: open the URL, then **Add to Home Screen**.

## The parent PIN

- Chore check-offs, spins, and free-spin grants need only the family password.
- Editing Setup (chores, prizes, goals, name) requires the PIN. The server checks it with scrypt and hands out a 30-minute token, discarded when the tab is left or the screen turns off.
- 5 wrong PINs locks the PIN check for a minute.
- Lockouts and setup tokens live only in the running container, so restarting it clears them.

Forgot the PIN:

```bash
docker exec chore-mission node server.js --reset-pin
```

## Data

- Everything lives in `./data/chores.db` (SQLite, WAL mode).
- Backup: copy `data/`, or `sqlite3 data/chores.db ".backup chores-backup.db"`.
- Peek: `sqlite3 data/chores.db "select col,id,data from docs"`.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/col/{setup,days,spins}` | All docs in a collection |
| GET/PUT/PATCH/DELETE | `/api/doc/{col}/{id}` | `setup` writes need `Authorization: Bearer <token>` |
| POST | `/api/pin` | `{"pin":"1234"}` creates the PIN if none, else returns a token |
| GET | `/api/events` | Server-sent events; pushes every change to all devices |
| GET | `/healthz` | Container healthcheck |
| GET | `/version` | App version (plain text) |

## Versioning & changelog

The version lives in `VERSION`, is shown at the bottom of the page and at `/version`, and bumps the service-worker cache name so the PWA picks up new builds. See [CHANGELOG.md](CHANGELOG.md).

## Updating

Push to `main`, wait for the Action to finish, then on the VPS:

```bash
docker compose pull && docker compose up -d
```

