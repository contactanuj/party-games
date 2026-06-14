# Out of the Loop

Everyone shares a secret word inside a known category - except one player, who knows only the
category. The app asks questions about the word; going around the circle, everyone answers out loud
(without saying it). Then discuss and vote for the Outsider. A caught Outsider can still name the
word to steal the round. Individual scoring rewards a hidden Outsider heavily.

- **Players:** 3-9 · **Time:** ~5-10 min per round
- **Variants:** *Standard* (4 questions, Outsider knows the category) · *Hard* (2 questions) ·
  *Blind Outsider* (not even told the category)

Built on `@partydeck/core/word-engine` (`contentModel: word`, `interaction: questions`,
`guessMode: free`). See the [repo README](../../README.md) and [CONTRIBUTING](../../CONTRIBUTING.md).

## Build / run

```bash
node scripts/make-icon.js                          # icon.png + splash.png
node ../../packages/core/build/make-app-json.js    # app.json
node build.js                                       # assets/app.html
node tests/engine.outoftheloop.test.js && node tests/ui.outoftheloop.smoke.test.js
npm start                                            # (after `npm install`) gen + build + expo start
```
