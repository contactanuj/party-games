# Security Policy

These are offline, single-device pass-and-play games. They make **no network requests** at
runtime and collect **no personal data**, so the attack surface is small. Still, we take two
classes of issue seriously:

## 1. Information-leak bugs (game-integrity)

A bug where a **shared/observable screen reveals hidden information** (who the Imposter/Spy/Outsider
is, the secret word, a player's location/role, or any role-coded colour/icon) is treated as a
**high-severity** defect — it ruins the game. If you find one, please report it (see below) with the
game, the screen, and steps to reproduce. The UI smoke tests assert against this class of bug;
a regression test should accompany the fix.

## 2. Software vulnerabilities

If you discover a vulnerability in the build tooling, dependencies, or the app shell:

- **Do not** open a public issue for anything exploitable.
- Email the maintainers (or use GitHub's *Private vulnerability reporting* under the repo's
  **Security** tab) with a description and reproduction.
- We aim to acknowledge within a few days and to fix or mitigate promptly.

## Secrets

This repository must never contain credentials. Expo access tokens, keystores, and service
credentials belong in environment variables / CI secrets (e.g. `EXPO_TOKEN` as a GitHub Actions
secret), never in tracked files. If a secret is committed by mistake, **rotate it immediately** and
scrub it from history.

## Supported versions

The latest `main` is supported. Released app versions are tracked in [CHANGELOG.md](CHANGELOG.md).
