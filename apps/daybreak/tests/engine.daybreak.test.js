/*
 * engine.daybreak.test.js - Daybreak's new mechanics on the shared engine:
 * shield token, Alpha Wolf's reserved center-werewolf, P.I. transform, Witch center-swap,
 * Artifact end-game overrides, Bodyguard vote protection, Revealer face-up - plus fuzz,
 * determinism, and the no-leak boundary. Run: node tests/engine.daybreak.test.js
 */
'use strict';
var path = require('path');
function reqCore() { try { return require('@partydeck/core/engine/core-engine'); } catch (e) { return require('../../../packages/core/src/engine/core-engine.js'); } }
var GameCore = reqCore();
var DAYBREAK = require('../src/roles.js');
var E = GameCore.createEngine(DAYBREAK);

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } }
function section(n) { console.log('\n# ' + n); }
var currentPlayerCount = 0;
function names(n) { var a = []; for (var i = 0; i < n; i++) a.push('P' + (i + 1)); return a; }

function setSeatRoles(state, arr) {
  arr.forEach(function (rid, s) {
    var cardId = state.positions['p' + s].cardId;
    state.cards[cardId].role = rid; state.cards[cardId].copiedRole = null;
    state.players[s].dealtRole = rid; state.players[s].copiedRole = null;
  });
  E.rebuildSchedule(state);
}
// Build a game with a known seat arrangement; roleSet = seatRoles + 3 center fillers.
function game(seatRoles, center) {
  var pc = seatRoles.length;
  var roleSet = seatRoles.concat(center || ['villager', 'villager', 'villager']);
  var cfg = E.defaultConfig(pc); cfg.roleSet = roleSet; cfg.playerNames = names(pc);
  var s = E.newGame(cfg, 1);
  setSeatRoles(s, seatRoles);
  // force the center cards too (the shuffle scattered them)
  (center || ['villager', 'villager', 'villager']).forEach(function (rid, i) {
    var cid = s.positions['c' + i].cardId; s.cards[cid].role = rid; s.cards[cid].copiedRole = null;
  });
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
  E.beginNight(state); var guard = 0;
  while (E.currentStep(state) && guard++ < 60) {
    var st = E.getStep(state);
    if (st.roleId === roleId) { E.submitStep(state, inputs); return true; }
    E.submitStep(state, chooseDet(st));
  }
  return false;
}
function playNight(state, chooser) { E.beginNight(state); var g = 0; while (E.currentStep(state) && g++ < 400) E.submitStep(state, chooser(E.getStep(state))); }

// ---------------------------------------------------------------------------
section('config & presets');
[3, 4, 5, 6, 7, 8, 9, 10].forEach(function (pc) {
  var cfg = E.defaultConfig(pc); var v = E.validateConfig(cfg);
  ok(v.ok, pc + 'p preset validates (' + JSON.stringify(v.errors) + ')');
  ok(cfg.roleSet.length === pc + 3, pc + 'p preset has players+3 cards');
});

// ---------------------------------------------------------------------------
section('Alpha Wolf reserved center-werewolf');
(function () {
  var s = game(['alpha_wolf', 'villager', 'seer', 'robber', 'villager']);
  var reserved = Object.keys(s.positions).filter(function (k) { return s.positions[k].kind === 'reserved'; });
  ok(reserved.length === 1, 'an extra reserved center card is created when Alpha Wolf is in play');
  ok(s.cards[s.positions[reserved[0]].cardId].role === 'werewolf', 'the reserved card is a Werewolf');
  runStepFor(s, 'alpha_wolf', { target: 1 });
  ok(E.finalRoleId(s, 1) === 'werewolf', 'Alpha Wolf turns the target into a Werewolf');
  ok(E.finalTeamOf(s, 1) === 'werewolf', 'that target is now on the werewolf team');
})();

// ---------------------------------------------------------------------------
section('Sentinel shield blocks viewing/moving');
(function () {
  var s = game(['robber', 'seer', 'villager', 'villager', 'villager']);
  s.tokens.push({ id: 'tok_0', type: 'shield', onPosition: 'p1' }); // shield seat 1
  runStepFor(s, 'robber', { target: 1 });
  ok(E.finalRoleId(s, 0) === 'robber' && E.finalRoleId(s, 1) === 'seer', 'a shielded card cannot be robbed');
})();

// ---------------------------------------------------------------------------
section('Paranormal Investigator joins what it sees');
(function () {
  var s = game(['paranormal_investigator', 'werewolf', 'villager', 'seer', 'villager']);
  runStepFor(s, 'paranormal_investigator', { first: 1, second: null }); // sees the Werewolf
  ok(E.finalRoleId(s, 0) === 'werewolf', 'P.I. that sees a Werewolf becomes a Werewolf');
  ok(E.finalTeamOf(s, 0) === 'werewolf', 'P.I. joins the werewolf team');
})();
(function () {
  var s = game(['paranormal_investigator', 'tanner', 'villager', 'seer', 'villager']);
  runStepFor(s, 'paranormal_investigator', { first: 1, second: null });
  ok(E.finalRoleId(s, 0) === 'tanner', 'P.I. that sees the Tanner becomes the Tanner');
})();

