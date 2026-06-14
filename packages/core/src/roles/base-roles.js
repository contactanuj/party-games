/*
 * base-roles.js - the shared base role definitions used by more than one game in the family
 * (Werewolf is just these; Daybreak/Vampire/Alien reuse them and add their own). Pure data +
 * small act()/inputs() handlers that drive the engine. No DOM.
 *
 * UMD: in the browser, the inlined script sets window.PARTY_BASE; Node requires it. App
 * roles.js files read PARTY_BASE.roles and concatenate their own roles onto it.
 *
 * Wake order (lower acts first; null = never wakes):
 *   -7 Doppelgänger · 2 Werewolf · 3 Minion · 4 Mason · 5 Seer · 6 Robber
 *    · 7 Troublemaker · 8 Drunk · 9 Insomniac · (Hunter/Tanner/Villager never wake)
 */
(function (root, factory) {
  var B = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
  if (root) root.PARTY_BASE = B;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  function wolfCount(ctx) {
    var n = 0;
    for (var s = 0; s < ctx.playerCount; s++) if (ctx.actsAsWerewolf(s)) n++;
    return n;
  }
  function inSet(state, id) { return state && state.config && state.config.roleSet && state.config.roleSet.indexOf(id) !== -1; }

  var roles = [
    {
      id: 'werewolf', name: 'Werewolf', team: 'werewolf', werewolf: true, wake: 2, maxCopies: 2,
      narrationGroup: 'werewolf',
      blurb: 'You and your fellow Werewolves wake to recognize each other. Survive the vote.',
      prompt: 'Open your eyes and find your fellow Werewolves.',
      narration: {
        open: 'Werewolves, wake up and look for other Werewolves.',
        close: 'Werewolves, close your eyes.',
        // expanded call when the Dream Wolf variant is present
        build: function (state) {
          if (!inSet(state, 'dream_wolf')) return null;
          return [
            { kind: 'role', roleId: 'werewolf', text: 'Werewolves except the Dream Wolf, wake up and look for other Werewolves. Dream Wolf, keep your eyes closed and raise a thumb.' },
            { kind: 'role', roleId: 'werewolf', text: 'Dream Wolf, lower your thumb. Werewolves, close your eyes.' }
          ];
        }
      },
      inputs: function (ctx) {
        var alone = wolfCount(ctx) === 1;
        if (alone && ctx.options.loneWolf) {
          return [
            { id: 'peek', type: 'choice', label: 'You are the lone Werewolf', options: [
              { value: 'yes', label: 'Peek at one center card' },
              { value: 'no', label: 'Do not peek' }
            ] },
            { id: 'center', type: 'pickCenter', count: 1, label: 'Which center card?', visibleWhen: { peek: 'yes' } }
          ];
        }
        return [];
      },
      act: function (ctx, inputs) {
        ctx.identifyAllies(function (s) { return ctx.actsAsWerewolf(s); });
        if (inputs.peek === 'yes' && inputs.center && inputs.center.length) ctx.lookCard(ctx.centerPos(inputs.center[0]));
      }
    },

    {
      id: 'minion', name: 'Minion', team: 'werewolf', minion: true, wake: 3, maxCopies: 1,
      blurb: 'You serve the Werewolves. You see them; they do not see you. Keep them safe.',
      prompt: 'See who the Werewolves are.',
      narration: { open: 'Minion, wake up. Werewolves, raise a thumb so the Minion can see you.', close: 'Werewolves, lower your thumbs. Minion, close your eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { ctx.identifyAllies(function (s) { return ctx.actsAsWerewolf(s); }); }
    },

    {
      id: 'mason', name: 'Mason', team: 'village', wake: 4, maxCopies: 2,
      narrationGroup: 'mason',
      blurb: 'You and the other Mason know each other to be on the village team.',
      prompt: 'Find the other Mason.',
      narration: { open: 'Masons, wake up and look for the other Mason.', close: 'Masons, close your eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { ctx.identifyAllies(function (s) { return ctx.actingRole(s) === 'mason'; }); },
      validate: function (q) { if (q.counts.mason % 2 !== 0) return [{ level: 'error', text: 'Masons come as a pair - use 0 or 2.' }]; return []; }
    },

    {
      id: 'seer', name: 'Seer', team: 'village', wake: 5, maxCopies: 1, optional: true, copyImmediate: true, idealCenter: 2,
      blurb: 'Look at one other player\'s card, OR two of the center cards.',
      prompt: 'You may look at one player\'s card or two center cards.',
      narration: { open: 'Seer, wake up. You may look at one other player\'s card, or two of the center cards.', close: 'Seer, close your eyes.' },
      inputs: function (ctx) {
        return [
          { id: 'mode', type: 'choice', label: 'How will you look?', options: [
            { value: 'player', label: 'One player\'s card' }, { value: 'center', label: 'Two center cards' }, { value: 'skip', label: 'Do not look' }
          ] },
          { id: 'player', type: 'pickPlayer', label: 'Whose card?', exclude: [ctx.self], visibleWhen: { mode: 'player' } },
          { id: 'centers', type: 'pickCenter', count: 2, label: 'Which two center cards?', visibleWhen: { mode: 'center' } }
        ];
      },
      act: function (ctx, inputs) {
        if (inputs.mode === 'player' && inputs.player != null) ctx.lookCardSeat(inputs.player);
        else if (inputs.mode === 'center' && inputs.centers) inputs.centers.forEach(function (i) { ctx.lookCard(ctx.centerPos(i)); });
        else ctx.noop('Seer chose not to look.');
      }
    },

    {
      id: 'robber', name: 'Robber', team: 'village', wake: 6, maxCopies: 1, optional: true, copyImmediate: true,
      blurb: 'You may swap your card with another player\'s, then look at your new card.',
      prompt: 'You may swap your card with another player\'s, then see your new card.',
      narration: { open: 'Robber, wake up. You may swap your card with another player\'s, then look at your new card.', close: 'Robber, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Rob whose card? (or skip)', exclude: [ctx.self], optional: true }]; },
      act: function (ctx, inputs) {
        if (inputs.target == null) { ctx.noop('Robber chose not to rob.'); return; }
        ctx.swap(ctx.seatPos(ctx.self), ctx.seatPos(inputs.target));
        ctx.lookCard(ctx.seatPos(ctx.self));
      }
    },

    {
      id: 'troublemaker', name: 'Troublemaker', team: 'village', wake: 7, maxCopies: 1, optional: true, copyImmediate: true,
      blurb: 'You may swap the cards of two other players, without looking at either.',
      prompt: 'You may swap two other players\' cards (you will not see them).',
      narration: { open: 'Troublemaker, wake up. You may swap the cards of two other players.', close: 'Troublemaker, close your eyes.' },
      inputs: function (ctx) {
        return [
          { id: 'a', type: 'pickPlayer', label: 'First player (or skip both)', exclude: [ctx.self], optional: true },
          { id: 'b', type: 'pickPlayer', label: 'Second player', exclude: [ctx.self], optional: true }
        ];
      },
      act: function (ctx, inputs) {
        if (inputs.a == null || inputs.b == null || inputs.a === inputs.b) { ctx.noop('Troublemaker swapped no one.'); return; }
        ctx.swap(ctx.seatPos(inputs.a), ctx.seatPos(inputs.b));
      }
    },

    {
      id: 'drunk', name: 'Drunk', team: 'village', wake: 8, maxCopies: 1, copyImmediate: true, minCenter: 1,
      blurb: 'You must swap your card with a center card, without looking. You no longer know who you are.',
      prompt: 'Swap your card with a center card (you will not see it).',
      narration: { open: 'Drunk, wake up and swap your card with a card from the center.', close: 'Drunk, close your eyes.' },
      inputs: function () { return [{ id: 'center', type: 'pickCenter', count: 1, label: 'Take which center card? (you will not see it)' }]; },
      act: function (ctx, inputs) { ctx.swap(ctx.seatPos(ctx.self), ctx.centerPos(inputs.center[0])); ctx.noop('You took a center card without looking.'); }
    },

    {
      id: 'insomniac', name: 'Insomniac', team: 'village', wake: 9, maxCopies: 1,
      blurb: 'At the end of the night you look at your own card to see if it changed.',
      prompt: 'Look at your own card.',
      narration: { open: 'Insomniac, wake up and look at your own card.', close: 'Insomniac, close your eyes.' },
      inputs: function () { return []; },
      act: function (ctx) { ctx.lookCard(ctx.seatPos(ctx.self)); },
      validate: function (q) {
        var swapper = q.has('robber') || q.has('troublemaker') || q.has('drunk') || q.has('witch') || q.has('village_idiot');
        if (!swapper) return [{ level: 'warn', text: 'Insomniac has little to do without a card-mover (Robber, Troublemaker, Drunk, Witch, Village Idiot) in play.' }];
        return [];
      }
    },

    {
      id: 'hunter', name: 'Hunter', team: 'village', wake: null, maxCopies: 1,
      blurb: 'If you die, the player you voted for dies too.',
      voteModifier: function (vc, seat) {
        if (vc.deaths.indexOf(seat) === -1) return vc.deaths;
        var tgt = vc.votes[seat];
        if (tgt != null && vc.deaths.indexOf(tgt) === -1) return vc.deaths.concat([tgt]);
        return vc.deaths;
      }
    },

    {
      id: 'tanner', name: 'Tanner', team: 'tanner', solo: true, tanner: true, wake: null, maxCopies: 1,
      blurb: 'You hate your life. You win only if you die. You are on no team.'
    },

    { id: 'villager', name: 'Villager', team: 'village', wake: null, blurb: 'No special ability - but definitely not a Werewolf.' },

    {
      id: 'doppelganger', name: 'Doppelgänger', team: function () { return 'village'; }, wake: -7, maxCopies: 1,
      blurb: 'View one player\'s card and become that role for the rest of the game.',
      prompt: 'View one player\'s card - you become that role.',
      narration: { open: 'Doppelgänger, wake up and look at one other player\'s card. You are now that role.', close: 'Doppelgänger, close your eyes.' },
      inputs: function (ctx) { return [{ id: 'target', type: 'pickPlayer', label: 'Copy whose card?', exclude: [ctx.self] }]; },
      act: function (ctx, inputs) {
        var copied = ctx.lookCardSeat(inputs.target);
        if (!copied || copied === 'doppelganger') { ctx.noop('Nothing to copy.'); return; }
        ctx.copyRole(copied);
        if (ctx.roleHasWake(copied)) ctx.reWakeSelfAs(copied);
      },
      validate: function () { return [{ level: 'warn', text: 'The Doppelgänger adds the most complexity - best added once the table knows the other roles.' }]; }
    }
  ];

  function byId() { var m = {}; roles.forEach(function (r) { m[r.id] = r; }); return m; }
  return { roles: roles, byId: byId, wolfCount: wolfCount };
});
