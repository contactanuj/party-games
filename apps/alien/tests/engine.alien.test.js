/*
 * engine.alien.test.js — the Alien team + app-driven variants + solo win roles on the shared
 * engine: alien-team win, alienized conversion, Synthetic catastrophe, Blob cluster, Mortician,
 * Groob/Zerb frenemies, Exposer center-reveal, per-game variants — plus fuzz, determinism,
 * and the no-leak boundary. Run: node tests/engine.alien.test.js
 */
'use strict';
var path = require('path');
function reqCore() { try { return require('@partydeck/core/engine/core-engine'); } catch (e) { return require('../../../packages/core/src/engine/core-engine.js'); } }
var GameCore = reqCore();
var ALIEN = require('../src/roles.js');
var E = GameCore.createEngine(ALIEN);

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } }
function section(n) { console.log('\n# ' + n); }
var currentPlayerCount = 0;
function names(n) { var a = []; for (var i = 0; i < n; i++) a.push('P' + (i + 1)); return a; }

function setSeatRoles(state, arr) {
  arr.forEach(function (rid, s) { var c = state.positions['p' + s].cardId; state.cards[c].role = rid; state.cards[c].copiedRole = null; state.players[s].dealtRole = rid; state.players[s].copiedRole = null; });
  E.rebuildSchedule(state);
}
function game(seatRoles, center) {
  var pc = seatRoles.length;
  var cfg = E.defaultConfig(pc); cfg.roleSet = seatRoles.concat(center || ['villager', 'villager', 'villager']); cfg.playerNames = names(pc);
  var s = E.newGame(cfg, 1);
  setSeatRoles(s, seatRoles);
  (center || ['villager', 'villager', 'villager']).forEach(function (rid, i) { s.cards[s.positions['c' + i].cardId].role = rid; });
  for (var i = 0; i < pc; i++) s.variants[i] = 0; // deterministic variant for forced roles
  currentPlayerCount = pc;
  return s;
}
function chooseDet(step) {
  var inputs = {};
  step.inputs.forEach(function (spec) {
    if (spec.visibleWhen) { var k = Object.keys(spec.visibleWhen)[0]; if (inputs[k] !== spec.visibleWhen[k]) return; }
    if (spec.type === 'choice') inputs[spec.id] = spec.options[0].value;
    else if (spec.type === 'pickPlayer') { for (var s = 0; s < currentPlayerCount; s++) { if (s === step.seat && !spec.allowSelf) continue; if (spec.exclude && spec.exclude.indexOf(s) !== -1) continue; inputs[spec.id] = s; break; } }
    else if (spec.type === 'pickCenter') { var a = []; for (var i = 0; i < (spec.count || 1); i++) a.push(i); inputs[spec.id] = a; }
  });
  return inputs;
}
function runStepFor(state, roleId, inputs) {
  E.beginNight(state); var g = 0;
  while (E.currentStep(state) && g++ < 80) { var st = E.getStep(state); if (st.roleId === roleId) { E.submitStep(state, inputs); return true; } E.submitStep(state, chooseDet(st)); }
  return false;
}
function killSeat(s, seat) { var pc = s.players.length, t = []; for (var i = 0; i < pc; i++) t[i] = 0; t[seat] = 2; s.phase = 'vote'; E.resolveVotes(s, t); }
function W(s) { return s.result.winners.slice().sort().join(','); }

// ---------------------------------------------------------------------------
section('config & presets');
[3, 4, 5, 6, 7, 8, 9, 10].forEach(function (pc) {
  var cfg = E.defaultConfig(pc), v = E.validateConfig(cfg);
  ok(v.ok, pc + 'p preset validates (' + JSON.stringify(v.errors) + ')');
  ok(cfg.roleSet.length === pc + 3, pc + 'p preset has players+3 cards');
});

// ---------------------------------------------------------------------------
section('alien team win conditions');
ok(W(killAndReturn(['alien', 'seer', 'villager', 'robber', 'villager'], 0)) === 'village', 'killing an Alien => village wins');
ok(W(killAndReturn(['alien', 'seer', 'villager', 'robber', 'villager'], 1)).indexOf('alien') !== -1, 'no alien dies (one in play) => aliens win');
function killAndReturn(roles, seat) { var s = game(roles); killSeat(s, seat); return s; }
(function () {
  var s = game(['villager', 'seer', 'villager', 'robber', 'villager']); s.tokens.push({ id: 't', type: 'alienized', onPosition: 'p2' });
  ok(E.finalTeamOf(s, 2) === 'alien', 'an alienized player is on the alien team');
  killSeat(s, 2); ok(W(s) === 'village', 'killing an alienized player => village wins');
})();

