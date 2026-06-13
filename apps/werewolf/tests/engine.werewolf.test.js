/*
 * engine.werewolf.test.js — exercises the shared engine through the real Werewolf roles.
 * Dependency-free Node (run: node tests/engine.werewolf.test.js).
 *
 * Covers: config defaults/validation, deal invariants, night swap/look correctness,
 * the win-condition matrix (village/werewolf/tanner/minion/hunter), determinism + replay,
 * JSON round-trip, the public/private INFORMATION BOUNDARY (no leaks), and a fuzz loop.
 */
'use strict';

// Resolve core whether or not workspaces are installed yet.
function reqCore() {
  try { return require('@partydeck/core/engine/core-engine'); }
  catch (e) { return require('../../../packages/core/src/engine/core-engine.js'); }
}
var GameCore = reqCore();
var WEREWOLF = require('../src/roles.js');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  FAIL: ' + msg); } }
function section(n) { console.log('\n# ' + n); }
function throws(fn, msg) { var t = false; try { fn(); } catch (e) { t = true; } ok(t, msg); }

var E = GameCore.createEngine(WEREWOLF);

// --- helpers -----------------------------------------------------------------
function names(n) { var a = []; for (var i = 0; i < n; i++) a.push('P' + (i + 1)); return a; }

// Force the card in each seat (and dealt role) to a known role, for win-resolution tests.
function setSeatRoles(state, arr) {
  arr.forEach(function (rid, s) {
    var cardId = state.positions['p' + s].cardId;
    state.cards[cardId].role = rid;
    state.cards[cardId].copiedRole = null;
    state.players[s].dealtRole = rid;
    state.players[s].copiedRole = null;
  });
  E.rebuildSchedule(state); // schedule is built at deal time; rebuild after forcing roles
}

// Deterministic chooser: always the first legal option / lowest legal seat / first centers.
function chooseDet(step) {
  var inputs = {};
  step.inputs.forEach(function (spec) {
    if (spec.visibleWhen) {
      var k = Object.keys(spec.visibleWhen)[0];
      if (inputs[k] !== spec.visibleWhen[k]) return;
    }
    if (spec.type === 'choice') inputs[spec.id] = spec.options[0].value;
    else if (spec.type === 'pickPlayer') {
      for (var s = 0; s < step.total + 99; s++) {
        if (s === step.seat) continue;
        if (spec.exclude && spec.exclude.indexOf(s) !== -1) continue;
        if (s < currentPlayerCount) { inputs[spec.id] = s; break; }
      }
    } else if (spec.type === 'pickCenter') {
      var arr = []; for (var i = 0; i < (spec.count || 1); i++) arr.push(i); inputs[spec.id] = arr;
    }
  });
  return inputs;
}
var currentPlayerCount = 0;

// Random-but-legal chooser for fuzzing.
function chooseRand(step) {
  var inputs = {};
  step.inputs.forEach(function (spec) {
    if (spec.visibleWhen) {
      var k = Object.keys(spec.visibleWhen)[0];
      if (inputs[k] !== spec.visibleWhen[k]) return;
    }
    if (spec.type === 'choice') inputs[spec.id] = spec.options[Math.floor(Math.random() * spec.options.length)].value;
    else if (spec.type === 'pickPlayer') {
      var legal = [];
      for (var s = 0; s < currentPlayerCount; s++) {
        if (s === step.seat) continue;
        if (spec.exclude && spec.exclude.indexOf(s) !== -1) continue;
        legal.push(s);
      }
      if (spec.optional && Math.random() < 0.3) inputs[spec.id] = null;
      else inputs[spec.id] = legal[Math.floor(Math.random() * legal.length)];
    } else if (spec.type === 'pickCenter') {
      var idxs = []; for (var c = 0; c < currentPlayerCount + 3 - currentPlayerCount; c++) idxs.push(c);
      // centers are 0..centerCount-1
      var all = [0, 1, 2].slice(0, 3);
      shuffle(all);
      inputs[spec.id] = all.slice(0, spec.count || 1);
    }
  });
  return inputs;
}
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } }

