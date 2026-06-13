/*
 * word-engine.core.test.js — exercises the shared word-deduction engine across all three
 * content models (word / wordPair / locationRoles) and all interactions (clues/questions/play).
 * Dependency-free Node (run: node tests/word-engine.core.test.js).
 *
 * Emphasis (per project requirements):
 *   - the INFORMATION BOUNDARY: publicState() must never carry per-seat role/secret data, and
 *     revealFor() must be SHAPE-IDENTICAL for outsider vs insider (no length/field leak);
 *   - the full win/scoring matrix (escape / caught+guess / caught+fail / wrong-conviction / solved);
 *   - determinism + JSON round-trip; bots; and a fuzz loop that may never throw.
 */
'use strict';
function reqCore() {
  try { return require('@partydeck/core/engine/word-engine'); }
  catch (e) { return require('../src/engine/word-engine.js'); }
}
var WordCore = reqCore();

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  FAIL: ' + msg); } }
function section(n) { console.log('\n# ' + n); }
function throws(fn, msg) { var t = false; try { fn(); } catch (e) { t = true; } ok(t, msg); }
function names(n) { var a = []; for (var i = 0; i < n; i++) a.push('P' + (i + 1)); return a; }

// --- tiny libraries + game defs (one per content model) ----------------------
var WORD_LIB = [
  { id: 'food', name: 'Food', category: 'Food', type: 'words',
    items: [{ w: 'Pizza', c: ['cheese', 'slice', 'oven'] }, { w: 'Sushi', c: ['rice', 'fish', 'roll'] }, 'Burger', 'Pasta'] },
  { id: 'animals', name: 'Animals', category: 'Animals', type: 'words',
    items: ['Dog', 'Cat', 'Lion', { w: 'Shark', c: ['ocean', 'teeth', 'fin'] }] }
];
var PAIR_LIB = [
  { id: 'drinks', name: 'Drinks', category: 'Drinks', type: 'pairs',
    items: [{ a: 'Coffee', b: 'Tea', c: ['hot', 'morning'] }, { a: 'Beer', b: 'Wine' }] }
];
var LOC_LIB = [
  { id: 'places', name: 'Places', type: 'locations',
    items: [
      { name: 'Bank', roles: ['Teller', 'Manager', 'Robber', 'Guard', 'Customer', 'Consultant', 'Driver'] },
      { name: 'Beach', roles: ['Lifeguard', 'Surfer', 'Tourist', 'Vendor', 'Swimmer', 'Photographer', 'Kid'] },
      { name: 'Hospital', roles: ['Nurse', 'Doctor', 'Patient', 'Surgeon', 'Intern', 'Therapist', 'Visitor'] },
      { name: 'School', roles: ['Teacher', 'Principal', 'Janitor', 'Student', 'Cook', 'Nurse', 'Guard'] },
      { name: 'Hotel', roles: ['Doorman', 'Manager', 'Maid', 'Bellhop', 'Guest', 'Chef', 'Guard'] },
      { name: 'Casino', roles: ['Dealer', 'Bouncer', 'Manager', 'Gambler', 'Bartender', 'Hustler', 'Guard'] }
    ] }
];

var IMP = WordCore.createEngine({
  game: 'imposter-test', outsider: { label: 'Imposter', plural: 'Imposters' }, insider: { label: 'Crew' },
  contentModel: 'word', interaction: 'clues', guessMode: 'free', minPlayers: 3
});
var UNDER = WordCore.createEngine({
  game: 'undercover-test', outsider: { label: 'Undercover' }, insider: { label: 'Civilian' },
  contentModel: 'wordPair', interaction: 'clues', guessMode: 'free', minPlayers: 3
});
var SPY = WordCore.createEngine({
  game: 'spy-test', outsider: { label: 'Spy' }, insider: { label: 'Agent' },
  contentModel: 'locationRoles', interaction: 'play', guessMode: 'list', minPlayers: 3,
  defaultTimerSeconds: 480, defaultAccusationMode: 'unanimous_anytime', allowOutsiderEarlyGuessDefault: true,
  configDefaults: function () { return { scoreAccuserBonus: 1, scoreWrongConviction: 4, scoreOutsiderSolved: 4, scoreOutsiderEscape: 2 }; }
});

