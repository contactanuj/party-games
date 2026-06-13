/*
 * game.js (Spy Hunt) — definition for WordCore.createEngine() + UI meta.
 *
 * The "Spyfall" ruleset, shipped under a generic name (the Spyfall name/marks are Cryptozoic's).
 * Everyone shares a LOCATION and a personal role there; the Spy gets neither. Free-form Q&A on an
 * 8-minute clock; any player can call an accusation that needs everyone-but-the-accused to agree;
 * the Spy may stop the clock at any time to name the location. Scoring: 1 / 2 / 2 / 4 / 4 with a
 * +1 bonus to whoever leads a correct catch (the classic point values).
 */
(function (root, factory) {
  var G = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  if (root) { root.WORD_GAME = G; root.SPYHUNT_GAME = G; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  return {
    game: 'spyhunt',
    outsider: { label: 'Spy', plural: 'Spies' },
    insider: { label: 'Agent', plural: 'Agents' },
    contentModel: 'locationRoles',
    allowedContentModels: ['locationRoles'],
    interaction: 'play',
    allowedInteractions: ['play'],
    guessMode: 'list',                 // the Spy guesses from the master location list
    caughtCanGuessDefault: false,      // a Spy caught by the table is just caught (no extra guess)
    allowOutsiderEarlyGuessDefault: true,
    defaultAccusationMode: 'unanimous_anytime',
    defaultTimerSeconds: 480,          // 8 minutes
    minPlayers: 3,
    maxPlayers: 12,
    defaultWinTarget: 8,
    botsImpractical: true,
    outsidersKnowEachOther: false,     // 2-spy variant: spies do NOT know each other (harder)

    configDefaults: function () {
      return {
        timerSeconds: 480,
        debatePhase: false,            // play IS the discussion; the final vote follows the timer
        // classic Spyfall scoring (per the rulebook):
        scoreInsiderCatch: 1,          // each Agent when the Spy is caught
        scoreAccuserBonus: 1,          // the Agent who leads a correct catch gets +2 total
        scoreOutsiderEscape: 2,        // Spy survives to the timeout uncaught
        scoreWrongConviction: 4,       // an Agent is wrongly convicted -> Spy
        scoreOutsiderSolved: 4,        // Spy stops the clock and names the location
        dealerRotation: 'clockwise'
      };
    },

    // Guardrail: a 2nd Spy needs a bigger table to stay fair.
    validateRules: [
      function (c) {
        if (c.outsiderCount >= 2 && c.playerCount < 6) {
          return { level: 'warn', text: 'Two Spies works best with 6+ players — with fewer, the Agents are stretched thin.' };
        }
        return null;
      }
    ],

    meta: {
      title: 'Spy Hunt',
      tagline: 'Everyone knows the location — except the Spy. Ask sharp questions, prove you belong, and unmask the impostor before the clock runs out.',
      variants: [
        { id: 'standard', name: 'Standard', blurb: 'One Spy, 8-minute round. Accuse any time (everyone must agree).',
          patch: { outsiderCount: 1, timerSeconds: 480 } },
        { id: 'quick', name: 'Quick', blurb: 'A tense 4-minute round for a faster game.',
          patch: { outsiderCount: 1, timerSeconds: 240 } },
        { id: 'twospies', name: 'Two Spies', blurb: 'Two Spies who do NOT know each other. Best with 6+ players.',
          patch: { outsiderCount: 2, timerSeconds: 480 } }
      ],
      defaultVariant: 'standard',
      optionLabels: {
        outsiderCount: 'Number of Spies',
        timerSeconds: 'Round length',
        allowOutsiderEarlyGuess: 'Spy may stop the clock to guess the location'
      },
      hiddenOptions: ['interaction', 'cluesPerPlayer', 'recordClues', 'questionsPerRound', 'contentModel', 'giveOutsiderHint', 'guessMode', 'caughtCanGuess', 'outsiderGuesses', 'debatePhase'],
      help: [
        'Pass the phone around — each player privately sees the LOCATION and their role there. The Spy is told only that they are the Spy.',
        'Start the timer. Take turns asking each other questions about the place — answer so the others know you belong, without naming the location (the Spy is listening).',
        'Any time, tap Accuse: if everyone else agrees, the accused is revealed. Catch the Spy to win; accuse wrongly and the Spy wins. The Spy can stop the clock to guess the location for the win.'
      ]
    }
  };
});