function playNight(state, chooser) {
  E.beginNight(state);
  var guard = 0;
  while (E.currentStep(state) && guard++ < 500) {
    var step = E.getStep(state);
    E.submitStep(state, chooser(step));
  }
  return state;
}

// ---------------------------------------------------------------------------
section('config defaults & validation');
[3, 4, 5, 6, 7, 8, 9, 10].forEach(function (pc) {
  var cfg = E.defaultConfig(pc);
  var v = E.validateConfig(cfg);
  ok(v.ok, pc + 'p default config validates (errors: ' + JSON.stringify(v.errors) + ')');
  ok(cfg.roleSet.length === pc + 3, pc + 'p preset has exactly players+3 cards');
});

(function () {
  var c = E.defaultConfig(5); c.roleSet = c.roleSet.slice(0, c.roleSet.length - 1); // wrong count
  ok(!E.validateConfig(c).ok, 'wrong card count is an error');
})();
(function () {
  var c = E.defaultConfig(5); c.roleSet = c.roleSet.concat(['nonexistent_role']);
  ok(!E.validateConfig(c).ok, 'unknown role is an error');
})();
(function () {
  var c = E.defaultConfig(8);
  // 8p preset has 2 masons; break to 1 mason and pad with a villager to keep the count.
  var i = c.roleSet.indexOf('mason'); c.roleSet[i] = 'villager';
  ok(!E.validateConfig(c).ok, 'a single Mason is an error (must be a pair)');
})();
(function () {
  var c = E.defaultConfig(5); c.playerNames[2] = '';
  ok(!E.validateConfig(c).ok, 'blank name is an error');
})();
(function () {
  var c = E.defaultConfig(5);
  c.roleSet = ['seer', 'robber', 'troublemaker', 'villager', 'villager', 'villager', 'villager', 'villager'];
  var v = E.validateConfig(c);
  ok(v.ok, 'a no-werewolf set is still playable');
  ok(v.warnings.length > 0, 'a no-werewolf set warns');
})();

// ---------------------------------------------------------------------------
section('deal invariants');
(function () {
  var s = E.newGame(E.defaultConfig(7), 12345);
  var cardCount = Object.keys(s.cards).length;
  ok(cardCount === 10, '7p deals 10 cards (7 seats + 3 center)');
  var centerCount = Object.keys(s.positions).filter(function (k) { return k[0] === 'c'; }).length;
  ok(centerCount === 3, 'exactly 3 center positions');
  // every card is in exactly one position
  var placed = {};
  Object.keys(s.positions).forEach(function (pos) { placed[s.positions[pos].cardId] = true; });
  ok(Object.keys(placed).length === cardCount, 'every card occupies exactly one position');
})();

// ---------------------------------------------------------------------------
section('night swap/look correctness');
(function () {
  // Robber (seat0) robs seat1; robber's seat ends with seat1's original card; robber learns it.
  var s = E.newGame(E.defaultConfig(6), 7);
  setSeatRoles(s, ['robber', 'werewolf', 'villager', 'seer', 'troublemaker', 'insomniac']);
  E.beginNight(s);
  // advance to the robber's step, feeding skips for earlier roles
  currentPlayerCount = 6;
  var safety = 0;
  while (E.currentStep(s) && safety++ < 50) {
    var step = E.getStep(s);
    if (step.roleId === 'robber') {
      E.submitStep(s, { target: 1 });
      ok(E.finalRoleId(s, 0) === 'werewolf', 'Robber ends up with the robbed (Werewolf) card');
      ok(E.finalRoleId(s, 1) === 'robber', 'Robbed player now holds the Robber card');
      var k = s.knowledge[0];
      ok(k.some(function (f) { return f.kind === 'sawCard' && f.role === 'werewolf'; }), 'Robber privately learned the stolen card is a Werewolf');
      break;
    }
    E.submitStep(s, chooseDet(step));
  }
})();

