# Imposter

Everyone gets the secret word - everyone but one. Going around the circle, each player says a
one-word clue. Too obvious and you help the Imposter; too vague and *you* look guilty. Then discuss
and vote. Catch the Imposter and they get one guess at the word to escape.

- **Players:** 3-12 · **Time:** a few minutes per round
- **Variants:** *Classic* (Imposter has no word) · *Beginner* (Imposter is told the category) ·
  *Undercover* (Imposter gets a close-but-different word and isn't told they're the odd one out)

Built on `@partydeck/core/word-engine` (`contentModel: word | wordPair`, `interaction: clues`,
`guessMode: free`). See the [repo README](../../README.md) and [CONTRIBUTING](../../CONTRIBUTING.md).

## Build / run

```bash
node scripts/make-icon.js                          # icon.png + splash.png
node ../../packages/core/build/make-app-json.js    # app.json
node build.js                                       # assets/app.html
node tests/engine.imposter.test.js && node tests/ui.imposter.smoke.test.js
npm start                                            # (after `npm install`) gen + build + expo start
```
