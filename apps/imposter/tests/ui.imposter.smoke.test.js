/*
 * ui.imposter.smoke.test.js — loads the REAL word-ui.js + Imposter game in a node DOM stub and
 * drives a full pass-and-play round by clicking. Asserts the SECRECY INVARIANTS:
 *   - the secret word NEVER appears on a shared screen (lobby/clues/debate/vote pass/vote pick);
 *   - it appears only on the gated reveal/recheck card, for the one player who confirmed;
 *   - the recheck flow is a gated single-player handoff (the picker lists names only);
 *   - a full round (reveal -> clues -> debate -> vote -> tally -> guess -> round_over) never throws.
 */
'use strict';
var path = require('path');
function reqCoreFile(rel) { try { return require('@partydeck/core/' + rel); } catch (e) { return require(path.resolve(__dirname, '../../../packages/core/' + rel)); } }
var DOM = reqCoreFile('tests/helpers/dom-node-stub.js');

var app = DOM.install();
global.__WORD_TEST = true; window.__WORD_TEST = true;
// loading these UMD modules also assigns window.WordCore / WORD_GAME / WORD_CONTENT (root === global)
reqCoreFile('src/engine/word-engine.js');
require('../src/game.js');
require('../src/content.js');
reqCoreFile('src/ui/word-ui.js'); // runs the IIFE -> renders the lobby

var H = window.__WORD_UI;
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } }
function section(n) { console.log('\n# ' + n); }
function st() { return H.state(); }
function secret() { return H.engine.secretDisplay(st()); }
function text() { return DOM.allText(app); }
function hasWord(hay, word) { var re = new RegExp('(^|[^a-zA-Z])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-zA-Z]|$)', 'i'); return re.test(hay); }
function assertNoLeak(where) { ok(!hasWord(text(), secret()), 'no leak on ' + where + ' (secret "' + secret() + '")'); }

// ---------------------------------------------------------------------------
section('lobby renders + start');
ok(DOM.buttonByText(app, 'Start game') != null, 'lobby shows Start game');
ok(text().indexOf('Imposter') !== -1, 'lobby shows the title');
DOM.clickText(app, 'Start game');
ok(st() && st().phase === 'reveal', 'game starts in the reveal phase');

// ---------------------------------------------------------------------------
section('reveal handoff is gated + leak-free + timer-based');
var guard = 0, countdownChecked = false;
while (st().phase === 'reveal' && guard++ < 60) {
  var ui = H.ui;
  if (!ui.reveal.shown) {
    assertNoLeak('reveal PASS screen');                 // before confirming, no secret
    DOM.clickText(app, "show me");
  } else {
    var seat = ui.reveal.order[ui.reveal.idx];
    if (!H.engine.isOutsider(st(), seat)) ok(hasWord(text(), secret()), 'insider secret IS shown on their gated card');
    else ok(text().toLowerCase().indexOf('imposter') !== -1, 'imposter is told they are the Imposter on their card');
    if (!countdownChecked) { ok(DOM.qsa(app, '.reveal-countdown').length >= 1, 'secret card shows an auto-hide countdown (timer-based reveal)'); countdownChecked = true; }
    DOM.clickText(app, 'Hide');
  }
}
ok(st().phase === 'clues', 'after all reveals, the clue phase begins');

// ---------------------------------------------------------------------------
section('recheck is a gated single-player handoff (names-only picker)');
(function () {
  DOM.clickText(app, 'Re-check my word');
  assertNoLeak('recheck picker');                       // the name picker must not show any secret
  ok(DOM.choices(app).length >= 2, 'recheck picker lists players to choose from');
  DOM.choices(app)[0].click();                          // pick a name
  assertNoLeak('recheck confirm gate');                 // confirm gate shows a name only
  DOM.clickText(app, 'Show my word');
  // now the chosen seat's secret/role is allowed to show
  var seat = H.ui.recheck.seat;
  if (!H.engine.isOutsider(st(), seat)) ok(hasWord(text(), secret()), 'recheck shows that seat\'s secret');
  else ok(text().toLowerCase().indexOf('imposter') !== -1, 'recheck shows the imposter their role');
  DOM.clickText(app, 'Hide');
  ok(st().phase === 'clues', 'recheck returns to the clue phase');
})();