(function () {
  // Troublemaker swaps two others blindly; it learns nothing about the cards.
  var s = E.newGame(E.defaultConfig(6), 99);
  setSeatRoles(s, ['troublemaker', 'werewolf', 'seer', 'villager', 'villager', 'insomniac']);
  E.beginNight(s);
  currentPlayerCount = 6;
  var safety = 0;
  while (E.currentStep(s) && safety++ < 50) {
    var step = E.getStep(s);
    if (step.roleId === 'troublemaker') {
      E.submitStep(s, { a: 1, b: 2 });
      ok(E.finalRoleId(s, 1) === 'seer' && E.finalRoleId(s, 2) === 'werewolf', 'Troublemaker swapped seats 1 and 2');
      ok(!s.knowledge[0].some(function (f) { return f.kind === 'sawCard'; }), 'Troublemaker learned no card identities (blind swap)');
      break;
    }
    E.submitStep(s, chooseDet(step));
  }
})();

// ---------------------------------------------------------------------------
section('win-condition matrix');
function outcome(rolesArr, killSeats, votesMap) {
  var s = E.newGame(E.defaultConfig(rolesArr.length), 1);
  setSeatRoles(s, rolesArr);
  s.phase = 'vote';
  if (votesMap) { s.votes = votesMap; E.resolveVotes(s); }
  else {
    var tally = []; for (var i = 0; i < rolesArr.length; i++) tally[i] = 0;
    killSeats.forEach(function (k) { tally[k] = 2; }); // 2 votes => dies
    E.resolveVotes(s, tally);
  }
  return s.result;
}
function winnersOf(r) { return r.winners.slice().sort().join(','); }

// village kills a werewolf -> village wins
ok(winnersOf(outcome(['werewolf', 'seer', 'villager', 'robber', 'villager'], [0])) === 'village',
  'killing a Werewolf => village wins');
// no werewolf dies (someone else dies) -> werewolves win
ok(winnersOf(outcome(['werewolf', 'seer', 'villager', 'robber', 'villager'], [1])) === 'werewolf',
  'killing a non-Werewolf while a Werewolf is in play => werewolves win');
// no werewolves among players, nobody dies -> village wins
ok(winnersOf(outcome(['seer', 'villager', 'robber', 'troublemaker', 'villager'], [])) === 'village',
  'no Werewolf in play + nobody dies => village wins');
// no werewolves among players, someone dies -> village loses (nobody from these wins)
ok(winnersOf(outcome(['seer', 'villager', 'robber', 'troublemaker', 'villager'], [1])) === '',
  'no Werewolf in play + someone dies => village loses');
// tanner dies -> tanner wins; no werewolf died so werewolves suppressed
ok(winnersOf(outcome(['werewolf', 'tanner', 'villager', 'seer', 'villager'], [1])) === 'tanner',
  'Tanner dies (no Werewolf dies) => only Tanner wins, werewolves suppressed');
// tanner dies AND a werewolf dies -> tanner + village
ok(winnersOf(outcome(['werewolf', 'tanner', 'villager', 'seer', 'villager'], [0, 1])) === 'tanner,village',
  'Tanner + a Werewolf both die => Tanner and village win');
// minion present, no werewolves in play, a non-minion dies -> werewolf team (minion) wins
ok(winnersOf(outcome(['minion', 'seer', 'villager', 'robber', 'villager'], [1])) === 'werewolf',
  'Minion with no Werewolves in play: a non-minion dies => werewolf team wins');
ok(winnersOf(outcome(['minion', 'seer', 'villager', 'robber', 'villager'], [0])) === 'village',
  'Minion with no Werewolves in play: lynching the Minion => village wins (not a no-winner game)');

// Hunter: dies and takes their vote target with them (which is a werewolf) -> village wins
(function () {
  var votes = { 0: 1, 1: 0, 2: 0, 3: 4, 4: 3 }; // seat0(hunter) points at seat1(werewolf); seats vote to kill hunter
  // make seat0 the most-voted so the hunter dies: 1->0, 2->0 ... give seat0 the max
  votes = { 0: 1, 1: 0, 2: 0, 3: 0, 4: 0 }; // seat0 gets 4 votes -> dies; hunter points at seat1
  var r = outcome(['hunter', 'werewolf', 'villager', 'seer', 'villager'], null, votes);
  ok(r.deaths.indexOf(1) !== -1, 'Hunter death drags their vote target (the Werewolf) down too');
  ok(winnersOf(r) === 'village', 'Hunter chain kills the Werewolf => village wins');
})();

