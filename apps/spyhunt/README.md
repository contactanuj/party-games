# Spy Hunt

Everyone is at the same location and has a role there — except the Spy, who knows neither. On an
8-minute clock, take turns asking each other questions: prove you belong without giving the place
away. Any player can call an accusation (everyone else must agree); catch the Spy to win, accuse
wrongly and the Spy wins. The Spy can stop the clock at any time to name the location for the win.

- **Players:** 3–12 · **Time:** up to 8 minutes per round
- **Variants:** *Standard* · *Quick* (4-minute round) · *Two Spies* (who don't know each other; 6+
  players)
- Scoring: classic 1 / 2 / 2 / 4 / 4 with a +1 bonus to whoever leads a correct catch.

Built on `@partydeck/core/word-engine` (`contentModel: locationRoles`, `interaction: play`,
`guessMode: list`). Implements the *Spyfall* format under a generic name with original content —
see [NOTICE.md](../../NOTICE.md). See the [repo README](../../README.md) and
[CONTRIBUTING](../../CONTRIBUTING.md).

## Build / run

```bash
node scripts/make-icon.js                          # icon.png + splash.png
node ../../packages/core/build/make-app-json.js    # app.json
node build.js                                       # assets/app.html
node tests/engine.spyhunt.test.js && node tests/ui.spyhunt.smoke.test.js
npm start                                            # (after `npm install`) gen + build + expo start
```
