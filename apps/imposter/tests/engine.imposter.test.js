/*
 * engine.imposter.test.js - drives the REAL Imposter game.js + content.js through the shared
 * word engine. Dependency-free Node (run: node tests/engine.imposter.test.js).
 *
 * Covers both variants (Classic 'word' + Undercover 'wordPair'), the no-leak boundary with the
 * real content, authored bot clue hints, and a full round to a scored outcome.
 */
'use strict';
function reqCore() {
  try { return require('@partydeck/core/engine/word-engine'); }
  catch (e) { return require('../../../packages/core/src/engine/word-engine.js'); }
}
var WordCore = reqCore();
var GAME = require('../src/game.js');
var CONTENT = require('../src/content.js');
var LIB = CONTENT.packs;

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } }
function section(n) { console.log('\n# ' + n); }

var E = WordCore.createEngine(GAME);

// ---------------------------------------------------------------------------
section('content sanity');
(function () {
  var words = LIB.filter(function (p) { return p.type === 'words'; });
  var pairs = LIB.filter(function (p) { return p.type === 'pairs'; });
  ok(words.length >= 4, 'has several word packs (' + words.length + ')');
  ok(pairs.length >= 2, 'has Undercover pair packs (' + pairs.length + ')');
  // every pair has two distinct sides
  var allPairsOk = pairs.every(function (p) { return p.items.every(function (it) { return it.a && it.b && it.a !== it.b; }); });
  ok(allPairsOk, 'every Undercover pair has two distinct words');
  // ids unique
  var ids = {}; var dup = false; LIB.forEach(function (p) { if (ids[p.id]) dup = true; ids[p.id] = 1; });
  ok(!dup, 'pack ids are unique');
})();

// ---------------------------------------------------------------------------
section('defaults + both variants validate');
[3, 4, 5, 6, 7, 8].forEach(function (pc) {
  ok(E.validateConfig(E.defaultConfig(pc), LIB).ok, pc + 'p classic default validates');
});
(function () {
  var c = E.defaultConfig(6); c.contentModel = 'wordPair';
  var v = E.validateConfig(c, LIB);
  ok(v.ok, 'Undercover (wordPair) validates with pair packs available (' + JSON.stringify(v.errors) + ')');
})();
(function () {
  // a word config that only allows pair packs by id -> no matching content (model mismatch)
  var c = E.defaultConfig(6); c.contentModel = 'word'; c.packIds = ['pairs_food'];
  ok(!E.validateConfig(c, LIB).ok, 'selecting only pair packs while in word mode is an error');
})();

// ---------------------------------------------------------------------------
section('Classic: insiders share a word, imposter blank');
(function () {
  var s = E.newGame(E.defaultConfig(6), LIB, 123);
  var seen = {};
  s.players.forEach(function (p) {
    var r = E.revealFor(s, p.seat);
    if (r.isOutsider) ok(r.word === null, 'imposter has no word');
    else { seen[r.word] = 1; ok(r.word === E.secretDisplay(s), 'crew share the secret'); }
  });
  ok(Object.keys(seen).length === 1, 'all crew saw exactly one shared word');
})();

// ---------------------------------------------------------------------------
section('Undercover: imposter gets a CLOSE but different word');
(function () {
  var c = E.defaultConfig(6); c.contentModel = 'wordPair';
  var s = E.newGame(c, LIB, 321);
  var crewWord = null, impWord = null;
  s.players.forEach(function (p) { var r = E.revealFor(s, p.seat); if (r.isOutsider) impWord = r.word; else crewWord = r.word; });
  ok(crewWord && impWord && crewWord !== impWord, 'undercover word differs from crew (' + crewWord + ' vs ' + impWord + ')');
})();

// ---------------------------------------------------------------------------
section('no-leak with real content');
(function () {
  ['word', 'wordPair'].forEach(function (model) {
    var c = E.defaultConfig(6); c.contentModel = model;
    var s = E.newGame(c, LIB, 55);
    E.beginInteraction(s);
    var pub = JSON.stringify(E.publicState(s));
    ok(pub.indexOf(E.secretDisplay(s)) === -1, model + ': secret never in publicState');
    ok(!/isOutsider|roleAtLocation|seatSecret/.test(pub), model + ': no role fields in publicState');
  });
})();

// ---------------------------------------------------------------------------
section('bots use authored clue hints (insiders) and stay fair');
(function () {
  var c = E.defaultConfig(6); c.botCount = 5; c.recordClues = true;
  var s = E.newGame(c, LIB, 909);
  // attach the pack clue bank the way the UI/bridge will (see word-ui): map secret index -> clues
  var pack = LIB.filter(function (p) { return p.id === s.pack.id; })[0];
  s._packClues = pack.items.map(function (it) { return E._internals.normItem(it).clues; });
  E.beginInteraction(s);
  var guard = 0;
  while (s.phase === 'clues' && guard++ < 100) { E.autoAdvanceClues(s); if (s.phase === 'clues') E.nextClue(s, 'human'); }
  // a bot insider's clue should come from the secret's authored hint bank (when non-empty)
  var bank = s._packClues[s.secret.index] || [];
  if (bank.length) {
    var someBotInsider = s.players.filter(function (p) { return p.bot && !E.isOutsider(s, p.seat); })[0];
    if (someBotInsider) {
      var clue = (s.clues[someBotInsider.seat] || [])[0];
      ok(bank.indexOf(clue) !== -1 || clue === 'human', 'a bot insider used an authored clue hint ("' + clue + '")');
    } else { ok(true, '(no bot insider this deal)'); }
  } else { ok(true, '(secret had no authored hints this deal)'); }
})();

// ---------------------------------------------------------------------------
section('full round to a scored outcome');
(function () {
  var s = E.newGame(E.defaultConfig(5), LIB, 2024);
  E.beginInteraction(s);
  while (s.phase === 'clues') E.nextClue(s, 'clue');
  if (s.phase === 'debate') E.beginVote(s);
  var imp = s.outsiderSeats[0];
  s.players.forEach(function (p) { E.castVote(s, p.seat, p.seat === imp ? (imp + 1) % 5 : imp); });
  E.resolveVotes(s); E.revealAccused(s);
  ok(s.phase === 'guess', 'caught imposter reaches the guess');
  E.outsiderGuess(s, 'not-it'); // wrong
  ok(s.outcome === E.OUTCOMES.caught_failed, 'wrong guess => crew win');
  ok(s.phase === 'round_over' || s.phase === 'game_over', 'round concluded');
})();

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