// ---------------------------------------------------------------------------
section('determinism + JSON round-trip');
(function () {
  function run() {
    var s = E.newGame(E.defaultConfig(7), 4242);
    currentPlayerCount = 7;
    playNight(s, chooseDet);
    E.beginVote(s);
    for (var i = 0; i < 7; i++) E.castVote(s, i, (i + 1) % 7);
    E.resolveVotes(s);
    return E.serialize(s);
  }
  var a = run(), b = run();
  ok(a === b, 'same seed + same inputs => byte-identical final state');
  var s = E.newGame(E.defaultConfig(6), 11);
  var round = E.deserialize(E.serialize(s));
  ok(JSON.stringify(round) === E.serialize(s), 'state round-trips through JSON');
})();

// ---------------------------------------------------------------------------
section('INFORMATION BOUNDARY — no leaks on public surfaces');
(function () {
  var s = E.newGame(E.defaultConfig(6), 5);
  currentPlayerCount = 6;
  E.beginNight(s);
  // mid-night public view must not reveal any seat's role/team/card.
  var pub = JSON.stringify(E.publicView(s));
  var leaked = ['werewolf', 'seer', 'robber', 'minion', 'tanner', 'village'].filter(function (w) {
    // rolesInPlay legitimately lists the CARD SET (public knowledge), so only flag a leak if
    // a role is tied to a specific seat. publicView.players carries only name/number/alive.
    return /"dealtRole"|"finalRole"|"team"|"role":/.test(pub);
  });
  ok(leaked.length === 0, 'publicView() exposes no per-seat role/team/card');
  var playersBlob = JSON.stringify(E.publicView(s).players);
  ok(!/role|team|card|werewolf|seer/i.test(playersBlob), 'public players list carries only name/number/alive');
  // privateReveal is per-seat and DOES contain that seat's own info (gated by the UI).
  var pr = E.privateReveal(s, 0);
  ok(pr.dealtRole != null, 'privateReveal exposes the seat\'s own dealt role (for the gated screen)');
  // endReveal must be null before the game ends.
  ok(E.endReveal(s) === null, 'endReveal is null until the game ends');
})();

// ---------------------------------------------------------------------------
section('Doppelgänger (copy + team travel)');
(function () {
  var cfg = E.defaultConfig(5);
  cfg.roleSet = ['doppelganger', 'werewolf', 'seer', 'robber', 'villager', 'troublemaker', 'villager', 'villager'];
  var v = E.validateConfig(cfg);
  ok(v.ok, 'doppelgänger config validates');
  ok(v.warnings.some(function (w) { return /Doppelg/.test(w); }), 'doppelgänger emits a complexity warning');
  var s = E.newGame(cfg, 3);
  setSeatRoles(s, ['doppelganger', 'werewolf', 'seer', 'robber', 'villager']);
  E.beginNight(s);
  currentPlayerCount = 5;
  // Doppelgänger (seat0, wakes first at -7) copies seat1 (Werewolf).
  var step = E.getStep(s);
  ok(step.roleId === 'doppelganger', 'Doppelgänger wakes first');
  E.submitStep(s, { target: 1 });
  ok(s.players[0].copiedRole === 'werewolf', 'Doppelgänger copied Werewolf');
  // It should re-wake with the werewolves and be counted as a werewolf for the team.
  ok(E.finalTeamOf(s, 0) === 'werewolf', 'Doppelgänger-Werewolf is on the werewolf team');
  // finish the night without throwing
  var guard = 0;
  while (E.currentStep(s) && guard++ < 50) E.submitStep(s, chooseDet(E.getStep(s)));
  ok(s.phase === 'day', 'night completes with a Doppelgänger present');
})();

