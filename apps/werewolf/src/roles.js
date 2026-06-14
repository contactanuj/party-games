/*
 * roles.js (Werewolf) - Werewolf is exactly the shared base roles, plus presets/meta.
 * Reads the shared base from window.PARTY_BASE (browser, inlined) or require (Node).
 * UMD: Node tests require() this; the inlined browser bundle reads window.PARTY_GAME.
 */
(function (root, factory) {
  var BASE = (root && root.PARTY_BASE) ? root.PARTY_BASE : (function () {
    try { return require('@partydeck/core/roles/base-roles'); }
    catch (e) { return require('../../../packages/core/src/roles/base-roles.js'); }
  })();
  var G = factory(BASE);
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  if (root) { root.PARTY_GAME = G; root.WEREWOLF_GAME = G; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (BASE) {
  'use strict';

  // Recommended presets per player count (cards = players + 3). Tuned for faithful balance.
  var presets = {
    3: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager'],
    4: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager', 'villager'],
    5: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'villager', 'villager', 'villager'],
    6: ['werewolf', 'werewolf', 'seer', 'robber', 'troublemaker', 'drunk', 'insomniac', 'villager', 'villager'],
    7: ['werewolf', 'werewolf', 'minion', 'seer', 'robber', 'troublemaker', 'drunk', 'insomniac', 'villager', 'villager'],
    8: ['werewolf', 'werewolf', 'minion', 'mason', 'mason', 'seer', 'robber', 'troublemaker', 'drunk', 'insomniac', 'villager'],
    9: ['werewolf', 'werewolf', 'minion', 'mason', 'mason', 'seer', 'robber', 'troublemaker', 'drunk', 'insomniac', 'hunter', 'villager'],
    10: ['werewolf', 'werewolf', 'minion', 'mason', 'mason', 'seer', 'robber', 'troublemaker', 'drunk', 'insomniac', 'hunter', 'tanner', 'villager']
  };

  return {
    game: 'werewolf',
    title: 'Werewolf',
    roles: BASE.roles,
    presets: presets,
    centerCount: 3,
    defaultOptions: { loneWolf: true },
    teams: [
      { id: 'village', name: 'Village', good: true },
      { id: 'werewolf', name: 'Werewolves', good: false },
      { id: 'tanner', name: 'Tanner', solo: true }
    ]
  };
});