// ---------------------------------------------------------------------------
section('Witch center-swap onto self changes team');
(function () {
  var s = game(['witch', 'villager', 'seer', 'robber', 'villager'], ['werewolf', 'villager', 'villager']);
  // center index 0 is the werewolf; witch looks at it and swaps onto herself
  runStepFor(s, 'witch', { mode: 'look', center: [0], target: 0 });
  ok(E.finalRoleId(s, 0) === 'werewolf', 'Witch who pulls a Werewolf onto herself becomes a Werewolf');
})();

// ---------------------------------------------------------------------------
section('Artifact tokens override end-game identity');
function withArtifact(art, seat) {
  var s = game(['villager', 'werewolf', 'seer', 'robber', 'villager']);
  s.tokens.push({ id: 'a', type: 'artifact:' + art, onPosition: 'p' + seat });
  return s;
}
ok(E.finalTeamOf(withArtifact('claw', 0), 0) === 'werewolf', 'Claw of the Werewolf => werewolf team');
ok(E.isFinalWerewolf(withArtifact('claw', 0), 0) === true, 'Claw makes you count as a Werewolf');
ok(E.finalRoleId(withArtifact('cudgel', 0), 0) === 'tanner', 'Cudgel of the Tanner => Tanner');
ok(E.finalTeamOf(withArtifact('brand', 0), 0) === 'village', 'Brand of the Villager => village');
(function () {
  // claw on a Hunter removes the Hunter's power (finalRoleId is no longer hunter)
  var s = withArtifact('claw', 0); s.cards[s.positions.p0.cardId].role = 'hunter'; s.players[0].dealtRole = 'hunter';
  ok(E.finalRoleId(s, 0) === 'werewolf', 'a role-changing Artifact overrides the underlying card');
})();

// ---------------------------------------------------------------------------
section('Bodyguard protects at the vote');
(function () {
  var s = game(['bodyguard', 'werewolf', 'villager', 'seer', 'villager']);
  s.phase = 'vote';
  // everyone points at seat1 (the werewolf) EXCEPT bodyguard points at seat1 too (protects it)
  s.votes = { 0: 1, 1: 2, 2: 1, 3: 1, 4: 1 }; // seat1 has 4 votes incl. bodyguard's protective point
  E.resolveVotes(s);
  ok(s.deaths.indexOf(1) === -1, 'the Bodyguard\'s protected player is not eliminated');
})();

// ---------------------------------------------------------------------------
section('Revealer face-up (public by design)');
(function () {
  var s = game(['revealer', 'seer', 'werewolf', 'villager', 'villager']);
  runStepFor(s, 'revealer', { target: 1 }); // seer -> left face up
  var pv = E.publicView(s);
  ok(pv.revealedCards.length === 1 && pv.revealedCards[0].seat === 1, 'a non-Werewolf card is turned face-up for all');
})();
(function () {
  var s = game(['revealer', 'seer', 'werewolf', 'villager', 'villager']);
  runStepFor(s, 'revealer', { target: 2 }); // werewolf -> flipped back down, NOT public
  ok(E.publicView(s).revealedCards.length === 0, 'a Werewolf card is flipped back down (never public)');
})();

// ---------------------------------------------------------------------------
section('no-leak boundary');
(function () {
  var s = game(['werewolf', 'seer', 'robber', 'sentinel', 'villager']);
  var blob = JSON.stringify(E.publicView(s).players);
  ok(!/role|team|werewolf|seer|sentinel/i.test(blob), 'public players list carries no role/team');
})();

// ---------------------------------------------------------------------------
section('fuzz + determinism (incl. bots & Alpha Wolf presets)');
(function () {
  var threw = 0, games = 0;
  [3, 5, 7, 9, 10].forEach(function (pc) {
    for (var g = 0; g < 20; g++) {
      try {
        var cfg = E.defaultConfig(pc); cfg.botCount = (g % 3); currentPlayerCount = pc;
        var s = E.newGame(cfg, pc * 100 + g);
        var cardsBefore = Object.keys(s.cards).length;
        E.beginNight(s);
        var guard = 0;
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
  ok(threw === 0, 'no Daybreak fuzz game threw (' + games + ' games)');
  // determinism
  function run() { var s = E.newGame(E.defaultConfig(8), 31337); currentPlayerCount = 8; playNight(s, chooseDet); E.beginVote(s); for (var i = 0; i < 8; i++) E.castVote(s, i, (i + 1) % 8); E.resolveVotes(s); return E.serialize(s); }
  ok(run() === run(), 'Daybreak is deterministic for a fixed seed + inputs');
})();

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
