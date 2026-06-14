/*
 * engine.outoftheloop.test.js - drives the REAL Out of the Loop game + content through the shared
 * engine. Dependency-free Node. Covers the 'questions' interaction, the public-category / hidden-
 * word reveal, the no-leak boundary, and a full scored round.
 */
'use strict';
function reqCore() { try { return require('@partydeck/core/engine/word-engine'); } catch (e) { return require('../../../packages/core/src/engine/word-engine.js'); } }
var WordCore = reqCore();
var GAME = require('../src/game.js');
var CONTENT = require('../src/content.js');
var LIB = CONTENT.packs;

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } }
function section(n) { console.log('\n# ' + n); }
var E = WordCore.createEngine(GAME);

section('content sanity');
ok(LIB.length >= 6, 'has several categories (' + LIB.length + ')');
ok(LIB.every(function (p) { return p.type === 'words'; }), 'all packs are word packs');
ok(LIB.every(function (p) { return Array.isArray(p.questions) && p.questions.length >= 2; }), 'every pack has a question bank');
ok(LIB.every(function (p) { return p.items.length >= 10; }), 'every pack has enough words');

section('defaults validate + the outsider gets the category, not the word');
[3, 4, 5, 6, 7, 8, 9].forEach(function (pc) { ok(E.validateConfig(E.defaultConfig(pc), LIB).ok, pc + 'p default validates'); });
(function () {
  var s = E.newGame(E.defaultConfig(6), LIB, 7);
  s.players.forEach(function (p) {
    var r = E.revealFor(s, p.seat);
    if (r.isOutsider) { ok(r.word === null, 'outsider has no word'); ok(r.hint != null, 'outsider is told the category (' + r.hint + ')'); }
    else ok(r.word === E.secretDisplay(s), 'in-the-loop players share the word');
  });
})();

section('questions interaction advances and ends');
(function () {
  var c = E.defaultConfig(5); c.questionsPerRound = 3;
  var s = E.newGame(c, LIB, 11);
  E.beginInteraction(s);
  ok(s.phase === 'questions', 'interaction is the questions phase');
  ok(E.currentQuestionIndex(s) === 0, 'starts at question 0');
  E.nextQuestion(s); E.nextQuestion(s);
  ok(s.phase === 'questions', 'still asking before the last question');
  E.nextQuestion(s);
  ok(s.phase === 'debate' || s.phase === 'vote', 'after the configured questions -> debate/vote');
})();

section('no leak in publicState');
(function () {
  var s = E.newGame(E.defaultConfig(6), LIB, 5);
  E.beginInteraction(s);
  var pub = JSON.stringify(E.publicState(s));
  ok(pub.indexOf(E.secretDisplay(s)) === -1, 'secret word never in publicState');
  ok(!/isOutsider|seatSecret|roleAtLocation/.test(pub), 'no role fields in publicState');
})();

section('full scored round (individual scoring)');
(function () {
  var s = E.newGame(E.defaultConfig(5), LIB, 99);
  E.beginInteraction(s);
  while (s.phase === 'questions') E.nextQuestion(s);
  if (s.phase === 'debate') E.beginVote(s);
  var out = s.outsiderSeats[0];
  // table correctly accuses the outsider, who then fails the guess
  s.players.forEach(function (p) { E.castVote(s, p.seat, p.seat === out ? (out + 1) % 5 : out); });
  E.resolveVotes(s); E.revealAccused(s);
  ok(s.phase === 'guess', 'caught outsider reaches guess');
  E.outsiderGuess(s, 'nope');
  ok(s.outcome === E.OUTCOMES.caught_failed, 'outsider caught + fails => insiders score');
  var insOk = s.players.every(function (p) { return E.isOutsider(s, p.seat) ? s.roundScores[p.seat] === 0 : s.roundScores[p.seat] === s.config.scoreInsiderCatch; });
  ok(insOk, 'each in-the-loop player scored the catch; outsider scored 0');
})();

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
