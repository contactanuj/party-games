# Party Deck

A monorepo of **standalone pass-and-play party games** - each its own Android app (one APK / store
product) - that share one engineering foundation. Everything runs **offline on a single device**
that players pass around: the phone privately shows each player their secret, hides it, and resolves
the whole game.

Two game families share `@partydeck/core`:

| Family | Engine | Loop | Games |
| --- | --- | --- | --- |
| **Night / vote** | `core-engine.js` | deal hidden roles → secret night actions → discuss → vote → team win | **Werewolf, Daybreak, Vampire, Alien** |
| **Secret word / find-the-outsider** | `word-engine.js` | private reveal → clues / questions / timed Q&A → vote → caught? → guess → score | **Imposter, Out of the Loop, Spy Hunt** |

Each app is an Expo + `react-native-webview` shell that loads one inlined `assets/app.html`,
produced by a `build.js` step from a **pure, deterministic, unit-tested engine** + a DOM UI.

## The word-deduction games

- **Imposter** - everyone gets the secret word; one player doesn't. Give a one-word clue, find the
  fake. *Classic*, *Beginner* (the Imposter gets the category) and *Undercover* (the Imposter gets a
  close-but-different word and isn't told they're the odd one out).
- **Out of the Loop** - the app asks questions about a secret word; everyone answers in turn. The
  Outsider knows only the category and must blend in. *Standard / Hard / Blind Outsider.*
- **Spy Hunt** - everyone shares a location and a role there; the Spy knows neither. Question each
  other on a timer; accuse (everyone must agree) or let the Spy stop the clock to name the location.
  *Standard / Quick / Two Spies.* (The "Spyfall" name is a third-party trademark; this is an
  original-content implementation - see [NOTICE.md](NOTICE.md).)

## Design tenets

- **Pure, deterministic engines.** A single seeded PRNG on `state.rngState`; same
  `(config, seed, inputs)` ⇒ byte-identical state. JSON-serializable. Bots use the same PRNG, so a
  whole match (humans + bots) replays exactly.
- **Information boundary (no leaks).** Shared/observable screens render **only** from the engine's
  public view and never show a role, secret, location, or any role-coded colour/icon/ordering. The
  secret is shown only behind a per-player handoff gate that is **shape-identical** for every role,
  auto-hides on a countdown, and can be re-checked (gated). UI smoke tests assert this.
- **Maximum configurable, but guarded.** Every practical variation is a config field;
  `validateConfig` returns `{errors, warnings}`. Errors make an illegal/unwinnable setup impossible
  to start (the UI disables the proceed button); warnings flag off-spec-but-playable setups.
- **Offline bots.** Any seat can be a computer player to fill the table. These are talking games, so
  bots fill seats and vote but can't truly bluff - the lobby says so.
- **Generated assets.** `app.html`, `app.json`, `icon.png` and `splash.png` are all generated from
  source; only the source is edited.

## Layout

```text
packages/core                       @partydeck/core - the shared foundation
  src/engine/core-engine.js         night/vote/reveal engine (Werewolf family)
  src/engine/word-engine.js         secret-word / find-the-outsider engine
  src/ui/core-ui.js, word-ui.js     shared pass-and-play UIs (one per family)
  src/ui/sound.js                   synthesized SFX
  src/css/base.css                  themed base (games override CSS tokens only)
  build/{compose,guards,make-app-json,png-canvas}.js   build + asset tooling
  tests/                            framework tests + DOM stubs
apps/<game>                         one Expo app (= one APK) each
scripts/run-tests.js                dependency-free runner for every test
```

## Develop

```bash
# Run every engine + UI smoke test (no install needed - pure Node):
node scripts/run-tests.js

# Per app (example: imposter):
cd apps/imposter
node scripts/make-icon.js                          # icon.png + splash.png
node ../../packages/core/build/make-app-json.js    # app.json
node build.js                                       # assets/app.html

# With Expo installed (npm install at the repo root once):
npm start -w imposter                                # gen config + build + expo start
npm run build:android -w imposter                    # EAS preview APK
```

## Build APKs in CI

The `EAS Build (Android)` GitHub Action builds any app on demand. Add your Expo access token as a
repository secret named **`EXPO_TOKEN`** (Settings → Secrets and variables → Actions), then run the
workflow and pick the app. The token is never stored in the repo.

## License

[MIT](LICENSE). Game *content* is original; see [NOTICE.md](NOTICE.md) for the originality and
trademark notice. Contributions welcome - see [CONTRIBUTING.md](CONTRIBUTING.md).
