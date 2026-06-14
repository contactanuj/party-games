# Contributing

Thanks for your interest in improving Party Deck! This is a monorepo of standalone
pass-and-play party games that share two engines and one build pipeline.

## Ground rules (read these first)

1. **Never leak hidden information.** Every shared/observable screen must render only from the
   engine's public view (`publicState()` / `publicView()`) and must never show a role, team, secret
   word, location, or any role-coded colour/icon/ordering. Secrets appear only behind the per-player
   handoff gate. If you touch the UI, run the UI smoke tests - they assert no leaks.
2. **Engines are pure and deterministic.** No DOM, no network, no `Date.now()`/`Math.random()` in
   engine code - randomness comes only from the seeded PRNG on `state.rngState`. State must stay
   JSON-serializable. Same `(config, seed, inputs)` ⇒ byte-identical state.
3. **Configurable, but guarded.** Every practical variation is a config field; `validateConfig`
   returns `{errors, warnings}`. Errors must make an illegal/unwinnable setup impossible to start
   (and the UI disables the proceed button) - they are not just cosmetic warnings.
4. **Build artifacts are generated.** `assets/app.html` is produced by `build.js`; `app.json` by
   `make-app-json.js`; `icon.png`/`splash.png` by `make-icon.js`. Edit the sources, not the output.

## Project layout

```
packages/core            @partydeck/core - shared foundation
  src/engine/core-engine.js   night/vote/reveal engine (Werewolf family)
  src/engine/word-engine.js   secret-word / find-the-outsider engine (Imposter / Out of the Loop / Spy Hunt)
  src/ui/{ui-core,word-ui}.js shared pass-and-play UIs (one per family)
  src/ui/sound.js             synthesized SFX
  src/css/base.css            themed base (games override CSS tokens only - no role colours)
  build/                      compose, guards, make-app-json, png-canvas
  tests/                      framework tests + DOM stubs
apps/<game>              one Expo app (= one APK) each
  src/                        the per-game files (roles/game + content + theme + ui-glue)
  tests/                      per-game engine + UI smoke tests
```

## Develop

```bash
node scripts/run-tests.js          # run every engine + UI smoke test (no install needed)
cd apps/imposter
node scripts/make-icon.js          # regenerate icon.png + splash.png
node ../../packages/core/build/make-app-json.js   # regenerate app.json
node build.js                      # regenerate assets/app.html
npm start                          # gen config + build + expo start (needs `npm install`)
```

## Adding a new word-deduction game

1. Add `apps/<game>/src/content.js` (`window.WORD_CONTENT`) and `src/game.js` (`window.WORD_GAME`
   def + UI meta), plus `theme.css`, `identity.json`, `App.js`, `build.js`, `scripts/make-icon.js`.
2. Pick `contentModel` (`word` / `wordPair` / `locationRoles`), `interaction`
   (`clues` / `questions` / `play`), `guessMode`, and the scoring buckets in `configDefaults`.
3. Add `tests/engine.<game>.test.js` and `tests/ui.<game>.smoke.test.js` (copy an existing pair).
   The UI smoke test **must** assert the secret never appears on a shared screen.

## Pull requests

- Keep PRs focused; describe the change and the testing you did.
- `node scripts/run-tests.js` must pass.
- Don't commit generated `app.html` or any secret/token.
- Match the surrounding code style (2-space indent, the conventions in `.editorconfig`).

By contributing you agree your contributions are licensed under the repository's [MIT License](LICENSE).
