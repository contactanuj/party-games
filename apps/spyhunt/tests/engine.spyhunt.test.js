/*
 * engine.spyhunt.test.js — drives the REAL Spy Hunt game + locations through the shared engine.
 * Covers: location/role assignment, the no-leak boundary (location never public), the 'play'
 * interaction with mid-round unanimous accusation, the Spy's voluntary stop-and-guess, the
 * "caught Spy gets NO extra guess" rule, and the classic 1/2/2/4/4 + accuser-bonus scoring.
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
ok(LIB.length >= 3, 'multiple themed location packs (' + LIB.length + ')');
ok(LIB.every(function (p) { return p.type === 'locations'; }), 'all packs are location packs');
ok(LIB.every(function (p) { return p.items.length >= 6; }), 'each pack has enough locations for a meaningful guess');
ok(LIB.every(function (p) { return p.items.every(function (it) { return it.roles && it.roles.length === 7; }); }), 'every location has 7 roles');

section('defaults validate; agents share location + role, spy gets neither');
[3, 4, 5, 6, 7, 8].forEach(function (pc) { ok(E.validateConfig(E.defaultConfig(pc), LIB).ok, pc + 'p default validates'); });
(function () {
  var s = E.newGame(E.defaultConfig(6), LIB, 7);
  var roles = {};
  s.players.forEach(function (p) {
    var r = E.revealFor(s, p.seat);
    if (r.isOutsider) ok(r.location === null && r.roleAtLocation === null, 'spy gets no location/role');
    else { ok(r.location === E.secretDisplay(s), 'agents share the location'); ok(!!r.roleAtLocation, 'agent has a role'); roles[r.roleAtLocation] = 1; }
  });
})();

section('no leak: the location never appears in publicState (play phase)');
(function () {
  var s = E.newGame(E.defaultConfig(7), LIB, 21);
  E.beginInteraction(s);
  ok(s.phase === 'play', 'interaction is the play phase');
  var pub = JSON.stringify(E.publicState(s));
  ok(pub.indexOf(E.secretDisplay(s)) === -1, 'location never in publicState');
  ok(!/roleAtLocation|seatSecret|isOutsider/.test(pub), 'no role fields in publicState');
})();

section('mid-round unanimous accusation: catch spy => agents win (NO extra guess)');
(function () {
  var s = E.newGame(E.defaultConfig(6), LIB, 200);
  E.beginInteraction(s);
  var spy = s.outsiderSeats[0], accuser = (spy + 1) % 6;
  E.callAccusation(s, accuser, spy, true);
  ok(s.outcome === E.OUTCOMES.caught_failed, 'caught spy => caught_failed immediately (no guess phase)');
  ok(s.roundScores[accuser] === s.config.scoreInsiderCatch + s.config.scoreAccuserBonus, 'accuser got catch + bonus (+2)');
  var others = s.players.filter(function (p) { return !E.isOutsider(s, p.seat) && p.seat !== accuser; });
  ok(others.every(function (p) { return s.roundScores[p.seat] === s.config.scoreInsiderCatch; }), 'other agents got +1');
  ok(s.roundScores[spy] === 0, 'spy scored 0');
})();

section('wrong accusation: an agent convicted => spy wins +4');
(function () {
  var s = E.newGame(E.defaultConfig(6), LIB, 201);
  E.beginInteraction(s);
  var spy = s.outsiderSeats[0], innocent = (spy + 1) % 6, accuser = (spy + 2) % 6;
  E.callAccusation(s, accuser, innocent, true);
  ok(s.outcome === E.OUTCOMES.wrong_conviction, 'accusing an agent => wrong_conviction');
  ok(s.roundScores[spy] === s.config.scoreWrongConviction, 'spy scored +4');
})();

section('spy stops the clock and names the location => +4');
(function () {
  var s = E.newGame(E.defaultConfig(6), LIB, 202);
  E.beginInteraction(s);
  var spy = s.outsiderSeats[0];
  E.outsiderReveal(s, spy);
  ok(s.phase === 'guess', 'spy self-reveal opens the location guess');
  E.outsiderGuess(s, s.secret.index); // correct location index
  ok(s.outcome === E.OUTCOMES.outsider_solved, 'correct location => outsider_solved');
  ok(s.roundScores[spy] === s.config.scoreOutsiderSolved, 'spy scored +4');
})();

section('timeout vote: spy survives uncaught => +2');
(function () {
  var s = E.newGame(E.defaultConfig(5), LIB, 203); s.config.tieBreaker = 'outsider_escapes';
  E.beginInteraction(s);
  E.beginVote(s);
  // a perfect 1-1-1-1-1 ring spread -> no majority -> escape
  s.players.forEach(function (p) { E.castVote(s, p.seat, (p.seat + 1) % 5); });
  E.resolveVotes(s);
  ok(s.outcome === E.OUTCOMES.escaped_undetected, 'no consensus at timeout => spy escapes');
  ok(s.roundScores[s.outsiderSeats[0]] === s.config.scoreOutsiderEscape, 'spy scored +2');
})();

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
