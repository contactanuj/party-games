/*
 * roles.js (Alien) - village roles plus the Alien team and several app-driven / solo roles.
 * Some roles take a per-game ACTION VARIANT chosen at deal time (state.variants[seat]) so the
 * same role plays differently each game (the "app-driven" feel): Oracle (which relic), Alien
 * (probe vs convert), Exposer (how many center cards), Mortician (how many neighbors).
 * Solo win roles: Synthetic (wins if it dies, dooming alien+village), Blob (its cluster must
 * survive), Mortician (a neighbor must die), Groob & Zerb (frenemies when both are dealt).
 * UMD: Node tests require() this; the inlined browser bundle reads window.PARTY_GAME.
 */
(function (root, factory) {
  var BASE = (root && root.PARTY_BASE) ? root.PARTY_BASE : (function () {
    try { return require('@partydeck/core/roles/base-roles'); }
    catch (e) { return require('../../../packages/core/src/roles/base-roles.js'); }
  })();
  var G = factory(BASE);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  if (root) { root.PARTY_GAME = G; root.ALIEN_GAME = G; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (BASE) {
  'use strict';

  function alienPred(ctx) { return function (s) { return ctx.roleHasFlag(ctx.actingRole(s), 'alien'); }; }
  function tokenAlien(state, seat) { return state.tokens.some(function (t) { return t.type === 'alienized' && t.onPosition === 'p' + seat; }); }

  var alien = [
    {
      id: 'oracle', name: 'Oracle', team: 'village', wake: -9, maxCopies: 1, variants: 3, minCenter: 1,
      blurb: 'The signal shows you one relic in the center each game.',
      prompt: 'The signal reveals a center relic to you.',
      narration: { open: 'Oracle, wake up - the signal shows you a center card.', close: 'Oracle, close your eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { ctx.lookCard(ctx.centerPos(ctx.myVariant() % ctx.centerCount)); }
    },

    {
      id: 'alien', name: 'Alien', team: 'alien', alien: true, wake: 1, maxCopies: 3, variants: 2,
      narrationGroup: 'alien',
      blurb: 'Wake with the others. Each game your tech does something different - probe a card, or convert a human.',
      prompt: 'Find the others, then use your tech.',
      narration: { open: 'Aliens, wake and find each other, then use your technology.', close: 'Aliens, close your eyes.' },
      inputs: function (ctx) {
        if (ctx.myVariant() === 0) return [{ id: 'target', type: 'pickPlayer', label: 'You may probe one player\'s card', exclude: [ctx.self], optional: true }];
        return [{ id: 'target', type: 'pickPlayer', label: 'You may convert one human into an Alien', exclude: [ctx.self], optional: true }];
      },
      act: function (ctx, inputs) {
        ctx.identifyAllies(alienPred(ctx));
        if (inputs.target == null) { ctx.noop('No tech used.'); return; }
        if (ctx.myVariant() === 0) ctx.lookCardSeat(inputs.target);
        else { ctx.placeToken('alienized', ctx.seatPos(inputs.target)); ctx.learn({ kind: 'alienized' }); }
      }
    },

    {
      id: 'synthetic', name: 'Synthetic', team: 'synth', solo: true, alien: true, wake: 1.0, maxCopies: 1,
      narrationGroup: 'alien',
      blurb: 'You wake with the Aliens, but your tech is too dangerous for anyone. You win only if you are eliminated.',
      prompt: 'Find the Aliens - but you serve only yourself.',
      narration: { open: 'The Synthetic wakes with the Aliens.', close: 'The Synthetic closes its eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { ctx.identifyAllies(alienPred(ctx)); }
    },

    {
      id: 'cow', name: 'Cow', team: 'village', wake: 1.6, maxCopies: 1,
      blurb: 'You sense whether an Alien sits right beside you.',
      prompt: 'Sense the night around you.',
      narration: { open: 'Cow, wake up - you sense if an Alien is beside you.', close: 'Cow, close your eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { var n = ctx.neighbors(ctx.self); ctx.learn({ kind: 'cowSense', alienAdjacent: n.some(function (s) { return ctx.roleHasFlag(ctx.actingRole(s), 'alien'); }) }); }
    },

    {
      id: 'groob', name: 'Groob', team: 'alien', alien: true, wake: 1.3, maxCopies: 1,
      narrationGroup: 'alien',
      blurb: 'An Alien - but if Zerb is also in play, you are frenemies and win only if Zerb dies and you live.',
      prompt: 'Find the others.',
      narration: { open: 'Groob wakes with the Aliens.', close: 'Groob closes their eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { ctx.identifyAllies(alienPred(ctx)); }
    },
    {
      id: 'zerb', name: 'Zerb', team: 'alien', alien: true, wake: 1.31, maxCopies: 1,
      narrationGroup: 'alien',
      blurb: 'An Alien - but if Groob is also in play, you are frenemies and win only if Groob dies and you live.',
      prompt: 'Find the others.',
      narration: { open: 'Zerb wakes with the Aliens.', close: 'Zerb closes their eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { ctx.identifyAllies(alienPred(ctx)); }
    },

    {
      id: 'leader', name: 'Leader', team: 'village', wake: 3.3, maxCopies: 1,
      blurb: 'You see who the Aliens are. (If both Groob and Zerb play, you win only if both of them survive.)',
      prompt: 'See who the Aliens are.',
      narration: { open: 'Leader, wake up - all Aliens, raise a thumb.', close: 'Aliens, lower your thumbs. Leader, close your eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { ctx.identifyAllies(alienPred(ctx)); }
    },

    {
      id: 'psychic', name: 'Psychic', team: 'village', wake: 5.7, maxCopies: 1, optional: true,
      blurb: 'You may read up to two players\' cards.',
      prompt: 'You may read up to two players.',
      narration: { open: 'Psychic, wake up. You may read up to two players\' cards.', close: 'Psychic, close your eyes.' },
      inputs: function (ctx) {
        return [
          { id: 'a', type: 'pickPlayer', label: 'Read whose card? (or skip)', exclude: [ctx.self], optional: true },
          { id: 'b', type: 'pickPlayer', label: 'And a second? (optional)', exclude: [ctx.self], optional: true }
        ];
      },
      act: function (ctx, inputs) {
        var did = false;
        if (inputs.a != null) { ctx.lookCardSeat(inputs.a); did = true; }
        if (inputs.b != null && inputs.b !== inputs.a) { ctx.lookCardSeat(inputs.b); did = true; }
        if (!did) ctx.noop('Psychic read no one.');
      }
    },

    {
      id: 'rascal', name: 'Rascal', team: 'village', wake: 7.6, maxCopies: 1, optional: true,
      blurb: 'You may swap two players\' cards, without looking.',
      prompt: 'You may swap two players\' cards.',
      narration: { open: 'Rascal, wake up. You may swap two players\' cards.', close: 'Rascal, close your eyes.' },
      inputs: function (ctx) {
        return [
          { id: 'a', type: 'pickPlayer', label: 'First player (or skip)', exclude: [ctx.self], optional: true },
          { id: 'b', type: 'pickPlayer', label: 'Second player', exclude: [ctx.self], optional: true }
        ];
      },
      act: function (ctx, inputs) { if (inputs.a == null || inputs.b == null || inputs.a === inputs.b) { ctx.noop('Rascal swapped no one.'); return; } ctx.swap(ctx.seatPos(inputs.a), ctx.seatPos(inputs.b)); }
    },

    {
      id: 'exposer', name: 'Exposer', team: 'village', wake: 10.2, maxCopies: 1, optional: true, variants: 3,
      blurb: 'Each game you may expose a set number of center cards for all to see (all of them or none).',
      prompt: 'You may expose center cards for the whole table.',
      narration: { open: 'Exposer, wake up. You may turn the signalled center cards face-up.', close: 'Exposer, close your eyes.' },
      inputs: function (ctx) {
        var k = (ctx.myVariant() % ctx.centerCount) + 1;
        return [
          { id: 'mode', type: 'choice', label: 'You may expose exactly ' + k + ' center card(s)', options: [{ value: 'yes', label: 'Expose ' + k }, { value: 'no', label: 'Expose none' }] },
          { id: 'centers', type: 'pickCenter', count: k, label: 'Which ' + k + '?', visibleWhen: { mode: 'yes' } }
        ];
      },
      act: function (ctx, inputs) { if (inputs.mode !== 'yes') { ctx.noop('Exposer exposed nothing.'); return; } inputs.centers.forEach(function (i) { ctx.revealCenter(i); }); }
    },

    {
      id: 'mortician', name: 'Mortician', team: 'mortician', solo: true, wake: 13.1, maxCopies: 1, variants: 3,
      blurb: 'You may peek at some neighbors. You win if one of your neighbors is eliminated.',
      prompt: 'You inspect those beside you.',
      narration: { open: 'Mortician, wake up - you may inspect your neighbors.', close: 'Mortician, close your eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { var v = ctx.myVariant(), n = ctx.neighbors(ctx.self); for (var i = 0; i < v && i < n.length; i++) ctx.lookCardSeat(n[i]); if (v === 0) ctx.noop('The mortician rests.'); }
    },

    {
      id: 'blob', name: 'Blob', team: 'blob', solo: true, wake: null, maxCopies: 1,
      blurb: 'You and the players beside you are one organism. You win if none of your cluster is eliminated.'
    }
  ];

  function onNewGame(state, h) {
    state.variants = {};
    state.players.forEach(function (p) { var r = h.REG[p.dealtRole]; if (r && r.variants) state.variants[p.seat] = h.rngInt(r.variants); });
  }
  function finalTeamOverride(state, seat) { return tokenAlien(state, seat) ? 'alien' : null; }

  function resolveOutcome(state, H) {
    var pc = state.players.length, s;
    var deaths = H.deaths; function died(x) { return deaths.indexOf(x) !== -1; } function role(x) { return H.finalRoleId(x); }
    function isAlien(x) { return H.roleFlag(x, 'alien') || tokenAlien(state, x); }

    var winners = {}; function add(t) { winners[t] = true; }
    var someoneDied = deaths.length > 0;
    // "alien in play" for village/alien outcome means a seat actually on the ALIEN TEAM - the
    // Synthetic carries the alien flag for night/targeting but is solo, so it must NOT make the
    // alien team "win" on its own.
    var aliensInPlay = 0, anyAlienDied = false, alienTeamInPlay = 0;
    for (s = 0; s < pc; s++) {
      if (isAlien(s)) { aliensInPlay++; if (died(s)) anyAlienDied = true; }
      if (H.finalTeamOf(s) === 'alien') alienTeamInPlay++;
    }

    var villageWins = anyAlienDied || (aliensInPlay === 0 && !someoneDied);
    var alienWins = alienTeamInPlay > 0 && !anyAlienDied;

    // Synthetic catastrophe: if it dies, only it wins; alien & village both lose.
    var synthSeat = -1; for (s = 0; s < pc; s++) if (role(s) === 'synthetic') synthSeat = s;
    if (synthSeat >= 0 && died(synthSeat)) { add('synth'); villageWins = false; alienWins = false; }

    // Groob & Zerb frenemies (only when both are dealt to players).
    var groob = -1, zerb = -1; for (s = 0; s < pc; s++) { if (role(s) === 'groob') groob = s; if (role(s) === 'zerb') zerb = s; }
    var bothFrenemies = groob >= 0 && zerb >= 0;
    if (bothFrenemies) {
      if (died(zerb) && !died(groob)) add('groob');
      if (died(groob) && !died(zerb)) add('zerb');
    }
    // Leader: with both frenemies in play, wins iff both survive; otherwise wins with the village.
    var leaderSeat = -1; for (s = 0; s < pc; s++) if (role(s) === 'leader') leaderSeat = s;
    if (leaderSeat >= 0 && bothFrenemies && !died(groob) && !died(zerb)) add('leader');

    if (villageWins) add('village');
    if (alienWins) add('alien');

    for (s = 0; s < pc; s++) if (role(s) === 'blob') { var nb = H.neighbors(s); if (![s].concat(nb).some(died)) add('blob'); }
    for (s = 0; s < pc; s++) if (role(s) === 'mortician') { if (H.neighbors(s).some(died)) add('mortician'); }
    for (s = 0; s < pc; s++) if (role(s) === 'tanner' && died(s)) add('tanner');

    return {
      winners: Object.keys(winners), deaths: deaths.slice(), disqualifiedSeats: [],
      teamsBySeat: state.players.map(function (p) { return H.finalTeamOf(p.seat); }),
      rolesBySeat: state.players.map(function (p) { return H.finalRoleId(p.seat); })
    };
  }

  var villageBase = BASE.roles.filter(function (r) { return ['werewolf', 'minion'].indexOf(r.id) === -1; });

  var presets = {
    3: ['alien', 'alien', 'seer', 'robber', 'villager', 'villager'],
    4: ['alien', 'alien', 'seer', 'robber', 'cow', 'villager', 'villager'],
    5: ['alien', 'alien', 'seer', 'robber', 'cow', 'oracle', 'villager', 'villager'],
    6: ['alien', 'synthetic', 'seer', 'robber', 'cow', 'oracle', 'psychic', 'villager', 'villager'],
    7: ['alien', 'synthetic', 'seer', 'robber', 'cow', 'oracle', 'psychic', 'exposer', 'villager', 'villager'],
    8: ['alien', 'alien', 'synthetic', 'seer', 'robber', 'cow', 'oracle', 'psychic', 'exposer', 'villager', 'villager'],
    9: ['alien', 'alien', 'synthetic', 'leader', 'seer', 'robber', 'cow', 'oracle', 'psychic', 'exposer', 'mortician', 'villager'],
    10: ['alien', 'alien', 'synthetic', 'leader', 'seer', 'robber', 'cow', 'oracle', 'psychic', 'exposer', 'mortician', 'rascal', 'villager']
  };

  return {
    game: 'alien',
    title: 'Alien',
    threatName: 'Alien',                            // the deck's antagonist name (warning wording only)
    roles: villageBase.concat(alien),
    presets: presets,
    centerCount: 3,
    defaultOptions: {},
    onNewGame: onNewGame,
    finalTeamOverride: finalTeamOverride,
    resolveOutcome: resolveOutcome,
    teams: [
      { id: 'village', name: 'Village', good: true },
      { id: 'alien', name: 'Aliens', good: false },
      { id: 'synth', name: 'Synthetic', solo: true },
      { id: 'blob', name: 'Blob', solo: true },
      { id: 'mortician', name: 'Mortician', solo: true },
      { id: 'groob', name: 'Groob', solo: true },
      { id: 'zerb', name: 'Zerb', solo: true },
      { id: 'leader', name: 'Leader' },
      { id: 'tanner', name: 'Tanner', solo: true }
    ]
  };
});
