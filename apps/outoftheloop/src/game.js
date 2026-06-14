/*
 * game.js (Out of the Loop) - definition for WordCore.createEngine() + UI meta.
 *
 * Everyone In the Loop shares a secret word inside a known CATEGORY; the Outsider knows only the
 * category. The APP poses questions (the 'questions' interaction); everyone answers out loud in
 * turn without saying the word. Then the table votes. Individual scoring rewards a hidden Outsider
 * heavily, and a caught Outsider can still salvage the round by naming the word.
 */
(function (root, factory) {
  var G = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  if (root) { root.WORD_GAME = G; root.OOTL_GAME = G; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  return {
    game: 'outoftheloop',
    outsider: { label: 'Outsider', plural: 'Outsiders' },
    insider: { label: 'In the Loop', plural: 'In the Loop' },
    contentModel: 'word',
    allowedContentModels: ['word'],
    interaction: 'questions',
    allowedInteractions: ['questions'],
    guessMode: 'free',                 // a caught Outsider can name the word to escape
    minPlayers: 3,
    maxPlayers: 9,
    defaultWinTarget: 10,
    botsImpractical: true,
    giveOutsiderHintDefault: true,     // the category is public knowledge in this game

    configDefaults: function () {
      return {
        questionsPerRound: 4,
        debatePhase: true,
        giveOutsiderHint: true,        // tell the Outsider the category (core to the game)
        // individual scoring: a hidden Outsider scores big; catching them rewards the table.
        scoreOutsiderEscape: 3,        // Outsider survives undetected
        scoreOutsiderGuess: 2,         // Outsider caught but names the word ("all for nought")
        scoreWrongConviction: 3,       // the table accuses an innocent
        scoreInsiderCatch: 1,          // each In-the-Loop player when the Outsider is caught
        dealerRotation: 'clockwise'
      };
    },

    meta: {
      title: 'Out of the Loop',
      tagline: 'Everyone knows the secret word - except one of you. Answer the questions, blend in, and find the one who hasn’t got a clue.',
      // Difficulty presets (number of questions + whether the Outsider gets the category).
      variants: [
        { id: 'standard', name: 'Standard', blurb: 'The Outsider knows the category. Four questions, then vote.',
          patch: { giveOutsiderHint: true, questionsPerRound: 4 } },
        { id: 'hard', name: 'Hard (for the table)', blurb: 'Only two questions before the vote - less to go on.',
          patch: { giveOutsiderHint: true, questionsPerRound: 2 } },
        { id: 'blind', name: 'Blind Outsider', blurb: 'The Outsider is NOT told the category - brutal, but hilarious.',
          patch: { giveOutsiderHint: false, questionsPerRound: 5 } }
      ],
      defaultVariant: 'standard',
      optionLabels: {
        outsiderCount: 'Number of Outsiders',
        giveOutsiderHint: 'Tell the Outsider the category',
        questionsPerRound: 'Questions before voting',
        outsiderGuesses: 'Guesses if the Outsider is caught'
      },
      hiddenOptions: ['interaction', 'cluesPerPlayer', 'recordClues', 'contentModel', 'allowOutsiderEarlyGuess', 'accusationMode', 'scoreOutsiderSolved', 'scoreAccuserBonus', 'guessMode', 'timerSeconds'],
      help: [
        'Pass the phone around - each player privately sees the secret word, except the Outsider who sees only the category.',
        'The app asks a question. Going around the circle, everyone answers out loud - honestly enough to prove you know the word, vaguely enough not to give it away.',
        'After the questions, discuss and vote for the Outsider. Catch them and they get one guess at the word to steal the round.'
      ]
    }
  };
});