// ---------------------------------------------------------------------------
section('Synthetic catastrophe');
(function () {
  var s = game(['synthetic', 'alien', 'villager', 'seer', 'villager']);
  killSeat(s, 0);
  ok(W(s) === 'synth', 'Synthetic dying => only the Synthetic wins (alien & village both lose)');
})();
(function () {
  // a surviving Synthetic is the ONLY alien-flagged player => the alien TEAM must not "win"
  var s = game(['synthetic', 'villager', 'seer', 'robber', 'villager']);
  killSeat(s, 1);
  ok(W(s).indexOf('alien') === -1, 'a lone surviving Synthetic does not hand the alien team a phantom win');
})();

// ---------------------------------------------------------------------------
section('Blob cluster & Mortician');
(function () {
  var s = game(['villager', 'villager', 'blob', 'villager', 'villager']);
  killSeat(s, 0); // neighbors of blob(2) are 1 and 3; seat0 is outside the cluster
  ok(W(s).indexOf('blob') !== -1, 'Blob wins when its cluster survives');
})();
(function () {
  var s = game(['villager', 'villager', 'blob', 'villager', 'villager']);
  killSeat(s, 1); // a blob neighbor dies
  ok(W(s).indexOf('blob') === -1, 'Blob loses when a cluster member is eliminated');
})();
(function () {
  var s = game(['villager', 'villager', 'mortician', 'villager', 'villager']);
  killSeat(s, 1); // a mortician neighbor
  ok(W(s).indexOf('mortician') !== -1, 'Mortician wins when a neighbor is eliminated');
})();

// ---------------------------------------------------------------------------
section('Groob & Zerb frenemies');
(function () {
  var s = game(['groob', 'zerb', 'villager', 'seer', 'villager']);
  killSeat(s, 1); // Zerb dies, Groob lives
  ok(W(s).indexOf('groob') !== -1, 'Groob wins when Zerb dies and Groob survives');
  ok(W(s).indexOf('village') !== -1, 'killing a frenemy also satisfies the village (an alien died)');
})();

// ---------------------------------------------------------------------------
section('Exposer center reveal + variants');
(function () {
  var s = game(['exposer', 'seer', 'villager', 'robber', 'villager'], ['oracle', 'alien', 'villager']);
  runStepFor(s, 'exposer', { mode: 'yes', centers: [0] });
  ok(E.publicView(s).revealedCenter.length === 1, 'Exposer turns a center card face-up for all');
})();
(function () {
  var cfg = E.defaultConfig(7); var s = E.newGame(cfg, 555);
  var hasVariant = s.players.some(function (p) { return s.variants[p.seat] != null; });
  ok(hasVariant, 'app-driven roles get a per-game action variant at deal time');
})();

// ---------------------------------------------------------------------------
section('no-leak boundary');
(function () {
  var s = game(['alien', 'synthetic', 'seer', 'cow', 'villager']);
  var blob = JSON.stringify(E.publicView(s).players);
  ok(!/role|team|alien|synth|seer/i.test(blob), 'public players list carries no role/team');
})();

// ---------------------------------------------------------------------------
section('fuzz + determinism (incl. bots & variants)');
(function () {
  var threw = 0, games = 0;
  [3, 5, 7, 9, 10].forEach(function (pc) {
    for (var g = 0; g < 20; g++) {
      try {
        var cfg = E.defaultConfig(pc); cfg.botCount = (g % 3); currentPlayerCount = pc;
        var s = E.newGame(cfg, pc * 100 + g);
        var cardsBefore = Object.keys(s.cards).length;
        E.beginNight(s); var guard = 0;
        while (E.currentStep(s) && guard++ < 400) { E.autoResolveBotNight(s); var st = E.currentStep(s); if (!st) break; if (E.isBot(s, st.seat)) continue; E.submitStep(s, chooseDet(E.getStep(s))); }
        E.autoResolveBotNight(s);
        E.beginVote(s); E.autoCastBotVotes(s);
        s.players.forEach(function (p) { if (!p.bot && s.votes[p.seat] == null) E.castVote(s, p.seat, (p.seat + 1) % pc); });
        E.resolveVotes(s);
        ok(s.phase === 'end', pc + 'p#' + g + ' resolved');
        ok(Object.keys(s.cards).length === cardsBefore, pc + 'p#' + g + ' card count conserved');
        games++;
      } catch (e) { threw++; console.error('  THREW ' + pc + 'p#' + g + ': ' + e.message); }
    }
  });
  ok(threw === 0, 'no Alien fuzz game threw (' + games + ' games)');
  function run() { var s = E.newGame(E.defaultConfig(8), 4321); currentPlayerCount = 8; E.beginNight(s); var g = 0; while (E.currentStep(s) && g++ < 300) E.submitStep(s, chooseDet(E.getStep(s))); E.beginVote(s); for (var i = 0; i < 8; i++) E.castVote(s, i, (i + 1) % 8); E.resolveVotes(s); return E.serialize(s); }
  ok(run() === run(), 'Alien is deterministic for a fixed seed + inputs');
})();

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
