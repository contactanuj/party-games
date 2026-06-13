/*
 * roles.js (Daybreak) — the base roles plus Daybreak's signature roles and token mechanics:
 *   Sentinel (shield token), Alpha Wolf (center-werewolf card), Mystic Wolf, Dream Wolf,
 *   Apprentice Seer, Paranormal Investigator (joins what it sees), Witch (center-swap),
 *   Village Idiot (rotate the table), Revealer (face-up reveal), Curator (Artifact tokens),
 *   Bodyguard (protects a player at the vote).
 * UMD: Node tests require() this; the inlined browser bundle reads window.PARTY_GAME.
 */
(function (root, factory) {
  var BASE = (root && root.PARTY_BASE) ? root.PARTY_BASE : (function () {
    try { return require('@partydeck/core/roles/base-roles'); }
    catch (e) { return require('../../../packages/core/src/roles/base-roles.js'); }
  })();
  var G = factory(BASE);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  if (root) { root.PARTY_GAME = G; root.DAYBREAK_GAME = G; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (BASE) {
  'use strict';

  var ARTIFACT_BAG = ['claw', 'cudgel', 'brand', 'void'];
  var ARTIFACT_DESC = {
    claw: 'Claw of the Werewolf — you are now a Werewolf.',
    cudgel: 'Cudgel of the Tanner — you are now a Tanner (you win only if you die).',
    brand: 'Brand of the Villager — you are now a plain Villager.',
    void: 'Void of Nothingness — no effect.'
  };

  var daybreak = [
    {
      id: 'sentinel', name: 'Sentinel', team: 'village', wake: 0, maxCopies: 1, optional: true,
      blurb: 'Place a shield on another player\'s card — it cannot be viewed or moved all night.',
      prompt: 'You may shield one other player\'s card.',
      narration: { open: 'Sentinel, wake up. You may place a shield on any other player\'s card.', close: 'Sentinel, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Shield whose card? (or skip)', exclude: [ctx.self], optional: true }]; },
      act: function (ctx, inputs) { if (inputs.target == null) { ctx.noop('Sentinel placed no shield.'); return; } ctx.placeToken('shield', ctx.seatPos(inputs.target)); ctx.learn({ kind: 'shielded', target: inputs.target }); }
    },

    {
      id: 'alpha_wolf', name: 'Alpha Wolf', team: 'werewolf', werewolf: true, wake: 2.2, maxCopies: 1,
      reservedCenter: 'werewolf',
      blurb: 'Wake with the wolves, then turn another player into a Werewolf using the center Werewolf card.',
      prompt: 'Find your pack, then make a new Werewolf.',
      narration: { open: 'Alpha Wolf, wake with the Werewolves, then swap the center Werewolf card with another player\'s card.', close: 'Alpha Wolf, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Turn whose card into a Werewolf? (blind)', exclude: [ctx.self] }]; },
      act: function (ctx, inputs) {
        ctx.identifyAllies(function (s) { return ctx.actsAsWerewolf(s); });
        var rc = ctx.reservedPos('alpha_wolf');
        if (rc != null) ctx.swap(rc, ctx.seatPos(inputs.target));
      },
      validate: function () { return [{ level: 'warn', text: 'The Alpha Wolf adds an extra "center Werewolf" card automatically.' }]; }
    },

    {
      id: 'mystic_wolf', name: 'Mystic Wolf', team: 'werewolf', werewolf: true, wake: 2.3, maxCopies: 1, optional: true,
      blurb: 'Wake with the wolves, then you may peek at one other player\'s card.',
      prompt: 'Find your pack, then you may peek a card.',
      narration: { open: 'Mystic Wolf, wake with the Werewolves, then you may look at one other player\'s card.', close: 'Mystic Wolf, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Peek at whose card? (or skip)', exclude: [ctx.self], optional: true }]; },
      act: function (ctx, inputs) {
        ctx.identifyAllies(function (s) { return ctx.actsAsWerewolf(s); });
        if (inputs.target != null) ctx.lookCardSeat(inputs.target);
      }
    },

    {
      id: 'dream_wolf', name: 'Dream Wolf', team: 'werewolf', werewolf: true, wake: null, maxCopies: 1,
      blurb: 'You are a Werewolf, but you sleep through the night — you do not learn your pack (they know you).'
    },

    {
      id: 'apprentice_seer', name: 'Apprentice Seer', team: 'village', wake: 5.2, maxCopies: 1, optional: true,
      blurb: 'You may look at exactly one of the center cards.',
      prompt: 'You may look at one center card.',
      narration: { open: 'Apprentice Seer, wake up. You may look at one of the center cards.', close: 'Apprentice Seer, close your eyes.' },
      inputs: function () { return [{ id: 'mode', type: 'choice', label: 'Look?', options: [{ value: 'look', label: 'Look at one center card' }, { value: 'skip', label: 'Do not look' }] }, { id: 'center', type: 'pickCenter', count: 1, label: 'Which center card?', visibleWhen: { mode: 'look' } }]; },
      act: function (ctx, inputs) { if (inputs.mode === 'look' && inputs.center) ctx.lookCard(ctx.centerPos(inputs.center[0])); else ctx.noop('Apprentice Seer did not look.'); }
    },

    {
      id: 'paranormal_investigator', name: 'Paranormal Investigator', team: 'village', wake: 5.3, maxCopies: 1, optional: true,
      blurb: 'Look at up to two players\' cards one at a time; if you see a Werewolf or Tanner you stop and become it.',
      prompt: 'You may investigate up to two players.',
      narration: { open: 'Investigator, wake up. You may look at up to two players\' cards; if you see a Werewolf or the Tanner you stop and join them.', close: 'Investigator, close your eyes.' },
      inputs: function (ctx) {
        return [
          { id: 'first', type: 'pickPlayer', label: 'Investigate whose card? (or skip)', exclude: [ctx.self], optional: true },
          { id: 'second', type: 'pickPlayer', label: 'And a second card? (optional)', exclude: [ctx.self], optional: true }
        ];
      },
      act: function (ctx, inputs) {
        if (inputs.first == null) { ctx.noop('Investigator looked at no one.'); return; }
        var a = ctx.lookCardSeat(inputs.first);
        if (ctx.roleIsWerewolf(a)) { ctx.transformSelf('werewolf'); ctx.learn({ kind: 'piJoin', team: 'werewolf' }); return; }
        if (a === 'tanner') { ctx.transformSelf('tanner'); ctx.learn({ kind: 'piJoin', team: 'tanner' }); return; }
        if (inputs.second != null && inputs.second !== inputs.first) {
          var b = ctx.lookCardSeat(inputs.second);
          if (ctx.roleIsWerewolf(b)) { ctx.transformSelf('werewolf'); ctx.learn({ kind: 'piJoin', team: 'werewolf' }); }
          else if (b === 'tanner') { ctx.transformSelf('tanner'); ctx.learn({ kind: 'piJoin', team: 'tanner' }); }
        }
      }
    },

    {
      id: 'witch', name: 'Witch', team: 'village', wake: 6.2, maxCopies: 1, optional: true,
      blurb: 'You may look at a center card; if you do, you must swap it onto a player (maybe yourself).',
      prompt: 'You may look at a center card, then must place it on a player.',
      narration: { open: 'Witch, wake up. You may look at one center card; if you do, swap it with any player\'s card.', close: 'Witch, close your eyes.' },
      inputs: function () {
        return [
          { id: 'mode', type: 'choice', label: 'Use your magic?', options: [{ value: 'look', label: 'Look at a center card' }, { value: 'skip', label: 'Do nothing' }] },
          { id: 'center', type: 'pickCenter', count: 1, label: 'Which center card?', visibleWhen: { mode: 'look' } },
          { id: 'target', type: 'pickPlayer', label: 'Swap it onto whose card?', allowSelf: true, visibleWhen: { mode: 'look' } }
        ];
      },
      act: function (ctx, inputs) {
        if (inputs.mode !== 'look') { ctx.noop('Witch did nothing.'); return; }
        ctx.lookCard(ctx.centerPos(inputs.center[0]));
        ctx.swap(ctx.centerPos(inputs.center[0]), ctx.seatPos(inputs.target));
      }
    },

    {
      id: 'village_idiot', name: 'Village Idiot', team: 'village', wake: 7.2, maxCopies: 1, optional: true,
      blurb: 'You may shift every other player\'s card one seat left or right (shielded cards stay put).',
      prompt: 'You may move everyone else\'s card left or right.',
      narration: { open: 'Village Idiot, wake up. You may move all other players\' cards one seat to the left or right.', close: 'Village Idiot, close your eyes.' },
      inputs: function () { return [{ id: 'dir', type: 'choice', label: 'Shift the table?', options: [{ value: 'left', label: 'Everyone left' }, { value: 'right', label: 'Everyone right' }, { value: 'skip', label: 'Do nothing' }] }]; },
      act: function (ctx, inputs) {
        if (inputs.dir === 'skip') { ctx.noop('Village Idiot did nothing.'); return; }
        var positions = [];
        for (var s = 0; s < ctx.playerCount; s++) { if (s === ctx.self) continue; positions.push(ctx.seatPos(s)); }
        ctx.cycleCards(positions, inputs.dir);
      }
    },

    {
      id: 'revealer', name: 'Revealer', team: 'village', wake: 10, maxCopies: 1, optional: true,
      blurb: 'Flip one player\'s card face-up for all to see — unless it is a Werewolf or Tanner, which you flip back down.',
      prompt: 'You may flip one card face-up for everyone.',
      narration: { open: 'Revealer, wake up. You may turn one player\'s card face-up; if it is a Werewolf or Tanner, turn it back face-down.', close: 'Revealer, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Flip whose card? (or skip)', exclude: [ctx.self], optional: true }]; },
      act: function (ctx, inputs) {
        if (inputs.target == null) { ctx.noop('Revealer revealed nothing.'); return; }
        var r = ctx.lookCardSeat(inputs.target);
        if (ctx.roleIsWerewolf(r) || r === 'tanner') { ctx.learn({ kind: 'revealerHidden' }); return; } // flips back down (stays private to you)
        ctx.revealFaceUp(inputs.target);
      }
    },

    {
      id: 'curator', name: 'Curator', team: 'village', wake: 11, maxCopies: 1, optional: true,
      blurb: 'Place a face-down Artifact on a player (maybe yourself). It can change who they are at the end.',
      prompt: 'You may place a face-down Artifact on a player.',
      narration: { open: 'Curator, wake up. You may place a face-down Artifact token on any player\'s card.', close: 'Curator, close your eyes.' },
      inputs: function () { return [{ id: 'target', type: 'pickPlayer', label: 'Place an Artifact on whose card? (or skip)', allowSelf: true, optional: true }]; },
      act: function (ctx, inputs) {
        if (inputs.target == null) { ctx.noop('Curator placed no Artifact.'); return; }
        var art = ctx.rngPick(ARTIFACT_BAG);                    // chosen blindly — even you don't know which
        ctx.placeToken('artifact:' + art, ctx.seatPos(inputs.target));
        ctx.learn({ kind: 'placedArtifact' });
      }
    },

    {
      id: 'bodyguard', name: 'Bodyguard', team: 'village', wake: null, maxCopies: 1,
      blurb: 'At the vote, the player you point at cannot be eliminated.',
      // The Bodyguard's vote protects rather than condemns: their target can't die; if that
      // target had the most votes, the next-most-voted (needing >=2) dies instead.
      voteModifier: function (vc, seat) {
        var protectedSeat = vc.votes[seat];
        if (protectedSeat == null || vc.deaths.indexOf(protectedSeat) === -1) return vc.deaths;
        var deaths = vc.deaths.filter(function (d) { return d !== protectedSeat; });
        if (deaths.length === 0) {
          var tally = vc.tally.slice(); tally[protectedSeat] = -1;
          var max = 0, i; for (i = 0; i < tally.length; i++) max = Math.max(max, tally[i]);
          if (max >= 2) for (i = 0; i < tally.length; i++) if (tally[i] === max) deaths.push(i);
        }
        return deaths;
      }
    }
  ];

  // Artifact tokens override a player's end-game identity (Hunter/Tanner powers fall away too,
  // because the engine reads finalRoleId everywhere).
  function finalRoleOverride(state, seat, h) {
    var toks = h.tokensOn(state, 'p' + seat);
    for (var i = 0; i < toks.length; i++) {
      if (toks[i].type === 'artifact:claw') return 'werewolf';
      if (toks[i].type === 'artifact:cudgel') return 'tanner';
      if (toks[i].type === 'artifact:brand') return 'villager';
    }
    return null;
  }

  var presets = {
    3: ['werewolf', 'werewolf', 'seer', 'robber', 'sentinel', 'villager'],
    4: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'sentinel', 'villager'],
    5: ['werewolf', 'mystic_wolf', 'seer', 'robber', 'troublemaker', 'sentinel', 'revealer', 'villager'],
    6: ['werewolf', 'mystic_wolf', 'minion', 'seer', 'robber', 'troublemaker', 'sentinel', 'revealer', 'villager'],
    7: ['werewolf', 'mystic_wolf', 'minion', 'seer', 'apprentice_seer', 'robber', 'troublemaker', 'sentinel', 'revealer', 'curator'],
    8: ['werewolf', 'mystic_wolf', 'minion', 'seer', 'apprentice_seer', 'robber', 'troublemaker', 'witch', 'sentinel', 'revealer', 'curator'],
    9: ['werewolf', 'mystic_wolf', 'alpha_wolf', 'minion', 'seer', 'apprentice_seer', 'robber', 'troublemaker', 'witch', 'sentinel', 'revealer', 'curator'],
    10: ['werewolf', 'mystic_wolf', 'alpha_wolf', 'minion', 'seer', 'apprentice_seer', 'robber', 'troublemaker', 'witch', 'village_idiot', 'sentinel', 'revealer', 'curator']
  };

  return {
    game: 'daybreak',
    title: 'Daybreak',
    roles: BASE.roles.concat(daybreak),
    presets: presets,
    centerCount: 3,
    defaultOptions: { loneWolf: true },
    finalRoleOverride: finalRoleOverride,
    artifactDesc: ARTIFACT_DESC,
    teams: [
      { id: 'village', name: 'Village', good: true },
      { id: 'werewolf', name: 'Werewolves', good: false },
      { id: 'tanner', name: 'Tanner', solo: true }
    ]
  };
});