// ---------------------------------------------------------------------------
section('bot play');
function playWithBots(pc, botCount, seed, humanChooser) {
  var cfg = E.defaultConfig(pc); cfg.botCount = botCount;
  currentPlayerCount = pc;
  var s = E.newGame(cfg, seed);
  // bot flags
  var bots = s.players.filter(function (p) { return p.bot; }).length;
  ok(bots === botCount, pc + 'p has ' + botCount + ' bot seats');
  E.beginNight(s);
  var guard = 0;
  while (E.currentStep(s) && guard++ < 500) {
    E.autoResolveBotNight(s);                 // resolve any bot steps
    var step = E.currentStep(s);
    if (!step) break;
    if (E.isBot(s, step.seat)) { E.autoResolveBotNight(s); continue; }
    E.submitStep(s, humanChooser(E.getStep(s))); // a human step
  }
  E.autoResolveBotNight(s);
  ok(s.phase === 'day', pc + 'p/' + botCount + 'bots night terminated');
  E.beginVote(s);
  E.autoCastBotVotes(s);
  // remaining humans vote (point at the next seat)
  s.players.forEach(function (p) { if (!p.bot && s.votes[p.seat] == null) E.castVote(s, p.seat, (p.seat + 1) % pc); });
  E.resolveVotes(s);
  ok(s.phase === 'end', pc + 'p/' + botCount + 'bots resolved');
  ok(Array.isArray(s.result.winners), pc + 'p/' + botCount + 'bots produced winners');
  return s;
}
// solo practice (1 human, rest bots) across counts
[4, 5, 6, 7].forEach(function (pc) { playWithBots(pc, pc - 1, pc * 7 + 1, chooseDet); });
// all-but-one bots, several seeds, must never throw
(function () {
  var threw = 0;
  for (var g = 0; g < 30; g++) { try { playWithBots(6, 5, 5000 + g, chooseDet); } catch (e) { threw++; console.error('  bot THREW: ' + e.message); } }
  ok(threw === 0, 'bot-heavy games never throw');
})();
// determinism with bots: same seed + same human inputs => identical state
(function () {
  var a = E.serialize(playWithBots(7, 6, 24680, chooseDet));
  var b = E.serialize(playWithBots(7, 6, 24680, chooseDet));
  ok(a === b, 'bot play is deterministic for a fixed seed + fixed human inputs');
})();

// ---------------------------------------------------------------------------
section('fuzz: full random-but-legal games');
(function () {
  var games = 0, throwsCount = 0;
  [3, 4, 5, 6, 7, 8, 9, 10].forEach(function (pc) {
    for (var g = 0; g < 25; g++) {
      currentPlayerCount = pc;
      try {
        var s = E.newGame(E.defaultConfig(pc), pc * 1000 + g + 1);
        var cardsBefore = Object.keys(s.cards).length;
        playNight(s, chooseRand);
        ok(s.phase === 'day', pc + 'p#' + g + ' night terminated');
        E.beginVote(s);
        for (var i = 0; i < pc; i++) E.castVote(s, i, (i + 1 + Math.floor(Math.random() * (pc - 1))) % pc === i ? (i + 1) % pc : (i + 1 + Math.floor(Math.random() * (pc - 1))) % pc);
        // ensure every seat voted for someone other than itself
        for (i = 0; i < pc; i++) if (s.votes[i] === i) s.votes[i] = (i + 1) % pc;
        E.resolveVotes(s);
        ok(s.phase === 'end', pc + 'p#' + g + ' resolved to an end state');
        ok(Object.keys(s.cards).length === cardsBefore, pc + 'p#' + g + ' card count conserved');
        ok(Array.isArray(s.result.winners), pc + 'p#' + g + ' produced a winners array');
        games++;
      } catch (e) { throwsCount++; console.error('  THREW: ' + pc + 'p#' + g + ' :: ' + e.message); }
    }
  });
  ok(throwsCount === 0, 'no fuzz game threw (' + games + ' games played)');
})();

// ---------------------------------------------------------------------------
console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
