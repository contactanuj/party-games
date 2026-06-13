# Party Games — social-deduction night/vote games

A monorepo of **four separate Android games** (each its own APK / store product) that share one
engineering foundation: **Werewolf, Daybreak, Vampire, Alien**. Each is a single-device
**pass-and-play** social-deduction game — everyone is secretly dealt a role, some roles act
during a hidden **night**, then the table **discusses and votes**, and team-based **win
resolution** decides who wins.

Built the same way as the other games in this workspace: an Expo + `react-native-webview`
shell loads one inlined `assets/app.html` produced by a `build.js` step from a **pure,
deterministic, unit-tested engine** + DOM UI.

## Layout

```
packages/core            @partydeck/core — the shared foundation
  src/engine/core-engine.js   pure rules engine (night scheduler, vote + multi-team win, validate, bots)
  src/ui/ui-core.js           shared pass-and-play UI (handoff gating, no-leak boundary, both play modes)
  src/ui/sound.js             synthesized SFX
  src/css/base.css            themed base (games override CSS tokens only)
  build/{compose,guards,make-app-json,gen-icons}.js   build + asset tooling
  tests/                      framework tests + shared DOM stub
apps/{werewolf,daybreak,vampire,alien}    one Expo app (= one APK) each
  src/{roles,presets,theme,ui-glue}       the only files authored per game
  tests/                                  per-game engine + UI smoke tests
```

## Design tenets

- **Pure, deterministic engine.** A single seeded PRNG on `state.rngState`; same
  `(config, seed, inputs)` ⇒ byte-identical state. JSON-serializable. Unit-tested by simulating
  full games (fuzz) + a win-condition matrix + deterministic-replay + JSON round-trip.
- **Maximum configurable, but validated.** `validateConfig` returns `{errors, warnings}` —
  errors block starting an illegal/unwinnable game; warnings flag off-spec-but-playable setups.
- **Information boundary (no leaks).** Shared/observable screens render only from
  `publicView(state)` and never show a role/team/card or any role-coded color or icon. Private
  info appears only behind a per-player handoff gate; during the night the device is handed to
  **every** player (real actors + indistinguishable decoys) so observers can't tell who has a
  role. A UI smoke test asserts no role name leaks onto any shared screen.
- **Two play modes per app.** Digital pass-and-play (the phone holds the cards and resolves
  everything) **and** narrator mode (physical cards; the app calls the night order + a timer).
- **Bots.** Any number of seats can be computer players (fill the table / solo practice) — they
  act legally at night (via the engine PRNG) and vote from their own private knowledge.

## Develop

```bash
npm install                     # one install for the whole workspace
npm test                        # core + all games (dependency-free Node tests)
npm run build:html -w werewolf  # regenerate apps/werewolf/assets/app.html
npm start -w werewolf           # gen config + build + expo start
npm run build:android -w werewolf   # EAS preview APK
```

See `apps/werewolf` for the reference implementation; Daybreak / Vampire / Vampire / Alien
follow the same shape and reuse `@partydeck/core`.