// ---------------------------------------------------------------------------
section('config defaults & validation guardrails');
[3, 4, 5, 6, 7, 8].forEach(function (pc) {
  var v = IMP.validateConfig(IMP.defaultConfig(pc), WORD_LIB);
  ok(v.ok, pc + 'p imposter default validates (errors: ' + JSON.stringify(v.errors) + ')');
});
(function () {
  var c = IMP.defaultConfig(5); c.outsiderCount = 3; // 3 of 5 -> not a majority of insiders
  ok(!IMP.validateConfig(c, WORD_LIB).ok, 'too many outsiders is an error (no insider majority)');
  c.outsiderCount = 2; ok(IMP.validateConfig(c, WORD_LIB).ok, '2 of 5 outsiders is allowed (with a warning)');
  ok(IMP.validateConfig(c, WORD_LIB).warnings.length > 0, 'multi-outsider warns');
})();
(function () {
  var c = IMP.defaultConfig(5); c.botCount = 5; ok(!IMP.validateConfig(c, WORD_LIB).ok, 'all-bot is an error (need a human)');
  c.botCount = 2; ok(IMP.validateConfig(c, WORD_LIB).ok, 'some bots is allowed');
})();
(function () {
  var c = IMP.defaultConfig(5); c.playerNames[2] = '';
  ok(!IMP.validateConfig(c, WORD_LIB).ok, 'blank name is an error');
})();
(function () {
  var c = IMP.defaultConfig(5); c.packIds = ['nope'];
  ok(!IMP.validateConfig(c, WORD_LIB).ok, 'no matching content is an error');
})();

// ---------------------------------------------------------------------------
section('content models: secret assignment + reveal');
(function () {
  var s = IMP.newGame(IMP.defaultConfig(5), WORD_LIB, 42);
  var outs = s.outsiderSeats; ok(outs.length === 1, 'word: exactly one outsider by default');
  s.players.forEach(function (p) {
    var r = IMP.revealFor(s, p.seat);
    if (IMP.isOutsider(s, p.seat)) ok(r.word === null, 'word: outsider sees no word');
    else ok(r.word === IMP.secretDisplay(s), 'word: insiders all see the same secret word');
  });
})();
(function () {
  var s = UNDER.newGame(UNDER.defaultConfig(5), PAIR_LIB, 7);
  var civ = null, und = null;
  s.players.forEach(function (p) { var r = UNDER.revealFor(s, p.seat); if (r.isOutsider) und = r.word; else civ = r.word; });
  ok(civ && und && civ !== und, 'wordPair: civilians and undercover see DIFFERENT words (' + civ + ' / ' + und + ')');
  ok(und !== null, 'wordPair: the undercover still gets a (close) word, not blank');
})();
(function () {
  var s = SPY.newGame(SPY.defaultConfig(6), LOC_LIB, 11);
  var roles = {};
  s.players.forEach(function (p) {
    var r = SPY.revealFor(s, p.seat);
    if (r.isOutsider) { ok(r.location === null && r.roleAtLocation === null, 'locationRoles: spy gets no location/role'); }
    else {
      ok(r.location === SPY.secretDisplay(s), 'locationRoles: agents share the location');
      ok(!!r.roleAtLocation, 'locationRoles: each agent gets a role'); roles[r.roleAtLocation] = (roles[r.roleAtLocation] || 0) + 1;
    }
  });
})();

// ---------------------------------------------------------------------------
section('INFORMATION BOUNDARY — no leaks on public surfaces');
(function () {
  var s = IMP.newGame(IMP.defaultConfig(6), WORD_LIB, 5);
  IMP.beginInteraction(s);
  var pub = JSON.stringify(IMP.publicState(s));
  ok(!/isOutsider|seatSecret|"secret"|roleAtLocation/.test(pub), 'publicState carries no secret/role fields');
  // the actual secret word must never appear in the public blob
  ok(pub.indexOf(IMP.secretDisplay(s)) === -1, 'the secret word never appears in publicState');
  // public player rows are shape-identical (only seat/name/number/bot)
  IMP.publicState(s).players.forEach(function (row) {
    ok(Object.keys(row).sort().join(',') === 'bot,name,number,seat', 'public player row carries only seat/name/number/bot');
  });
  // revealFor MUST be shape-identical for outsider vs insider (same key set) — no length leak.
  var keysOut = null, keysIn = null;
  s.players.forEach(function (p) {
    var k = Object.keys(IMP.revealFor(s, p.seat)).sort().join(',');
    if (IMP.isOutsider(s, p.seat)) keysOut = k; else keysIn = k;
  });
  ok(keysOut && keysIn && keysOut === keysIn, 'revealFor() key set is identical for outsider and insider');
  // endReveal is null before the round ends
  ok(IMP.endReveal(s) === null, 'endReveal is null until the round ends');
})();
(function () {
  // locationRoles public blob must not leak the location either
  var s = SPY.newGame(SPY.defaultConfig(6), LOC_LIB, 9);
  var pub = JSON.stringify(SPY.publicState(s));
  ok(pub.indexOf(SPY.secretDisplay(s)) === -1, 'spyfall: the location never appears in publicState');
})();

