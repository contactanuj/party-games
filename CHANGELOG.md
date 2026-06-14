# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Word-deduction game family** on a new shared engine (`@partydeck/core/word-engine`):
  - **Imposter** - secret word, one fake. Variants: Classic, Beginner (Imposter gets the
    category), and Undercover (Imposter gets a close-but-different word).
  - **Out of the Loop** - app-driven question rounds; the Outsider knows only the category.
    Variants: Standard, Hard, Blind Outsider. Individual scoring.
  - **Spy Hunt** - the Spyfall ruleset under a generic name: 30 locations (3 themed packs),
    8-minute timer, accuse-anytime (unanimous), spy stop-the-clock location guess; classic
    1/2/2/4/4 scoring with an accuser bonus. Variants: Standard, Quick, Two Spies.
- One configurable engine, three games (`contentModel` × `interaction` × `guessMode`), with a
  shared leak-free pass-and-play UI (`word-ui.js`).
- Offline templated **bots** to fill seats (with an honest "talking game" caveat in the lobby).
- Generated app **icons + splash** via a dependency-free PNG/SDF helper (`png-canvas.js`).
- Per-game and shared **tests**: engine unit/fuzz tests and UI smoke tests that assert no
  hidden information leaks onto shared screens.
- Open-source project files: license, contributing guide, code of conduct, security policy,
  issue/PR templates, and CI.

### Changed
- **Safe-area / status bar**: shared `base.css` now applies `env(safe-area-inset-top)` (and
  left/right); generated `app.json` sets a non-translucent Android status bar - content no longer
  renders under the notch / status bar.
- **Keyboard handling**: Android `softwareKeyboardLayoutMode: resize` + scroll-to-top on each
  render, so focusing a text input never pushes the UI up under the status bar.
- **Timer-based reveal**: the secret card auto-hides after a configurable countdown
  (wink-killer style) while still allowing an early hide and a gated re-check.
- **Advanced settings**: the proceed button is disabled while a configuration is invalid (with
  validation surfaced at the top), and steppers cap to the player count - you can no longer leave
  settings with an unstartable game.

[Unreleased]: https://example.com/your-repo/commits/main
