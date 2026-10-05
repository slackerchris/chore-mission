# Changelog

All notable changes to Chore Mission are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
