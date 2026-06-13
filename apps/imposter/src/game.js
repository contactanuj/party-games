/*
 * game.js (Imposter) — the game DEFINITION handed to WordCore.createEngine(), plus UI meta
 * (title/tagline/variant presets/help). Pure data + tiny hooks; no DOM.
 *
 * UMD: Node tests require() this; the inlined browser bundle reads window.WORD_GAME.
 *
 * Imposter is the "secret word, one fake" game. It ships TWO practical variants on one engine:
 *   - Classic   (contentModel 'word')     Crew share a word; the Imposter has none.
 *   - Undercover(contentModel 'wordPair')  the Imposter gets a CLOSE word, not a blank.
 * plus a Beginner toggle that tells the Imposter the category (a softer ramp for new players).
 */
(function (root, factory) {
  var G = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  if (root) { root.WORD_GAME = G; root.IMPOSTER_GAME = G; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  return {
    // ---- engine definition (consumed by WordCore.createEngine) ----
    game: 'imposter',
    outsider: { label: 'Imposter', plural: 'Imposters' },
    insider: { label: 'Crew', plural: 'Crew' },
    contentModel: 'word',
    allowedContentModels: ['word', 'wordPair'],
    interaction: 'clues',
    allowedInteractions: ['clues'],
    guessMode: 'free',                 // a caught Imposter types/guesses the secret word
    minPlayers: 3,
    maxPlayers: 12,
    defaultWinTarget: 7,
    botsImpractical: true,             // talking game: bots fill seats + vote, but cannot truly bluff
    giveOutsiderHintDefault: false,

    // Per-game scoring + flow defaults (named buckets in the engine):
    configDefaults: function () {
      return {
        scoreOutsiderEscape: 2,        // Imposter survives the vote
        scoreOutsiderGuess: 1,         // Imposter caught but guesses the word
        scoreInsiderCatch: 1,          // each Crew member when the Imposter is caught + fails
        scoreWrongConviction: 2,       // Imposter when the Crew accuse the wrong person
        cluesPerPlayer: 1,
        recordClues: true,
        debatePhase: true,
        dealerRotation: 'clockwise'
      };
    },

    // Extra guardrails specific to Imposter.
    validateRules: [
      function (c) {
        if (c.contentModel === 'wordPair' && c.giveOutsiderHint) {
          return { level: 'warn', text: 'In Undercover the Imposter already has a (similar) word — the category hint makes them almost impossible to catch.' };
        }
        return null;
      }
    ],

    // ---- UI meta (copy + the variation presets the Settings screen offers) ----
    meta: {
      title: 'Imposter',
      tagline: 'Everyone gets the secret word. Everyone but one. Give a one-word clue, find the fake — before the fake fools you.',
      // Each variant is a named preset: a friendly bundle of config the player can pick, then
      // fine-tune. (The full option list is still available in Advanced settings.)
      variants: [
        { id: 'classic', name: 'Classic', blurb: 'The Crew share one word. The Imposter has nothing and must fake it.',
          patch: { contentModel: 'word', giveOutsiderHint: false } },
        { id: 'beginner', name: 'Beginner', blurb: 'Same as Classic, but the Imposter is told the category — easier to blend in.',
          patch: { contentModel: 'word', giveOutsiderHint: true } },
        { id: 'undercover', name: 'Undercover', blurb: 'The Imposter gets a SIMILAR word and may not even know they are the odd one out.',
          patch: { contentModel: 'wordPair', giveOutsiderHint: false } }
      ],
      defaultVariant: 'classic',
      optionLabels: {
        outsiderCount: 'Number of Imposters',
        giveOutsiderHint: 'Tell the Imposter the category',
        cluesPerPlayer: 'Clue rounds (each player speaks)',
        recordClues: 'Type each clue so the table can recap',
        outsiderGuesses: 'Guesses if the Imposter is caught'
      },
      // Which engine options are irrelevant to this game and should be hidden from the form:
      hiddenOptions: ['interaction', 'questionsPerRound', 'allowOutsiderEarlyGuess', 'accusationMode', 'scoreOutsiderSolved', 'scoreAccuserBonus', 'guessMode'],
      help: [
        'Pass the phone around — each player privately sees the secret word (or that they are the Imposter).',
        'Going around the circle, everyone says ONE word linked to the secret. Too obvious helps the Imposter; too vague makes YOU look guilty.',
        'Then discuss and vote. Catch the Imposter and they get one guess at the word to escape.'
      ]
    }
  };
});