// ---------------------------------------------------------------------------
section('full loop + win/scoring matrix (word/clues)');
function forceOutsider(state, eng, seat) {
  // move the (single) outsider to a known seat for deterministic outcome tests
  state.outsiderSeats = [seat];
  state.players.forEach(function (p) { state.seatSecret[p.seat] = { word: p.seat === seat ? null : eng.secretDisplay(state) }; });
}
function runToVote(eng, s) {
  eng.beginInteraction(s);
  var guard = 0;
  while (s.phase === 'clues' && guard++ < 200) eng.nextClue(s, 'clue');
  if (s.phase === 'debate') eng.beginVote(s);
  if (s.phase !== 'vote') eng.beginVote(s);
}
// escape: nobody is the most-voted enough? (all point at seat0 who is NOT outsider -> wrong conviction)
(function () {
  var s = IMP.newGame(IMP.defaultConfig(5), WORD_LIB, 100); forceOutsider(s, IMP, 2);
  runToVote(IMP, s);
  for (var i = 0; i < 5; i++) IMP.castVote(s, i, i === 0 ? 1 : 0); // seat0 most-voted (an insider)
  IMP.resolveVotes(s); IMP.revealAccused(s);
  ok(s.outcome === IMP.OUTCOMES.wrong_conviction, 'accusing an insider => wrong_conviction (outsider wins)');
  ok(s.roundScores[2] === s.config.scoreWrongConviction, 'outsider scored the wrong-conviction bucket');
})();
// caught + fails guess -> insiders win
(function () {
  var s = IMP.newGame(IMP.defaultConfig(5), WORD_LIB, 101); forceOutsider(s, IMP, 2);
  runToVote(IMP, s);
  for (var i = 0; i < 5; i++) IMP.castVote(s, i, i === 2 ? 0 : 2); // seat2 (outsider) most-voted
  IMP.resolveVotes(s); IMP.revealAccused(s);
  ok(s.phase === 'guess', 'caught outsider goes to guess');
  IMP.outsiderGuess(s, 'definitely-wrong');
  ok(s.outcome === IMP.OUTCOMES.caught_failed, 'caught + wrong guess => caught_failed');
  var insiderScored = s.players.every(function (p) { return IMP.isOutsider(s, p.seat) ? s.roundScores[p.seat] === 0 : s.roundScores[p.seat] === s.config.scoreInsiderCatch; });
  ok(insiderScored, 'every insider scored the catch bucket; outsider scored 0');
})();
// caught + correct guess -> outsider escapes
(function () {
  var s = IMP.newGame(IMP.defaultConfig(5), WORD_LIB, 102); forceOutsider(s, IMP, 3);
  runToVote(IMP, s);
  for (var i = 0; i < 5; i++) IMP.castVote(s, i, i === 3 ? 0 : 3);
  IMP.resolveVotes(s); IMP.revealAccused(s);
  IMP.outsiderGuess(s, IMP.secretDisplay(s)); // exact secret
  ok(s.outcome === IMP.OUTCOMES.caught_guessed, 'caught + correct guess => caught_guessed (escape)');
  ok(s.roundScores[3] === s.config.scoreOutsiderGuess, 'outsider scored the caught-guessed bucket');
})();
// escaped undetected: tie -> outsider_escapes tiebreaker
(function () {
  var c = IMP.defaultConfig(4); c.tieBreaker = 'outsider_escapes';
  var s = IMP.newGame(c, WORD_LIB, 103); forceOutsider(s, IMP, 1);
  runToVote(IMP, s);
  IMP.castVote(s, 0, 2); IMP.castVote(s, 1, 3); IMP.castVote(s, 2, 0); IMP.castVote(s, 3, 1); // 1 each -> tie
  IMP.resolveVotes(s);
  ok(s.outcome === IMP.OUTCOMES.escaped_undetected, 'tie + outsider_escapes => escaped_undetected');
  ok(s.roundScores[1] === s.config.scoreOutsiderEscape, 'outsider scored the escape bucket');
})();

