# Changelog

All notable changes to Chore Mission are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-08

### Added
- **Parent sign-off.** Setup now opens with a "Sign off chores" list of everything Gabriel has checked off, grouped by day, with Approve, Not done, and Approve all. Stars still count as soon as he checks a chore; "Not done" un-checks it and takes the stars back. The Setup tab shows a badge with the number waiting, and signed-off chores get a gold check on the Today screen.
- Sign-offs are stored per day (`days/<date>.ok`) and can only be changed with the parent PIN. Without it, the server keeps existing sign-offs, and signed-off chores can't be un-checked.

### Fixed
- The spin count on screen didn't go down after a spin (and stars didn't update after checking off a chore) when the live-update stream was delayed or blocked, for example by a proxy. The server now returns the updated balance with every spin and every save, and the app applies it immediately.

## [1.2.0] - 2026-10-07

### Changed
- **The server now owns the star and spin balance.** It recomputes `spins/_balance` (now `{spins, spent, stars}`) from `days` and `setup/main` after every chore or setup change, and the browser only displays it. Clients can no longer write `_balance` directly.
- Spinning goes through the new `POST /api/spin` endpoint, which uses a free spin first, then an earned spin.

### Added
- `GET /api/balance` returns the current spins, stars spent, total stars, goal and available stars.

### Fixed
- Refreshing the page could reset or change the star balance. The browser sometimes computed 0 stars before the chore list had loaded and saved that result over the stored balance.

## [1.1.0] - 2026-10-05

### Changed
- **Spins are now a persisted counter.** When Gabriel earns a full goal's worth of stars, those stars are subtracted and one spin is written to the database, instead of deriving the spin count from the star balance.
- Pressing SPIN now consumes a spin immediately; "SPIN AGAIN" slices no longer refund the spin.
- Moved the free-spin button to the top of Setup and made it prominent.
- Star progress now caps at the goal instead of showing a total that exceeds it.

### Fixed
- Star balance can no longer display a negative number.

## [1.0.0] - 2026-10-05

### Changed
- **Stars accumulate forever.** Removed the weekly star reset and the weekly wheel lock. A spin now costs the goal in stars, so the loop is "earn → redeem → earn again".
- **Won prizes go on cooldown.** A prize that has been won is off the wheel until the earlier of 7 days or next Sunday; its slot becomes a FREE SPIN until then.

### Added
- **Free spins.** Parents can grant a free spin from Setup ("Give him a free spin"). Free-spin wins don't spend stars.
- **Version tracking.** `VERSION` file, `/version` endpoint, version shown in the app, and automatic service-worker cache busting on version bumps.
- **"All prizes won" state** when every prize is on cooldown.

### Fixed
- Star balance can no longer display a negative number.

## [0.2.0] - 2026-10-01

### Added
- Request logging and Docker log rotation; port 8080 exposed for direct access.
- Configurable `TZ`; hardened `docker-compose` (init, `no-new-privileges`, dropped capabilities).
- CI workflow (syntax check + smoke test) and multi-arch image publishing to `ghcr.io`.
- Self-hosted fonts and a service worker for an offline app shell.
- More chore and prize emoji.

### Fixed
- Stats are recomputed from the done map, avoiding stale cached aggregates.

## [0.1.0] - 2026-10-01

### Added
- Initial release: chore chart with stars, prize wheel, streaks, monthly goals, calendar heatmap, parent PIN, family password, and live multi-device sync.
