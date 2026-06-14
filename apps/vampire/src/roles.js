/*
 * roles.js (Vampire) - village roles plus the Vampire team and the Marks system.
 *   Marks: clarity (default), vampire (join the vampires), fear (can't act), bat (Renfield),
 *   disease (your voters can't win), love (death-linked lovers), traitor (win only if a
 *   teammate dies), assassin (the Assassin wins if you die).
 *   Roles: Copycat, Vampire, The Master, The Count, Renfield, Diseased, Cupid, Instigator,
 *   Priest, Assassin, Apprentice Assassin, Marksman, Pickpocket, Gremlin (+ base village roles).
 * UMD: Node tests require() this; the inlined browser bundle reads window.PARTY_GAME.
 */
(function (root, factory) {
  var BASE = (root && root.PARTY_BASE) ? root.PARTY_BASE : (function () {
    try { return require('@partydeck/core/roles/base-roles'); }
    catch (e) { return require('../../../packages/core/src/roles/base-roles.js'); }
  })();
  var G = factory(BASE);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  if (root) { root.PARTY_GAME = G; root.VAMPIRE_GAME = G; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (BASE) {
  'use strict';

  function markOf(state, seat) { if (!state.marks) return null; var id = state.marks.bySeat['p' + seat]; return id ? state.marks.byId[id].type : null; }
  function isVampirePred(ctx) { return function (s) { return ctx.roleHasFlag(ctx.actingRole(s), 'vampire'); }; }

  function vampirePlaceMark(ctx, target) {
    ctx.identifyAllies(isVampirePred(ctx));
    if (!ctx.anyMark('vampire') && target != null) ctx.placeMark('vampire', target); // one mark for the whole coven
  }

  var vampire = [
    {
      id: 'copycat', name: 'Copycat', team: function () { return 'village'; }, wake: -8, maxCopies: 1, optional: false,
      blurb: 'Look at a center card and become that role for the rest of the game.',
      prompt: 'View a center card - you become that role.',
      narration: { open: 'Copycat, wake up and look at one center card. You are now that role.', close: 'Copycat, close your eyes.' },
      inputs: function () { return [{ id: 'center', type: 'pickCenter', count: 1, label: 'Copy which center card?' }]; },
      act: function (ctx, inputs) {
        var copied = ctx.lookCard(ctx.centerPos(inputs.center[0]));
        if (!copied || copied === 'copycat') { ctx.noop('Nothing to copy.'); return; }
        ctx.copyRole(copied);
        if (ctx.roleHasWake(copied)) ctx.reWakeSelfAs(copied);
      }
    },

    {
      id: 'vampire', name: 'Vampire', team: 'vampire', vampire: true, wake: -6, maxCopies: 3,
      narrationGroup: 'vampire',
      blurb: 'Wake with the coven and mark a victim as one of you.',
      prompt: 'Find your coven and choose a victim to turn.',
      narration: { open: 'Vampires, wake and find each other, then give a non-vampire the Mark of the Vampire.', close: 'Vampires, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Mark whom as a Vampire?', exclude: [ctx.self], optional: true }]; },
      act: function (ctx, inputs) { vampirePlaceMark(ctx, inputs.target); }
    },

    {
      id: 'master', name: 'The Master', team: 'vampire', vampire: true, wake: -6, maxCopies: 1,
      narrationGroup: 'vampire',
      blurb: 'A Vampire who cannot be eliminated if a fellow vampire points at you.',
      prompt: 'Find your coven and choose a victim to turn.',
      narration: { open: 'The Master wakes with the Vampires.', close: 'The Master closes their eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Mark whom as a Vampire?', exclude: [ctx.self], optional: true }]; },
      act: function (ctx, inputs) { vampirePlaceMark(ctx, inputs.target); },
      voteModifier: function (vc, seat) {
        if (vc.deaths.indexOf(seat) === -1) return vc.deaths;
        var st = vc.state, protectedByVampire = false;
        for (var v = 0; v < st.players.length; v++) {
          if (vc.votes[v] === seat) {
            var mk = markOf(st, v), role = vc.finalRoleId(v);
            if (mk === 'vampire' || role === 'vampire' || role === 'master' || role === 'count') protectedByVampire = true;
          }
        }
        if (!protectedByVampire) return vc.deaths;
        var deaths = vc.deaths.filter(function (d) { return d !== seat; });
        if (deaths.length === 0) { var t = vc.tally.slice(); t[seat] = -1; var max = 0, i; for (i = 0; i < t.length; i++) max = Math.max(max, t[i]); if (max >= 2) for (i = 0; i < t.length; i++) if (t[i] === max) deaths.push(i); }
        return deaths;
      }
    },

    {
      id: 'count', name: 'The Count', team: 'vampire', vampire: true, wake: -6, maxCopies: 1,
      narrationGroup: 'vampire',
      blurb: 'A Vampire who also strikes a non-vampire with the Mark of Fear, silencing their power.',
      prompt: 'Find your coven, mark a victim, then instill Fear.',
      narration: { open: 'The Count wakes with the Vampires, then gives a non-vampire the Mark of Fear.', close: 'The Count closes their eyes.' },
      inputs: function (ctx) {
        return [
          { id: 'target', type: 'pickPlayer', label: 'Mark whom as a Vampire?', exclude: [ctx.self], optional: true },
          { id: 'fear', type: 'pickPlayer', label: 'Strike whom with the Mark of Fear?', exclude: [ctx.self], optional: true }
        ];
      },
      act: function (ctx, inputs) {
        vampirePlaceMark(ctx, inputs.target);
        if (inputs.fear != null && ctx.markOfSeat(inputs.fear) !== 'vampire') ctx.placeMark('fear', inputs.fear);
      }
    },

    {
      id: 'renfield', name: 'Renfield', team: 'vampire', wake: -5.5, maxCopies: 1,
      blurb: 'The vampires\' servant. You see the coven and take the Mark of the Bat. You win if no vampire dies.',
      prompt: 'See the coven and take the Mark of the Bat.',
      narration: { open: 'Renfield, wake up and see the Vampires, then take the Mark of the Bat.', close: 'Renfield, close your eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { ctx.identifyAllies(isVampirePred(ctx)); ctx.placeMark('bat', ctx.self); }
    },

    {
      id: 'diseased', name: 'Diseased', team: 'village', wake: -5, maxCopies: 1,
      blurb: 'Mark a neighbor with Disease - anyone who votes for them cannot win.',
      prompt: 'Mark a neighbor with Disease.',
      narration: { open: 'Diseased, wake up and mark the player to your left or right with Disease.', close: 'Diseased, close your eyes.' },
      inputs: function (ctx) {
        var n = ctx.neighbors(ctx.self);
        return [{ id: 'side', type: 'choice', label: 'Infect which neighbor?', options: [{ value: String(n[0]), label: 'Left' }, { value: String(n[1]), label: 'Right' }] }];
      },
      act: function (ctx, inputs) { ctx.placeMark('disease', parseInt(inputs.side, 10)); }
    },

    {
      id: 'cupid', name: 'Cupid', team: 'village', wake: -4, maxCopies: 1, optional: true,
      blurb: 'Link two players as Lovers - if one is eliminated, both are.',
      prompt: 'You may link two players in love.',
      narration: { open: 'Cupid, wake up. You may give two players the Mark of Love.', close: 'Cupid, close your eyes.' },
      inputs: function () {
        return [
          { id: 'a', type: 'pickPlayer', label: 'First lover (or skip)', allowSelf: true, optional: true },
          { id: 'b', type: 'pickPlayer', label: 'Second lover', allowSelf: true, optional: true }
        ];
      },
      act: function (ctx, inputs) {
        if (inputs.a == null || inputs.b == null || inputs.a === inputs.b) { ctx.noop('Cupid linked no one.'); return; }
        ctx.placeMark('love', inputs.a); ctx.placeMark('love', inputs.b);
      }
    },

    {
      id: 'instigator', name: 'Instigator', team: 'village', wake: -3, maxCopies: 1, optional: true,
      blurb: 'You may brand a player a Traitor - they win only if a teammate is eliminated.',
      prompt: 'You may give a player the Mark of the Traitor.',
      narration: { open: 'Instigator, wake up. You may give a player the Mark of the Traitor.', close: 'Instigator, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Brand whom? (or skip)', exclude: [ctx.self], optional: true }]; },
      act: function (ctx, inputs) { if (inputs.target == null) { ctx.noop('Instigator branded no one.'); return; } ctx.placeMark('traitor', inputs.target); }
    },

    {
      id: 'priest', name: 'Priest', team: 'village', wake: -2, maxCopies: 1,
      blurb: 'Cleanse yourself (Mark of Clarity) and, optionally, one other player - clearing any other mark.',
      prompt: 'Bless yourself, and optionally one other.',
      narration: { open: 'Priest, wake up. Give yourself a Mark of Clarity; you may also bless one other player.', close: 'Priest, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Also bless whom? (optional)', exclude: [ctx.self], optional: true }]; },
      act: function (ctx, inputs) { ctx.placeMark('clarity', ctx.self); if (inputs.target != null) ctx.placeMark('clarity', inputs.target); }
    },

    {
      id: 'assassin', name: 'Assassin', team: 'assassin', solo: true, wake: -1, maxCopies: 1,
      blurb: 'You win only if your marked target is eliminated. You play for no one else.',
      prompt: 'Mark your target for death.',
      narration: { open: 'Assassin, wake up and place the Mark of the Assassin on any player.', close: 'Assassin, close your eyes.' },
      inputs: function () { return [{ id: 'target', type: 'pickPlayer', label: 'Mark whom for death?', allowSelf: true }]; },
      act: function (ctx, inputs) { ctx.placeMark('assassin', inputs.target); }
    },

    {
      id: 'apprentice_assassin', name: 'Apprentice Assassin', team: 'assassin', solo: true, wake: -0.9, maxCopies: 1,
      blurb: 'You serve the Assassin. If there is none, you mark a target yourself.',
      prompt: 'Find the Assassin, or mark a target.',
      narration: { open: 'Apprentice Assassin, wake up. Find the Assassin, or mark a target if there is none.', close: 'Apprentice Assassin, close your eyes.' },
      inputs: function () { return [{ id: 'target', type: 'pickPlayer', label: 'If there is no Assassin, mark whom?', allowSelf: true, optional: true }]; },
      act: function (ctx, inputs) {
        if (!ctx.anyMark('assassin') && inputs.target != null) ctx.placeMark('assassin', inputs.target);
        else ctx.noop('You serve the Assassin.');
      }
    },

    {
      id: 'marksman', name: 'Marksman', team: 'village', wake: 5.4, maxCopies: 1, optional: true,
      blurb: 'You may view one player\'s card, or one player\'s Mark.',
      prompt: 'You may inspect a card or a Mark.',
      narration: { open: 'Marksman, wake up. You may view one player\'s card or one player\'s Mark.', close: 'Marksman, close your eyes.' },
      inputs: function (ctx) {
        return [
          { id: 'mode', type: 'choice', label: 'Inspect what?', options: [{ value: 'card', label: 'A card' }, { value: 'mark', label: 'A Mark' }, { value: 'skip', label: 'Nothing' }] },
          { id: 'target', type: 'pickPlayer', label: 'Of whom?', exclude: [ctx.self], visibleWhen: { mode: 'card' } },
          { id: 'mtarget', type: 'pickPlayer', label: 'Whose Mark?', exclude: [ctx.self], visibleWhen: { mode: 'mark' } }
        ];
      },
      act: function (ctx, inputs) {
        if (inputs.mode === 'card') ctx.lookCardSeat(inputs.target);
        else if (inputs.mode === 'mark') ctx.learn({ kind: 'sawMark', seat: inputs.mtarget, mark: ctx.markOfSeat(inputs.mtarget) });
        else ctx.noop('Marksman inspected nothing.');
      }
    },

    {
      id: 'pickpocket', name: 'Pickpocket', team: 'village', wake: 6.4, maxCopies: 1, optional: true,
      blurb: 'You may swap your Mark with another player\'s, then see your new Mark.',
      prompt: 'You may swap your Mark with someone\'s.',
      narration: { open: 'Pickpocket, wake up. You may swap your Mark with another player\'s, then view it.', close: 'Pickpocket, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Swap Marks with whom? (or skip)', exclude: [ctx.self], optional: true }]; },
      act: function (ctx, inputs) { if (inputs.target == null) { ctx.noop('Pickpocket did nothing.'); return; } ctx.moveMark(ctx.self, inputs.target); ctx.learn({ kind: 'sawMark', seat: ctx.self, mark: ctx.markOfSeat(ctx.self) }); }
    },

    {
      id: 'gremlin', name: 'Gremlin', team: 'village', wake: 7.4, maxCopies: 1, optional: true,
      blurb: 'You may switch two players\' Marks, OR two players\' cards (not both), without looking.',
      prompt: 'You may switch two Marks or two cards.',
      narration: { open: 'Gremlin, wake up. You may switch the Marks or the cards of two players.', close: 'Gremlin, close your eyes.' },
      inputs: function () {
        return [
          { id: 'mode', type: 'choice', label: 'Switch what?', options: [{ value: 'marks', label: 'Two Marks' }, { value: 'cards', label: 'Two cards' }, { value: 'skip', label: 'Nothing' }] },
          { id: 'a', type: 'pickPlayer', label: 'First player', allowSelf: true, visibleWhen: { mode: 'marks' } },
          { id: 'b', type: 'pickPlayer', label: 'Second player', allowSelf: true, visibleWhen: { mode: 'marks' } },
          { id: 'ca', type: 'pickPlayer', label: 'First player', allowSelf: true, visibleWhen: { mode: 'cards' } },
          { id: 'cb', type: 'pickPlayer', label: 'Second player', allowSelf: true, visibleWhen: { mode: 'cards' } }
        ];
      },
      act: function (ctx, inputs) {
        if (inputs.mode === 'marks' && inputs.a != null && inputs.b != null && inputs.a !== inputs.b) ctx.moveMark(inputs.a, inputs.b);
        else if (inputs.mode === 'cards' && inputs.ca != null && inputs.cb != null && inputs.ca !== inputs.cb) ctx.swap(ctx.seatPos(inputs.ca), ctx.seatPos(inputs.cb));
        else ctx.noop('Gremlin did nothing.');
      }
    }
  ];

  // Every seat starts with a Mark of Clarity.
  function onNewGame(state) {
    state.marks = { bySeat: {}, pool: [], byId: {} };
    for (var s = 0; s < state.players.length; s++) { var id = 'mk_' + s; state.marks.byId[id] = { id: id, type: 'clarity' }; state.marks.bySeat['p' + s] = id; }
  }

  // Mark of the Vampire puts you on the vampire team regardless of your card.
  function finalTeamOverride(state, seat) { return markOf(state, seat) === 'vampire' ? 'vampire' : null; }

  // Lovers die together.
  function loversLink(vc) {
    var st = vc.state; if (!st.marks) return vc.deaths;
    var love = []; for (var s = 0; s < st.players.length; s++) if (markOf(st, s) === 'love') love.push(s);
    if (love.length !== 2) return vc.deaths;
    var deaths = vc.deaths.slice();
    var aD = deaths.indexOf(love[0]) !== -1, bD = deaths.indexOf(love[1]) !== -1;
    if (aD && !bD) deaths.push(love[1]); else if (bD && !aD) deaths.push(love[0]);
    return deaths;
  }

  // Vampire win resolution (village vs vampires, plus solo/independent marks).
  function resolveOutcome(state, H) {
    var pc = state.players.length, s, o;
    var deaths = H.deaths;
    function died(x) { return deaths.indexOf(x) !== -1; }
    function role(x) { return H.finalRoleId(x); }
    function isVamp(x) { return markOf(state, x) === 'vampire' || H.roleFlag(x, 'vampire'); }

    var winners = {}; function add(t) { winners[t] = true; }
    var someoneDied = deaths.length > 0;

    var vampiresInPlay = 0, anyVampireDied = false;
    for (s = 0; s < pc; s++) if (isVamp(s)) { vampiresInPlay++; if (died(s)) anyVampireDied = true; }

    var villageWins = anyVampireDied || (vampiresInPlay === 0 && !someoneDied);
    var vampireWins = vampiresInPlay > 0 && !anyVampireDied;

    var tannerDied = false; for (s = 0; s < pc; s++) if (role(s) === 'tanner' && died(s)) tannerDied = true;
    if (tannerDied) { add('tanner'); if (!anyVampireDied) vampireWins = false; }

    if (villageWins) add('village');
    if (vampireWins) add('vampire');

    // Renfield: wins if no vampire dies (even if Renfield dies).
    for (s = 0; s < pc; s++) if ((role(s) === 'renfield' || markOf(state, s) === 'bat') && !anyVampireDied) add('renfield');

    // Assassin (solo): wins iff the assassin-marked player is eliminated.
    var assassinMarked = -1; for (s = 0; s < pc; s++) if (markOf(state, s) === 'assassin') assassinMarked = s;
    if (assassinMarked >= 0 && died(assassinMarked)) add('assassin');

    // Traitor: wins only if a different player on their team is eliminated.
    for (s = 0; s < pc; s++) if (markOf(state, s) === 'traitor') {
      var myTeam = H.finalTeamOf(s), teammateDied = false;
      for (o = 0; o < pc; o++) if (o !== s && H.finalTeamOf(o) === myTeam && died(o)) teammateDied = true;
      if (teammateDied) add('traitor');
    }

    // Disease: anyone who voted for a disease-marked player cannot win (flagged individually).
    var disease = []; for (s = 0; s < pc; s++) if (markOf(state, s) === 'disease') disease.push(s);
    var dq = {}; if (disease.length) for (var v = 0; v < pc; v++) { var tg = state.votes[v]; if (tg != null && disease.indexOf(tg) !== -1) dq[v] = true; }

    return {
      winners: Object.keys(winners),
      deaths: deaths.slice(),
      disqualifiedSeats: Object.keys(dq).map(Number),
      teamsBySeat: state.players.map(function (p) { return H.finalTeamOf(p.seat); }),
      rolesBySeat: state.players.map(function (p) { return H.finalRoleId(p.seat); })
    };
  }

  // Vampire is village vs vampires - drop the Werewolf-specific roles from the base set.
  var villageBase = BASE.roles.filter(function (r) { return ['werewolf', 'minion'].indexOf(r.id) === -1; });

  var presets = {
    3: ['vampire', 'vampire', 'seer', 'robber', 'villager', 'villager'],
    4: ['vampire', 'vampire', 'seer', 'robber', 'troublemaker', 'villager', 'villager'],
    5: ['vampire', 'vampire', 'seer', 'robber', 'troublemaker', 'diseased', 'villager', 'villager'],
    6: ['vampire', 'master', 'seer', 'robber', 'troublemaker', 'cupid', 'diseased', 'villager', 'villager'],
    7: ['vampire', 'master', 'seer', 'robber', 'troublemaker', 'cupid', 'marksman', 'priest', 'villager', 'villager'],
    8: ['vampire', 'master', 'count', 'seer', 'robber', 'troublemaker', 'cupid', 'marksman', 'priest', 'villager', 'villager'],
    9: ['vampire', 'master', 'count', 'renfield', 'seer', 'robber', 'troublemaker', 'cupid', 'marksman', 'pickpocket', 'priest', 'villager'],
    10: ['vampire', 'master', 'count', 'renfield', 'seer', 'robber', 'troublemaker', 'cupid', 'marksman', 'pickpocket', 'gremlin', 'priest', 'villager']
  };

  return {
    game: 'vampire',
    title: 'Vampire',
    roles: villageBase.concat(vampire),
    presets: presets,
    centerCount: 3,
    defaultOptions: {},
    onNewGame: onNewGame,
    finalTeamOverride: finalTeamOverride,
    resolveOutcome: resolveOutcome,
    voteModifiers: [loversLink],
    markDesc: {
      vampire: 'Mark of the Vampire - you are now a Vampire.',
      fear: 'Mark of Fear - you cannot use your power tonight.',
      bat: 'Mark of the Bat - Renfield\'s token.',
      disease: 'Mark of Disease - anyone who votes for you cannot win.',
      love: 'Mark of Love - you are linked to your lover; if one dies, both die.',
      traitor: 'Mark of the Traitor - you win only if a teammate is eliminated.',
      assassin: 'Mark of the Assassin - the Assassin wins if you are eliminated.'
    },
    teams: [
      { id: 'village', name: 'Village', good: true },
      { id: 'vampire', name: 'Vampires', good: false },
      { id: 'renfield', name: 'Renfield' },
      { id: 'assassin', name: 'Assassin', solo: true },
      { id: 'traitor', name: 'Traitor', solo: true },
      { id: 'tanner', name: 'Tanner', solo: true }
    ]
  };
});