// ---------------------------------------------------------------------------
section('spyfall play: mid-round unanimous accusation + spy early-guess (list)');
(function () {
  var s = SPY.newGame(SPY.defaultConfig(6), LOC_LIB, 200);
  s._listSize = LOC_LIB[0].items.length;
  SPY.beginInteraction(s); ok(s.phase === 'play', 'spy interaction is the play/timer phase');
  var spy = s.outsiderSeats[0], accuser = (spy + 1) % 6, accused = spy;
  // non-unanimous accusation: play continues
  SPY.callAccusation(s, accuser, (spy + 2) % 6, false);
  ok(s.phase === 'play', 'a non-unanimous accusation does not end play');
  // unanimous accusation of the real spy -> caught -> guess phase
  SPY.callAccusation(s, accuser, accused, true);
  ok(s.phase === 'guess', 'unanimous accusation of the spy => guess phase');
  // spy guesses the WRONG location index -> insiders win, accuser bonus applies
  var wrong = (s.secret.index + 1) % LOC_LIB[0].items.length;
  SPY.outsiderGuess(s, wrong);
  ok(s.outcome === SPY.OUTCOMES.caught_failed, 'spy wrong guess => caught_failed');
  ok(s.roundScores[accuser] === s.config.scoreInsiderCatch + s.config.scoreAccuserBonus, 'accuser got catch + bonus');
})();
(function () {
  var s = SPY.newGame(SPY.defaultConfig(6), LOC_LIB, 201);
  SPY.beginInteraction(s);
  var spy = s.outsiderSeats[0];
  SPY.outsiderReveal(s, spy); ok(s.phase === 'guess', 'spy may self-reveal to guess early');
  SPY.outsiderGuess(s, s.secret.index); // correct location
  ok(s.outcome === SPY.OUTCOMES.outsider_solved, 'spy self-reveal + correct location => outsider_solved');
  ok(s.roundScores[spy] === s.config.scoreOutsiderSolved, 'spy scored the solved bucket');
})();
// non-outsider cannot self-reveal
throws(function () { var s = SPY.newGame(SPY.defaultConfig(5), LOC_LIB, 9); SPY.beginInteraction(s); var nonSpy = (s.outsiderSeats[0] + 1) % 5; SPY.outsiderReveal(s, nonSpy); }, 'a non-outsider cannot stop the round to guess');

// ---------------------------------------------------------------------------
section('multi-round scoring + match end');
(function () {
  var c = IMP.defaultConfig(4); c.winTarget = 3; c.scoreOutsiderEscape = 2; c.tieBreaker = 'outsider_escapes';
  var s = IMP.newGame(c, WORD_LIB, 300);
  var rounds = 0;
  while (s.phase !== 'game_over' && rounds++ < 20) {
    forceOutsider(s, IMP, s.dealerSeat); // outsider keeps escaping
    runToVote(IMP, s);
    s.players.forEach(function (p) { IMP.castVote(s, p.seat, (p.seat + 1) % 4); }); // spread -> ... resolve
    // force a clean tie-escape: everyone points around the ring is a 1-1-1-1 tie
    IMP.resolveVotes(s);
    if (s.phase === 'round_over') IMP.nextRound(s, WORD_LIB);
  }
  ok(s.phase === 'game_over', 'match reaches game_over once someone hits the win target');
  ok(s.winnerSeats && s.winnerSeats.length >= 1, 'a winner is recorded');
})();

