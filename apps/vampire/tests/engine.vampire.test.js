/*
 * engine.vampire.test.js - the Marks system + Vampire win conditions on the shared engine:
 * clarity init, vampire-team win, Mark of Fear (skips the night action), Lovers death-link,
 * Assassin solo win, Disease disqualification, Renfield, Master vote-protect - plus fuzz,
 * determinism, and the no-leak boundary. Run: node tests/engine.vampire.test.js
 */
'use strict';
var path = require('path');
function reqCore() { try { return require('@partydeck/core/engine/core-engine'); } catch (e) { return require('../../../packages/core/src/engine/core-engine.js'); } }
var GameCore = reqCore();
var VAMPIRE = require('../src/roles.js');
var E = GameCore.createEngine(VAMPIRE);

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
function game(seatRoles, center) {
  var pc = seatRoles.length;
  var cfg = E.defaultConfig(pc); cfg.roleSet = seatRoles.concat(center || ['villager', 'villager', 'villager']); cfg.playerNames = names(pc);
  var s = E.newGame(cfg, 1);
  setSeatRoles(s, seatRoles);
  (center || ['villager', 'villager', 'villager']).forEach(function (rid, i) { var c = s.positions['c' + i].cardId; s.cards[c].role = rid; });
  currentPlayerCount = pc;
  return s;
}
function setMark(s, seat, type) {
  var id = 'tm_' + seat + '_' + type; s.marks.byId[id] = { id: id, type: type };
  var old = s.marks.bySeat['p' + seat]; if (old) s.marks.pool.push(old);
  s.marks.bySeat['p' + seat] = id;
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
function killByVotes(s, votesMap) { s.phase = 'vote'; s.votes = votesMap; E.resolveVotes(s); }
function killSeat(s, seat) { var pc = s.players.length; var t = []; for (var i = 0; i < pc; i++) t[i] = 0; t[seat] = 2; s.phase = 'vote'; E.resolveVotes(s, t); }
function W(s) { return s.result.winners.slice().sort().join(','); }

// ---------------------------------------------------------------------------
section('config, presets, marks init');
[3, 4, 5, 6, 7, 8, 9, 10].forEach(function (pc) {
  var cfg = E.defaultConfig(pc); var v = E.validateConfig(cfg);
  ok(v.ok, pc + 'p preset validates (' + JSON.stringify(v.errors) + ')');
  ok(cfg.roleSet.length === pc + 3, pc + 'p preset has players+3 cards');
});
(function () {
  var s = game(['vampire', 'vampire', 'seer', 'villager', 'villager']);
  var allClarity = true; for (var i = 0; i < 5; i++) if (!s.marks.bySeat['p' + i]) allClarity = false;
  ok(allClarity, 'every seat starts with a Mark');
})();
(function () {
  // The no-threat warning must recognise Vampire-team antagonists that aren't vampire-flagged.
  function noThreatWarns(roleSet) {
    var cc = E.defaultConfig(5); cc.roleSet = roleSet;
    return E.validateConfig(cc).warnings.some(function (w) { return /is in the card set/.test(w); });
  }
  var fill = ['seer', 'villager', 'villager', 'villager', 'villager', 'villager'];
  ok(!noThreatWarns(['renfield'].concat(fill)), 'Renfield (team vampire, not vampire-flagged) is NOT false-flagged');
  ok(!noThreatWarns(['copycat'].concat(fill)), 'Copycat (computed team) is NOT false-flagged');
  ok(noThreatWarns(['villager'].concat(fill)), 'an all-village vampire deck does warn');
})();

// ---------------------------------------------------------------------------
section('vampire team win conditions');
ok(W((function () { var s = game(['vampire', 'seer', 'villager', 'robber', 'villager']); killSeat(s, 0); return s; })()) === 'village',
  'killing a Vampire => village wins');
ok(W((function () { var s = game(['vampire', 'seer', 'villager', 'robber', 'villager']); killSeat(s, 1); return s; })()).indexOf('vampire') !== -1,
  'no vampire dies (one in play) => vampires win');
(function () {
  var s = game(['villager', 'seer', 'villager', 'robber', 'villager']); setMark(s, 2, 'vampire');
  ok(E.finalTeamOf(s, 2) === 'vampire', 'Mark of the Vampire puts you on the vampire team');
  killSeat(s, 2); ok(W(s) === 'village', 'killing a Mark-of-Vampire holder => village wins');
})();

// ---------------------------------------------------------------------------
section('Mark of Fear skips the night action');
(function () {
  var s = game(['seer', 'villager', 'villager', 'robber', 'villager']);
  setMark(s, 0, 'fear');
  runStepFor(s, 'seer', {}); // feared => skipped, inputs ignored
  ok(s.knowledge[0].some(function (f) { return f.kind === 'feared'; }), 'a feared player is marked as unable to act');
  ok(!s.knowledge[0].some(function (f) { return f.kind === 'sawCard'; }), 'a feared Seer sees nothing');
})();

// ---------------------------------------------------------------------------
section('Lovers die together');
(function () {
  var s = game(['villager', 'villager', 'seer', 'robber', 'villager']);
  setMark(s, 0, 'love'); setMark(s, 1, 'love');
  killSeat(s, 0);
  ok(s.deaths.indexOf(0) !== -1 && s.deaths.indexOf(1) !== -1, 'when one Lover dies, the other dies too');
})();

// ---------------------------------------------------------------------------
section('Assassin solo win');
(function () {
  var s = game(['assassin', 'vampire', 'villager', 'seer', 'villager']);
  setMark(s, 3, 'assassin');
  killSeat(s, 3);
  ok(W(s).indexOf('assassin') !== -1, 'the Assassin wins when the marked player is eliminated');
})();

// ---------------------------------------------------------------------------
section('Disease disqualifies its voters');
(function () {
  var s = game(['villager', 'vampire', 'villager', 'seer', 'villager']);
  setMark(s, 2, 'disease');
  killByVotes(s, { 0: 2, 1: 0, 2: 1, 3: 1, 4: 1 }); // seat0 voted for the diseased seat2
  ok(s.result.disqualifiedSeats.indexOf(0) !== -1, 'a player who voted for the Diseased cannot win');
})();

// ---------------------------------------------------------------------------
section('Renfield + Master');
(function () {
  var s = game(['vampire', 'renfield', 'villager', 'seer', 'villager']);
  killSeat(s, 2); // a villager dies, no vampire dies
  ok(W(s).indexOf('renfield') !== -1, 'Renfield wins when no vampire is eliminated');
})();
(function () {
  var s = game(['master', 'vampire', 'villager', 'seer', 'villager']);
  // everyone points at the Master (seat0); a fellow vampire (seat1) is among them
  killByVotes(s, { 0: 1, 1: 0, 2: 0, 3: 0, 4: 0 });
  ok(s.deaths.indexOf(0) === -1, 'the Master is protected when a vampire points at them');
})();

// ---------------------------------------------------------------------------
section('no-leak boundary');
(function () {
  var s = game(['vampire', 'master', 'seer', 'cupid', 'villager']);
  var blob = JSON.stringify(E.publicView(s).players);
  ok(!/role|team|vampire|master|seer|mark/i.test(blob), 'public players list carries no role/team/mark');
})();

// ---------------------------------------------------------------------------
section('fuzz + determinism (incl. bots & marks)');
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
  ok(threw === 0, 'no Vampire fuzz game threw (' + games + ' games)');
  function run() { var s = E.newGame(E.defaultConfig(8), 9090); currentPlayerCount = 8; E.beginNight(s); var g = 0; while (E.currentStep(s) && g++ < 300) E.submitStep(s, chooseDet(E.getStep(s))); E.beginVote(s); for (var i = 0; i < 8; i++) E.castVote(s, i, (i + 1) % 8); E.resolveVotes(s); return E.serialize(s); }
  ok(run() === run(), 'Vampire is deterministic for a fixed seed + inputs');
})();

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