// ---------------------------------------------------------------------------
section('clues phase is leak-free');
guard = 0;
while (st().phase === 'clues' && guard++ < 80) {
  assertNoLeak('clue turn screen');
  var inps = DOM.inputs(app);
  if (inps.length) { inps[0].value = 'someclue'; if (inps[0].oninput) inps[0].oninput(); }
  DOM.clickText(app, 'Submit clue');
}
ok(st().phase === 'debate' || st().phase === 'vote', 'clues complete -> debate/vote');

// ---------------------------------------------------------------------------
section('debate + vote are leak-free');
if (st().phase === 'debate') { assertNoLeak('debate screen'); DOM.clickText(app, 'Go to vote'); }
ok(st().phase === 'vote', 'reached the vote');
guard = 0;
while (st().phase === 'vote' && guard++ < 120) {
  if (!H.ui.vote.shown) { assertNoLeak('vote PASS screen'); DOM.clickText(app, "I'm "); }
  else {
    assertNoLeak('vote pick screen');
    var ch = DOM.choices(app); ok(ch.length >= 1, 'vote grid lists suspects'); ch[0].click(); // pick someone
    DOM.clickText(app, 'Lock in vote');
  }
}
ok(st().phase === 'tally' || st().phase === 'round_over' || st().phase === 'guess', 'vote resolved');

// ---------------------------------------------------------------------------
section('tally -> guess -> round over (full reveal allowed)');
if (st().phase === 'tally') DOM.clickText(app, 'Reveal');
if (st().phase === 'guess') {
  var gi = DOM.inputs(app);
  if (gi.length) { gi[0].value = 'definitely-not-the-word'; if (gi[0].oninput) gi[0].oninput(); DOM.clickText(app, 'Guess'); }
}
ok(st().phase === 'round_over' || st().phase === 'game_over', 'round concluded without throwing (' + st().phase + ')');
ok(hasWord(text(), secret()), 'the round-over screen DOES reveal the secret (now allowed)');

// ---------------------------------------------------------------------------
section('Undercover variant: every reveal card is identical shape (no role leak)');
(function () {
  // back to the lobby, switch to Undercover, start a fresh game
  var back = DOM.buttonByText(app, 'End match') || DOM.buttonByText(app, 'menu');
  ok(back != null, 'can return to the lobby'); back.click();
  var chip = DOM.choices(app).filter(function (c) { return c.textContent.indexOf('Undercover') !== -1; })[0];
  ok(chip != null, 'Undercover mode is offered'); chip.click();
  DOM.clickText(app, 'Start game');
  ok(st().phase === 'reveal' && st().config.contentModel === 'wordPair', 'Undercover round started (wordPair)');
  var guard2 = 0, cardsChecked = 0;
  while (st().phase === 'reveal' && guard2++ < 60) {
    if (!H.ui.reveal.shown) DOM.clickText(app, 'show me');
    else {
      var t = text().toLowerCase();
      // In Undercover NOBODY is told their role: the card must NOT say "you are the ..." for ANY seat
      ok(t.indexOf('you are the') === -1, 'Undercover card never reveals the role');
      ok(t.indexOf('secret word') !== -1, 'Undercover card shows a word, identically for everyone');
      cardsChecked++;
      DOM.clickText(app, 'Hide');
    }
  }
  ok(cardsChecked >= 3, 'checked every seat\'s Undercover card (' + cardsChecked + ')');
})();

// ---------------------------------------------------------------------------
section('advanced settings block proceeding when the config is invalid');
(function () {
  H.ui.screen = 'settings';
  H.ui.config.packIds = ['__no_such_pack__']; // selecting no real content -> invalid
  H.render();
  var done = DOM.buttonByText(app, 'Done');
  ok(done && done.disabled === true, 'Done is DISABLED while the config is invalid (not just a bottom error)');
  H.ui.config.packIds = null; H.render(); // valid again
  var done2 = DOM.buttonByText(app, 'Done');
  ok(done2 && !done2.disabled, 'Done is ENABLED once the config is valid');
  H.ui.screen = 'lobby'; H.render();
})();

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