// ---------------------------------------------------------------------------
section('bots: deterministic, fair, terminating');
(function () {
  var c = IMP.defaultConfig(6); c.botCount = 5; c.recordClues = true;
  function play(seed) {
    var s = IMP.newGame(c, WORD_LIB, seed);
    ok(s.players.filter(function (p) { return p.bot; }).length === 5, '5 bot seats created');
    IMP.beginInteraction(s);
    var guard = 0;
    while (s.phase === 'clues' && guard++ < 200) {
      IMP.autoAdvanceClues(s);
      if (s.phase !== 'clues') break;
      // the one human gives a clue
      IMP.nextClue(s, 'human-clue');
    }
    if (s.phase === 'debate') IMP.beginVote(s);
    if (s.phase !== 'vote') IMP.beginVote(s);
    IMP.autoCastBotVotes(s);
    s.players.forEach(function (p) { if (!p.bot && s.votes[p.seat] == null) IMP.castVote(s, p.seat, (p.seat + 1) % 6); });
    IMP.resolveVotes(s);
    if (s.phase === 'tally') { IMP.revealAccused(s); if (s.phase === 'guess') IMP.outsiderGuess(s, IMP.botGuess(s)); }
    return IMP.serialize(s);
  }
  var a = play(777), b = play(777);
  ok(a === b, 'bot play is deterministic for a fixed seed + fixed human inputs');
  var threw = 0; for (var g = 0; g < 25; g++) { try { play(1000 + g); } catch (e) { threw++; console.error('  bot THREW: ' + e.message); } }
  ok(threw === 0, 'bot-heavy games never throw (25 seeds)');
})();

// ---------------------------------------------------------------------------
section('determinism + JSON round-trip');
(function () {
  function run() { var s = IMP.newGame(IMP.defaultConfig(6), WORD_LIB, 4242); IMP.beginInteraction(s); while (s.phase === 'clues') IMP.nextClue(s, 'x'); return IMP.serialize(s); }
  ok(run() === run(), 'same seed + inputs => byte-identical state');
  var s = IMP.newGame(IMP.defaultConfig(5), WORD_LIB, 11);
  ok(JSON.stringify(IMP.deserialize(IMP.serialize(s))) === IMP.serialize(s), 'state round-trips through JSON');
})();

// ---------------------------------------------------------------------------
section('fuzz: random-but-legal full games never throw, no leaks');
(function () {
  var engines = [{ e: IMP, lib: WORD_LIB }, { e: UNDER, lib: PAIR_LIB }, { e: SPY, lib: LOC_LIB }];
  var games = 0, threw = 0, leaks = 0;
  engines.forEach(function (pair) {
    var eng = pair.e, lib = pair.lib;
    for (var pc = 3; pc <= 7; pc++) {
      for (var g = 0; g < 12; g++) {
        try {
          var c = eng.defaultConfig(pc); c.botCount = (g % pc);
          var s = eng.newGame(c, lib, pc * 100 + g + 1);
          if (JSON.stringify(eng.publicState(s)).indexOf(eng.secretDisplay(s)) !== -1) leaks++;
          eng.beginInteraction(s);
          var guard = 0;
          if (s.phase === 'clues') { while (s.phase === 'clues' && guard++ < 200) { eng.autoAdvanceClues(s); if (s.phase === 'clues') eng.nextClue(s, 'k'); } }
          else if (s.phase === 'questions') { while (s.phase === 'questions' && guard++ < 50) eng.nextQuestion(s); }
          else { /* play */ }
          if (s.phase === 'debate' || s.phase === 'play') eng.beginVote(s);
          if (s.phase !== 'vote' && s.phase !== 'tally' && s.phase !== 'guess' && s.phase !== 'round_over' && s.phase !== 'game_over') eng.beginVote(s);
          if (s.phase === 'vote') {
            eng.autoCastBotVotes(s);
            s.players.forEach(function (p) { if (s.votes[p.seat] == null) eng.castVote(s, p.seat, (p.seat + 1) % pc); });
            eng.resolveVotes(s);
          }
          if (s.phase === 'tally') eng.revealAccused(s);
          if (s.phase === 'guess') eng.outsiderGuess(s, eng.botGuess(s));
          ok(['round_over', 'game_over', 'vote'].indexOf(s.phase) !== -1 || s.phase === 'tally', eng.game + ' ' + pc + 'p#' + g + ' reached a terminal-ish phase (' + s.phase + ')');
          games++;
        } catch (e) { threw++; console.error('  THREW: ' + eng.game + ' ' + pc + 'p#' + g + ' :: ' + e.message); }
      }
    }
  });
  ok(threw === 0, 'no fuzz game threw (' + games + ' games)');
  ok(leaks === 0, 'no fuzz game leaked the secret into publicState');
})();

// ---------------------------------------------------------------------------
console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
