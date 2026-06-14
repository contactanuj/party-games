/*
 * core-engine.js - shared rules engine for the social-deduction "night / vote / reveal"
 * family (Werewolf, Daybreak, Vampire, Alien). PURE: no DOM, no network.
 *
 * Design tenets (the correctness + secrecy backbone):
 *  - Deterministic given a seed: a single mulberry32 PRNG lives on state.rngState and is
 *    the ONLY source of randomness. Same (config, seed, inputs) => byte-identical state.
 *  - JSON-serializable state: only arrays/objects/primitives are stored on `state`, never
 *    functions/Map/Set, so it survives localStorage and a future network transport.
 *  - POSITIONS hold a cardId; CARDS hold a role. A swap is just exchanging cardIds between
 *    two positions, so Robber/Troublemaker/Drunk/Village-Idiot/Alpha-Wolf are one primitive.
 *  - players[seat].dealtRole is FROZEN at deal and is the ONLY thing the wake scheduler reads
 *    ("you always act as the role you were dealt, even after your card was swapped"). A
 *    player's TEAM at the end is read from the card currently in their seat (+ overrides).
 *  - INFORMATION BOUNDARY: the engine separates public state from per-seat private knowledge.
 *    `publicView(state)` exposes ONLY public data (names, alive/phase/progress) and never a
 *    role/team/card. Private knowledge is per-seat and surfaced only via privateReveal(seat).
 *    The UI must render shared screens from publicView() exclusively.
 *
 * The engine hardcodes NO role names - each game passes a role registry (data objects). This
 * file implements the framework + the base Werewolf-family win/vote rules; later games add
 * roles (which can carry their own win contributors / vote modifiers) and a few new mechanics
 * (tokens, marks) via the seams provided here.
 */
(function (root, factory) {
  var GC = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = GC;
  if (root) root.GameCore = GC;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Seeded PRNG (mulberry32) - deterministic + serialized via state.rngState.
  // ---------------------------------------------------------------------------
  function nextRand(state) {
    var t = (state.rngState = (state.rngState + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function randInt(state, n) { return Math.floor(nextRand(state) * n); }
  function shuffleInPlace(state, arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = randInt(state, i + 1);
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------------------------------------------------------------------
  // Engine factory. `def` describes ONE game; the returned api operates on plain state.
  //   def = { game, roles:[roleDef], presets:{n:[ids]}|fn, defaultOptions:{},
  //           centerCount=3, teams:[teamMeta], winContributors:[], voteModifiers:[] }
  // ---------------------------------------------------------------------------
  function createEngine(def) {
    if (!def || !def.roles) throw new Error('createEngine: def.roles is required.');
    var CENTER = def.centerCount == null ? 3 : def.centerCount;

    // Registry: id -> roleDef (frozen lookup, never stored on state).
    var REG = {};
    def.roles.forEach(function (r) {
      if (REG[r.id]) throw new Error('Duplicate role id: ' + r.id);
      REG[r.id] = r;
    });
    function role(id) {
      var r = REG[id];
      if (!r) throw new Error('Unknown role id: ' + id);
      return r;
    }
    function hasRole(id) { return !!REG[id]; }

    var DEFAULT_OPTIONS = def.defaultOptions || {};

    // ---- team / classification helpers (read the registry, not the engine) ----
    function teamOfRole(id) {
      var r = REG[id];
      if (!r) return 'unknown';
      return typeof r.team === 'function' ? r.team : r.team || 'village';
    }
    function isWerewolfRole(id) { return !!(REG[id] && REG[id].werewolf); }
    function isSoloRole(id) { return !!(REG[id] && REG[id].solo); }

    // =========================================================================
    // Config
    // =========================================================================
    function defaultNames(pc) {
      var out = [];
      for (var i = 0; i < pc; i++) out.push('Player ' + (i + 1));
      return out;
    }
    function presetRoleSet(pc) {
      var p = def.presets;
      var set = typeof p === 'function' ? p(pc) : (p && p[pc]);
      return set ? set.slice() : null;
    }
    // Build a faithful default config for a player count.
    function defaultConfig(playerCount, names) {
      var pc = playerCount || 3;
      var roleSet = presetRoleSet(pc);
      if (!roleSet) {
        // Synthesize a minimal legal set: enough villagers + the smallest werewolf presence.
        roleSet = [];
        var firstWolf = def.roles.filter(function (r) { return r.werewolf; })[0];
        var villager = def.roles.filter(function (r) { return r.id === 'villager'; })[0] || def.roles[0];
        if (firstWolf) roleSet.push(firstWolf.id);
        while (roleSet.length < pc + CENTER) roleSet.push(villager.id);
      }
      return {
        game: def.game,
        playerCount: pc,
        playerNames: (names && names.slice(0, pc)) || defaultNames(pc),
        roleSet: roleSet,
        centerCount: CENTER,
        options: deepClone(DEFAULT_OPTIONS),
        mode: 'digital',           // 'digital' | 'narrator'
        dayTimerSeconds: 0,        // 0 = no timer
        hideRoleHolders: true      // insert decoy handoffs so observers can't tell who has a role
      };
    }

    // ---- validation: errors block start; warnings are off-spec but playable ----
    function validateConfig(config) {
      var errors = [], warnings = [];
      var c = config;
      if (!c || typeof c !== 'object') return { ok: false, errors: ['No configuration provided.'], warnings: [] };

      var pc = c.playerCount;
      if (!(pc >= 3)) errors.push('Need at least 3 players.');
      if (pc > 10) warnings.push('More than 10 players is outside the tested range - balance is not guaranteed.');

      var roleSet = c.roleSet || [];
      var center = c.centerCount == null ? CENTER : c.centerCount;
      // The defining invariant of this game family: exactly `players + center` cards.
      if (roleSet.length !== pc + center) {
        errors.push('You have ' + roleSet.length + ' role card(s) but need exactly ' +
          (pc + center) + ' (' + pc + ' players + ' + center + ' center). Add or remove ' +
          Math.abs(roleSet.length - (pc + center)) + '.');
      }
      // Every role must exist in THIS game (no cross-game roles).
      var counts = {};
      roleSet.forEach(function (id) {
        counts[id] = (counts[id] || 0) + 1;
        if (!hasRole(id)) errors.push('Unknown role "' + id + '" for this game.');
      });
      // Per-role copy limits.
      Object.keys(counts).forEach(function (id) {
        var r = REG[id];
        if (r && r.maxCopies != null && counts[id] > r.maxCopies) {
          errors.push((r.name || id) + ': at most ' + r.maxCopies + ' allowed (you have ' + counts[id] + ').');
        }
        if (r && r.requiresEven && counts[id] % 2 !== 0) {
          errors.push((r.name || id) + ' must be added in pairs (you have ' + counts[id] + ').');
        }
      });

      // Names: one per player, non-empty, unique (duplicates are a soft warning).
      var names = c.playerNames || [];
      if (names.length !== pc) errors.push('You have ' + names.length + ' name(s) but ' + pc + ' player(s).');
      var seen = {};
      for (var i = 0; i < names.length; i++) {
        var nm = (names[i] || '').trim();
        if (!nm) { errors.push('Every player needs a name (player ' + (i + 1) + ' is blank).'); continue; }
        var key = nm.toLowerCase();
        if (seen[key]) warnings.push('Two players are both named "' + nm + '" - they will be hard to tell apart.');
        seen[key] = true;
      }

      // At least one waking-or-meaningful tension: warn if there is no way for the village to win
      // or no werewolf-team presence possible (purely informational; still playable).
      var anyWolfPossible = roleSet.some(isWerewolfRole);
      if (!anyWolfPossible) warnings.push('No Werewolf is in the card set - the village can only win by no one dying.');

      // Dependency warnings declared by roles (e.g. Insomniac wants a swapper; Mason wants 2).
      def.roles.forEach(function (r) {
        if (r.validate && counts[r.id]) {
          var msgs = r.validate({ counts: counts, config: c, has: function (id) { return !!counts[id]; } }) || [];
          msgs.forEach(function (m) {
            if (m && m.level === 'error') errors.push(m.text);
            else if (m && m.text) warnings.push(m.text);
          });
        }
      });

      // Game-supplied extra rules.
      (def.validateRules || []).forEach(function (rule) {
        var m = rule(c, { counts: counts, REG: REG });
        if (!m) return;
        if (m.level === 'error') errors.push(m.text); else warnings.push(m.text);
      });

      return { ok: errors.length === 0, errors: errors, warnings: warnings };
    }

    // =========================================================================
    // New game: deal cards, freeze dealt roles, build the wake schedule.
    // =========================================================================
    function newGame(config, seed) {
      var v = validateConfig(config);
      if (!v.ok) throw new Error('Invalid config: ' + v.errors.join(' '));
      var pc = config.playerCount;
      var center = config.centerCount == null ? CENTER : config.centerCount;

      var state = {
        schemaVersion: 1,
        game: def.game,
        mode: config.mode || 'digital',
        rngState: (seed >>> 0) || 1,
        config: deepClone(config),
        positions: {},
        cards: {},
        players: [],
        tokens: [],
        marks: null,          // games with a Mark system initialize this in a hook
        knowledge: {},        // seat -> [facts] (PRIVATE; never in publicView)
        faceUp: {},           // seat -> {role} cards a role turned face-up (PUBLIC by design)
        faceUpCenter: {},     // center index -> {role} center cards exposed (PUBLIC by design)
        variants: {},         // seat -> chosen action variant (e.g. Alien app-driven roles)
        schedule: [],
        cursor: 0,
        votes: {},            // seat -> target seat
        voteTally: null,
        deaths: [],
        phase: 'setup',
        log: [],
        result: null
      };

      // Build + shuffle the deck of role cards.
      var deck = config.roleSet.map(function (id, i) {
        return { id: 'card_' + i, role: id, copiedRole: null };
      });
      shuffleInPlace(state, deck);
      deck.forEach(function (card) { state.cards[card.id] = card; });

      // Assign first pc cards to seats, remaining `center` to center positions.
      for (var s = 0; s < pc; s++) {
        var card = deck[s];
        state.positions['p' + s] = { kind: 'seat', seat: s, cardId: card.id };
        state.players.push({
          seat: s,
          name: config.playerNames[s],
          number: s + 1,                 // stable "player number" (Alien addressing)
          dealtRole: card.role,          // FROZEN - drives wake order
          dealtCardId: card.id,
          copiedRole: null,              // Doppelgänger/Copycat acquired acting-identity
          alive: true,
          bot: false                     // set below from config.botCount (last N seats are bots)
        });
        state.knowledge[s] = [];
      }
      for (var ci = 0; ci < center; ci++) {
        var ccard = deck[pc + ci];
        state.positions['c' + ci] = { kind: 'center', index: ci, cardId: ccard.id };
      }

      // Reserved cards: a role in the set can require an EXTRA fixed card in its own slot
      // (e.g. the Alpha Wolf's "center werewolf" - a guaranteed Werewolf, not shuffled).
      var reservedSet = {};
      config.roleSet.forEach(function (id) { if (REG[id] && REG[id].reservedCenter) reservedSet[id] = REG[id].reservedCenter; });
      var ri = 0;
      Object.keys(reservedSet).forEach(function (id) {
        var cid = 'rcard_' + ri;
        state.cards[cid] = { id: cid, role: reservedSet[id], copiedRole: null, reserved: true };
        state.positions['rc' + ri] = { kind: 'reserved', index: ri, cardId: cid, forRole: id };
        ri++;
      });

      // Mark the last `botCount` seats as computer players (for fill-the-table / solo play).
      var botCount = Math.max(0, Math.min(pc - 1, config.botCount || 0));
      for (var bi = pc - botCount; bi < pc; bi++) state.players[bi].bot = true;

      // Per-game setup hook (e.g. Vampire deals a Clarity mark to every seat).
      if (def.onNewGame) def.onNewGame(state, helpers(state));

      buildSchedule(state);
      state.phase = (def.firstPhase && def.firstPhase(state)) || 'reveal';
      pushLog(state, 'Cards dealt. ' + pc + ' players, ' + center + ' in the center.');
      return state;
    }

    // The wake schedule: every player whose DEALT role has a wake number, in wake order.
    // Doppelgänger/Copycat may insert synthetic re-wake steps when they copy a late role.
    function buildSchedule(state) {
      var steps = [];
      state.players.forEach(function (p) {
        var r = REG[p.dealtRole];
        if (r && r.wake != null) {
          steps.push({ seat: p.seat, roleId: p.dealtRole, wake: r.wake, origin: 'dealt', done: false });
        }
      });
      steps.sort(function (a, b) {
        if (a.wake !== b.wake) return a.wake - b.wake;
        return a.seat - b.seat; // stable, deterministic tiebreak
      });
      steps.forEach(function (s, i) { s.idx = i; });
      state.schedule = steps;
      state.cursor = 0;
    }

    // =========================================================================
    // Helpers exposed to roles via ctx, and used internally.
    // =========================================================================
    function getPlayer(state, seat) { return state.players[seat]; }
    function nameOf(state, seat) { var p = state.players[seat]; return p ? p.name : '?'; }
    function pushLog(state, text, secret) { state.log.push({ text: text, secret: !!secret }); }
    function seatPos(seat) { return 'p' + seat; }
    function cardAt(state, pos) { return state.cards[state.positions[pos].cardId]; }
    function printedRoleAt(state, pos) { return cardAt(state, pos).role; }
    function isShielded(state, pos) {
      return state.tokens.some(function (t) { return t.type === 'shield' && t.onPosition === pos; });
    }
    // Acting identity of a seat during the night (frozen dealt role, unless it copied one).
    function actingRole(state, seat) {
      var p = state.players[seat];
      return p.copiedRole || p.dealtRole;
    }
    // End-of-game role/team of a seat: the card now in the seat (+ copied-role travel + overrides).
    function finalRoleId(state, seat) {
      // Per-game override (e.g. Daybreak Artifact tokens replace a card's end-game identity).
      if (def.finalRoleOverride) { var o = def.finalRoleOverride(state, seat, { tokensOn: tokensOn }); if (o) return o; }
      var card = cardAt(state, seatPos(seat));
      if (card.role === 'doppelganger' && card.copiedRole) return card.copiedRole;
      return card.role;
    }
    function tokensOn(state, pos) { return state.tokens.filter(function (t) { return t.onPosition === pos; }); }
    function finalTeamOf(state, seat) {
      // Per-game override hook (tokens/marks can change team) runs first.
      if (def.finalTeamOverride) {
        var t = def.finalTeamOverride(state, seat, { finalRoleId: finalRoleId, teamOfRole: teamOfRole, REG: REG });
        if (t) return t;
      }
      var rid = finalRoleId(state, seat);
      var tm = teamOfRole(rid);
      if (typeof tm === 'function') return tm(state, seat);
      return tm;
    }
    function isFinalWerewolf(state, seat) {
      if (def.isFinalWerewolfOverride) {
        var o = def.isFinalWerewolfOverride(state, seat);
        if (o != null) return o;
      }
      return isWerewolfRole(finalRoleId(state, seat));
    }
    function neighbors(state, seat) {
      var n = state.players.length;
      return [(seat - 1 + n) % n, (seat + 1) % n];
    }

    // The ctx object handed to a role's inputs()/act(). Closes over state + acting seat.
    function makeCtx(state, seat) {
      var p = state.players[seat];
      var learned = [];
      var ctx = {
        state: state,
        self: seat,
        selfName: p.name,
        role: REG[actingRole(state, seat)],
        dealtRole: p.dealtRole,
        options: state.config.options || {},
        players: state.players,
        playerCount: state.players.length,
        centerCount: Object.keys(state.positions).filter(function (k) { return k[0] === 'c'; }).length,
        rng: function () { return nextRand(state); },
        rngInt: function (n) { return randInt(state, n); },
        rngPick: function (arr) { return arr[randInt(state, arr.length)]; },
        seatPos: seatPos,
        centerPos: function (i) { return 'c' + i; },
        // ---- read ----
        printedRoleAt: function (pos) { return printedRoleAt(state, pos); },
        roleName: function (id) { return (REG[id] && REG[id].name) || id; },
        actingRole: function (s) { return actingRole(state, s); },
        actsAsWerewolf: function (s) { return isWerewolfRole(actingRole(state, s)); },
        roleIsWerewolf: function (id) { return isWerewolfRole(id); },
        roleHasFlag: function (id, flag) { return !!(REG[id] && REG[id][flag]); },
        neighbors: function (s) { return neighbors(state, s == null ? seat : s); },
        seatByNumber: function (num) {
          for (var i = 0; i < state.players.length; i++) if (state.players[i].number === num) return i;
          return null;
        },
        // ---- look (records private knowledge; respects Shield) ----
        lookCard: function (pos) {
          if (isShielded(state, pos)) { learned.push({ kind: 'blocked', pos: labelOf(state, pos) }); return null; }
          var rid = printedRoleAt(state, pos);
          var fact = { kind: 'sawCard', pos: labelOf(state, pos), role: rid, roleName: ctx.roleName(rid) };
          if (pos[0] === 'p') fact.seat = parseInt(pos.slice(1), 10); // seat index (bots use this)
          learned.push(fact);
          return rid;
        },
        lookCardSeat: function (s) { return ctx.lookCard(seatPos(s)); },
        identifyAllies: function (predicate) {
          var out = [];
          for (var i = 0; i < state.players.length; i++) {
            if (i === seat) continue;
            if (predicate(i)) out.push({ seat: i, name: state.players[i].name });
          }
          learned.push({ kind: 'allies', allies: out });
          return out;
        },
        // ---- mutate (respects Shield) ----
        swap: function (a, b) {
          if (isShielded(state, a) || isShielded(state, b)) { learned.push({ kind: 'swapBlocked' }); return false; }
          var tmp = state.positions[a].cardId;
          state.positions[a].cardId = state.positions[b].cardId;
          state.positions[b].cardId = tmp;
          pushLog(state, nameOf(state, seat) + ' moved cards.', true);
          return true;
        },
        transformSelf: function (newRoleId) {
          // Change the printed role of the card currently in my seat (PI, Witch-as-self).
          cardAt(state, seatPos(seat)).role = newRoleId;
        },
        copyRole: function (newRoleId) {
          // Doppelgänger: my acting identity AND my card's travelling identity become newRoleId.
          state.players[seat].copiedRole = newRoleId;
          var card = cardAt(state, seatPos(seat));
          if (card.role === 'doppelganger') card.copiedRole = newRoleId;
          learned.push({ kind: 'copied', role: newRoleId, roleName: ctx.roleName(newRoleId) });
        },
        placeToken: function (type, pos) {
          if (type !== 'shield' && isShielded(state, pos)) { learned.push({ kind: 'tokenBlocked' }); return false; }
          state.tokens.push({ id: 'tok_' + state.tokens.length, type: type, onPosition: pos });
          return true;
        },
        learn: function (fact) { learned.push(fact); },
        noop: function (reason) { learned.push({ kind: 'noop', reason: reason || '' }); },
        // Doppelgänger/Copycat: re-wake this seat to act as a copied role (immediate copies
        // run right now; group/late copies run at the copied role's natural wake position).
        roleHasWake: function (id) { return !!(REG[id] && REG[id].wake != null); },
        reWakeSelfAs: function (id) { scheduleReWake(state, seat, id); },
        // Reserved-slot access (e.g. Alpha Wolf's center werewolf card).
        reservedPos: function (forRoleId) {
          var keys = Object.keys(state.positions);
          for (var i = 0; i < keys.length; i++) { var p = state.positions[keys[i]]; if (p.kind === 'reserved' && p.forRole === forRoleId) return keys[i]; }
          return null;
        },
        // Cyclically shift the cards among a set of positions (Village Idiot). Shielded skipped.
        cycleCards: function (positions, dir) {
          var open = (positions || []).filter(function (p) { return !isShielded(state, p); });
          if (open.length < 2) { learned.push({ kind: 'noop', reason: 'Not enough movable cards.' }); return; }
          var ids = open.map(function (p) { return state.positions[p].cardId; });
          if (dir === 'right') ids.unshift(ids.pop()); else ids.push(ids.shift());
          open.forEach(function (p, i) { state.positions[p].cardId = ids[i]; });
          pushLog(state, nameOf(state, seat) + ' shifted everyone\'s cards.', true);
        },
        // Turn a player's card face-up for the whole table to see (Revealer). PUBLIC by design.
        revealFaceUp: function (targetSeat) {
          if (isShielded(state, seatPos(targetSeat))) { learned.push({ kind: 'noop', reason: 'That card is protected.' }); return; }
          state.faceUp[targetSeat] = { role: printedRoleAt(state, seatPos(targetSeat)) };
        },
        // Turn a CENTER card face-up for the whole table (Exposer). PUBLIC by design.
        revealCenter: function (i) { state.faceUpCenter[i] = { role: printedRoleAt(state, 'c' + i) }; },
        // App-chosen action variant for this seat, fixed at deal time (Alien app-driven roles).
        myVariant: function () { return state.variants[seat]; },
        // mark helpers attach only when a game initialized state.marks
        placeMark: function (type, targetSeat) { return placeMark(state, type, targetSeat, learned); },
        moveMark: function (fromSeat, toSeat) { return moveMark(state, fromSeat, toSeat, learned); },
        myMarkType: function () { return state.marks ? markTypeOfSeat(state, seat) : null; },
        markOfSeat: function (s) { return state.marks ? markTypeOfSeat(state, s) : null; },
        anyMark: function (type) { if (!state.marks) return false; for (var i = 0; i < state.players.length; i++) if (markTypeOfSeat(state, i) === type) return true; return false; },
        _learned: learned
      };
      return ctx;
    }

    function labelOf(state, pos) {
      if (pos[0] === 'c') return 'Center ' + (parseInt(pos.slice(1), 10) + 1);
      var seat = parseInt(pos.slice(1), 10);
      return nameOf(state, seat) + "'s card";
    }

    // ---- Mark system primitives (Vampire). Invariant: every seat holds exactly one mark;
    // a displaced mark returns to the pool. All mark changes go through here (single chokepoint).
    function markTypeOfSeat(state, seat) {
      var id = state.marks.bySeat['p' + seat];
      return id ? state.marks.byId[id].type : null;
    }
    function takeMarkFromPool(state, type) {
      var pool = state.marks.pool, i;
      for (i = 0; i < pool.length; i++) if (state.marks.byId[pool[i]].type === type) return pool.splice(i, 1)[0];
      // create one if the game permits (the registry of mark tokens is open by type)
      var id = 'mk_' + (Object.keys(state.marks.byId).length);
      state.marks.byId[id] = { id: id, type: type };
      return id;
    }
    function placeMark(state, type, targetSeat, learned) {
      if (!state.marks) throw new Error('This game has no Mark system.');
      var key = 'p' + targetSeat;
      var newId = takeMarkFromPool(state, type);
      var displaced = state.marks.bySeat[key];
      state.marks.bySeat[key] = newId;
      if (displaced != null) state.marks.pool.push(displaced);
      if (learned) learned.push({ kind: 'mark', target: targetSeat, type: type });
      assertMarkInvariant(state);
      return true;
    }
    function moveMark(state, fromSeat, toSeat, learned) {
      if (!state.marks) throw new Error('This game has no Mark system.');
      var fk = 'p' + fromSeat, tk = 'p' + toSeat;
      var moving = state.marks.bySeat[fk];
      var displaced = state.marks.bySeat[tk];
      state.marks.bySeat[tk] = moving;
      state.marks.bySeat[fk] = displaced; // swap (keeps the one-mark-per-seat invariant)
      if (learned) learned.push({ kind: 'markMove', from: fromSeat, to: toSeat });
      assertMarkInvariant(state);
      return true;
    }
    function assertMarkInvariant(state) {
      var seatCount = state.players.length;
      var seen = {};
      for (var s = 0; s < seatCount; s++) {
        var id = state.marks.bySeat['p' + s];
        if (id == null) throw new Error('Mark invariant: seat ' + s + ' has no mark.');
        if (seen[id]) throw new Error('Mark invariant: duplicate mark id ' + id);
        seen[id] = true;
      }
    }

    // helpers() - a small subset of ctx for engine-internal/per-game hooks (no acting seat).
    function helpers(state) {
      return {
        REG: REG, role: role, teamOfRole: teamOfRole,
        rngInt: function (n) { return randInt(state, n); },
        placeMark: function (t, s) { return placeMark(state, t, s); },
        cardAt: function (pos) { return cardAt(state, pos); },
        pushLog: function (t, secret) { pushLog(state, t, secret); }
      };
    }

    // =========================================================================
    // Night: step-by-step handoff. getStep() describes the current step for the UI;
    // submitStep() validates inputs, runs the role's act(), records private knowledge.
    // =========================================================================
    function currentStep(state) {
      if (state.cursor >= state.schedule.length) return null;
      return state.schedule[state.cursor];
    }

    // Describe the current step WITHOUT leaking anything to anyone but the acting seat.
    function getStep(state) {
      var step = currentStep(state);
      if (!step) return null;
      var seat = step.seat;
      var r = REG[actingRole(state, seat)];
      var ctx = makeCtx(state, seat);
      var inputs = (r.inputs ? r.inputs(ctx) : []) || [];
      // "Pre-info" the acting player is shown before deciding (e.g. ally lists are produced
      // by acting, so they are NOT pre-shown; this stays empty unless a role opts in).
      return {
        cursor: state.cursor,
        total: state.schedule.length,
        seat: seat,
        name: state.players[seat].name,
        roleId: r.id,
        roleName: r.name,
        prompt: r.prompt || (r.name + ', it is your turn.'),
        optional: !!r.optional,
        feared: !!(state.marks && markTypeOfSeat(state, seat) === 'fear'), // Mark of Fear: cannot act
        inputs: inputs
      };
    }

    function validateInputs(spec, inputs) {
      inputs = inputs || {};
      for (var i = 0; i < spec.length; i++) {
        var s = spec[i];
        if (!inputVisible(s, inputs)) continue;
        var val = inputs[s.id];
        var empty = (val == null || (Array.isArray(val) && val.length === 0));
        if (empty && !s.optional) return 'Please choose: ' + (s.label || s.id);
        if (s.type === 'pickCenter' && Array.isArray(val) && s.count && val.length !== s.count && !empty)
          return 'Pick exactly ' + s.count + '.';
      }
      return null;
    }
    function inputVisible(s, inputs) {
      if (!s.visibleWhen) return true;
      var key = Object.keys(s.visibleWhen)[0];
      return inputs[key] === s.visibleWhen[key];
    }

    function submitStep(state, inputs) {
      var step = currentStep(state);
      if (!step) throw new Error('No active night step.');
      var seat = step.seat;
      // Mark of Fear: this player cannot use their power tonight (action is skipped).
      if (state.marks && markTypeOfSeat(state, seat) === 'fear') {
        state.knowledge[seat] = (state.knowledge[seat] || []).concat([{ kind: 'feared' }]);
        step.done = true; state.cursor++;
        if (state._pendingInserts && state._pendingInserts.length) applyPendingInserts(state);
        maybeEndNight(state);
        return [{ kind: 'feared' }];
      }
      var r = REG[actingRole(state, seat)];
      var ctx = makeCtx(state, seat);
      var spec = (r.inputs ? r.inputs(ctx) : []) || [];
      var err = validateInputs(spec, inputs);
      if (err) throw new Error(err);
      if (r.act) r.act(ctx, inputs || {});
      // Persist what this seat privately learned (by value, at act-time).
      var facts = ctx._learned.slice();
      state.knowledge[seat] = (state.knowledge[seat] || []).concat(facts);
      step.done = true;
      state.cursor++;
      // Doppelgänger/Copycat may have requested a synthetic re-wake; honor pending inserts.
      if (state._pendingInserts && state._pendingInserts.length) {
        applyPendingInserts(state);
      }
      maybeEndNight(state);
      return facts; // the UI shows these to the acting player, then hides them.
    }

    // A role copying a LATE role (Insomniac/Revealer/Curator) schedules a re-wake right after it.
    function scheduleReWake(state, seat, roleId) {
      state._pendingInserts = state._pendingInserts || [];
      state._pendingInserts.push({ seat: seat, roleId: roleId });
    }
    function applyPendingInserts(state) {
      var inserts = state._pendingInserts;
      state._pendingInserts = [];
      inserts.forEach(function (ins) {
        var wake = REG[ins.roleId].wake;
        var insertAt;
        if (REG[ins.roleId].copyImmediate) {
          // Immediate copies (Seer/Robber/Troublemaker/Drunk) act right now, as the very next
          // step - exactly as the Doppelgänger does at the table (cursor already points past the
          // Doppelgänger's own step, so `cursor` is the next-to-run slot).
          insertAt = state.cursor;
        } else {
          // Group/late copies (Werewolf/Minion/Mason/Insomniac) re-wake at the copied role's
          // natural wake position (after a same-wake dealt step), so allies/own-card resolve.
          insertAt = state.schedule.length;
          for (var i = state.cursor; i < state.schedule.length; i++) {
            if (state.schedule[i].wake > wake) { insertAt = i; break; }
          }
        }
        if (insertAt < state.cursor) insertAt = state.cursor; // never re-run a passed step
        state.schedule.splice(insertAt, 0, {
          seat: ins.seat, roleId: ins.roleId, wake: wake,
          origin: 'rewake', done: false
        });
        state.schedule.forEach(function (s, i2) { s.idx = i2; });
      });
    }

    function maybeEndNight(state) {
      if (state.cursor >= state.schedule.length && state.phase === 'night') {
        state.phase = 'day';
        pushLog(state, 'Morning breaks. Time to discuss and vote.');
      }
    }

    function beginNight(state) {
      state.phase = 'night';
      state.cursor = 0;
      pushLog(state, 'Night falls.');
      return state;
    }

    // =========================================================================
    // Narrator mode: emit the ordered call/response script WITHOUT resolving anything.
    // =========================================================================
    function buildNarrationScript(state) {
      var lines = [];
      lines.push({ kind: 'all', text: 'Everyone, close your eyes.' });
      // Group consecutive same-wake roles (werewolves, masons) into one call.
      var byWake = {};
      var order = [];
      state.schedule.forEach(function (s) {
        if (s.origin !== 'dealt') return; // narrator uses the natural role order
        var key = REG[s.roleId].narrationGroup || s.roleId;
        if (!byWake[key]) { byWake[key] = { roleId: s.roleId, wake: REG[s.roleId].wake }; order.push(key); }
      });
      order.sort(function (a, b) { return byWake[a].wake - byWake[b].wake; });
      // de-dup roles already merged by group; emit each role's open/close once.
      var emitted = {};
      order.forEach(function (key) {
        var rid = byWake[key].roleId, r = REG[rid];
        if (emitted[r.id]) return; emitted[r.id] = true;
        var n = r.narration || {};
        var built = n.build ? n.build(state, REG) : null;
        if (built) { built.forEach(function (l) { lines.push(l); }); return; }
        if (n.open) lines.push({ kind: 'role', roleId: r.id, text: n.open });
        if (n.close) lines.push({ kind: 'role', roleId: r.id, text: n.close });
      });
      lines.push({ kind: 'all', text: 'Everyone, wake up.' });
      return lines;
    }

    // Narrator mode (physical cards): build the ordered call/response script directly from a
    // configured role SET (no deal needed). Each waking role is called once, in wake order.
    function narrationForRoleSet(roleSet) {
      var present = {};
      roleSet.forEach(function (id) { if (REG[id] && REG[id].wake != null) present[id] = true; });
      var ids = Object.keys(present).sort(function (a, b) { return REG[a].wake - REG[b].wake; });
      var lines = [{ kind: 'all', text: 'Everyone, close your eyes.' }];
      var emittedGroup = {};
      ids.forEach(function (id) {
        var r = REG[id];
        var grp = r.narrationGroup || id;
        if (emittedGroup[grp]) return; emittedGroup[grp] = true;
        var n = r.narration || {};
        var built = n.build ? n.build({ config: { roleSet: roleSet } }, REG) : null;
        if (built) { built.forEach(function (l) { lines.push(l); }); return; }
        if (n.open) lines.push({ kind: 'role', roleId: id, text: n.open });
        if (n.close) lines.push({ kind: 'role', roleId: id, text: n.close });
      });
      lines.push({ kind: 'all', text: 'Everyone, wake up.' });
      return lines;
    }

    // =========================================================================
    // Day vote + resolution. Simultaneous: each living player points at another.
    // =========================================================================
    function beginVote(state) {
      state.phase = 'vote';
      state.votes = {};
      return state;
    }
    function castVote(state, seat, targetSeat) {
      if (state.phase !== 'vote') throw new Error('Not voting.');
      if (seat === targetSeat) throw new Error('You must point at another player.');
      if (!state.players[targetSeat]) throw new Error('No such player.');
      state.votes[seat] = targetSeat;
      return state;
    }
    function allVotesIn(state) {
      for (var i = 0; i < state.players.length; i++) if (state.votes[i] == null) return false;
      return true;
    }

    // Base death rule: most-voted die; ties at the max all die; nobody dies if max <= 1.
    function baseDeaths(tally, playerCount) {
      var max = 0, s;
      for (s = 0; s < playerCount; s++) max = Math.max(max, tally[s] || 0);
      var deaths = [];
      if (max <= 1) return deaths; // a perfect spread => no one dies
      for (s = 0; s < playerCount; s++) if ((tally[s] || 0) === max) deaths.push(s);
      return deaths;
    }

    function resolveVotes(state, manualTally) {
      if (state.phase !== 'vote') throw new Error('Not voting.');
      var pc = state.players.length, s;
      var tally = [];
      for (s = 0; s < pc; s++) tally[s] = 0;
      if (manualTally) {
        for (s = 0; s < pc; s++) tally[s] = manualTally[s] || 0;
      } else {
        for (s = 0; s < pc; s++) { var t = state.votes[s]; if (t != null) tally[t] = (tally[t] || 0) + 1; }
      }
      state.voteTally = tally;

      var deaths = baseDeaths(tally, pc);

      // Vote modifiers from in-play roles (Hunter linked-kill, Bodyguard, Master, Lovers...).
      // Each runs with a small ctx and may add/remove deaths; iterate to a fixpoint.
      var modifiers = collectVoteModifiers(state);
      var changed = true, guard = 0;
      while (changed && guard++ < 50) {
        changed = false;
        for (var m = 0; m < modifiers.length; m++) {
          var before = deaths.slice();
          deaths = modifiers[m]({
            state: state, tally: tally, deaths: deaths,
            finalRoleId: function (seat) { return finalRoleId(state, seat); },
            finalTeamOf: function (seat) { return finalTeamOf(state, seat); },
            votes: state.votes
          }) || deaths;
          if (deaths.length !== before.length || before.some(function (x, i) { return deaths[i] !== x; })) changed = true;
        }
      }
      // de-dup + mark dead.
      var seen = {}; var clean = [];
      deaths.forEach(function (d) { if (!seen[d]) { seen[d] = true; clean.push(d); } });
      state.deaths = clean;
      clean.forEach(function (d) { state.players[d].alive = false; });

      resolveOutcome(state);
      state.phase = 'end';
      return state;
    }

    function collectVoteModifiers(state) {
      var mods = [];
      // gather from each in-play (by-seat) role's voteModifier
      var seenRole = {};
      state.players.forEach(function (p) {
        var rid = finalRoleId(state, p.seat);
        if (REG[rid] && REG[rid].voteModifier && !seenRole[rid]) { /* per-role, but applies per holder */ }
      });
      // Apply per holder (some modifiers need the specific seat), so build closures per seat.
      state.players.forEach(function (p) {
        var rid = finalRoleId(state, p.seat);
        var r = REG[rid];
        if (r && r.voteModifier) {
          mods.push(function (vc) { return r.voteModifier(vc, p.seat); });
        }
      });
      (def.voteModifiers || []).forEach(function (m) { mods.push(m); });
      return mods;
    }

    // =========================================================================
    // Win resolution - base Werewolf-family rules + composable per-role contributors.
    // Multiple teams can win. Returns result on state.result.
    // =========================================================================
    function resolveOutcome(state) {
      // A game with very different win conditions (e.g. Vampire/Alien teams) can fully replace
      // the base Werewolf-family resolution.
      if (def.resolveOutcome) {
        state.result = def.resolveOutcome(state, outcomeHelpers(state));
        pushLog(state, 'Winner(s): ' + ((state.result.winners || []).join(', ') || 'no one'));
        return state.result;
      }
      var pc = state.players.length, s;
      var deaths = state.deaths;
      var diedSet = {}; deaths.forEach(function (d) { diedSet[d] = true; });

      var wwSeats = [], tannerSeats = [], minionSeats = [];
      for (s = 0; s < pc; s++) {
        if (isFinalWerewolf(state, s)) wwSeats.push(s);
        var rid = finalRoleId(state, s);
        if (REG[rid] && REG[rid].tanner) tannerSeats.push(s);
        if (REG[rid] && REG[rid].minion) minionSeats.push(s);
      }
      var werewolfDied = deaths.some(function (d) { return isFinalWerewolf(state, d); });
      var someoneDied = deaths.length > 0;

      var winners = {}; // team -> true
      function add(team) { winners[team] = true; }

      // ---- base village / werewolf ----
      var villageWin = werewolfDied || (wwSeats.length === 0 && !someoneDied);
      var werewolfWin = wwSeats.length > 0 && !werewolfDied;

      // ---- minion: when there are no werewolves in play, the minion (werewolf team) wins
      //      if any non-minion player dies. ----
      if (wwSeats.length === 0 && minionSeats.length > 0) {
        var nonMinionDied = deaths.some(function (d) { return minionSeats.indexOf(d) === -1; });
        if (nonMinionDied) werewolfWin = true;
        else if (someoneDied) villageWin = true; // the village lynched only the Minion - they win
      }

      // ---- tanner (solo): wins iff a tanner dies; suppresses the werewolf win unless a
      //      werewolf also died (in which case the village also wins). ----
      var tannerDied = deaths.some(function (d) { return tannerSeats.indexOf(d) !== -1; });
      if (tannerDied) {
        add('tanner');
        if (werewolfDied) villageWin = true; else werewolfWin = false;
      }

      if (villageWin) add('village');
      if (werewolfWin) add('werewolf');

      // ---- composable extra contributors (later games: vampire/alien/solo roles) ----
      var wc = makeWinContext(state, deaths, diedSet, wwSeats, werewolfDied, someoneDied);
      collectWinContributors(state).forEach(function (c) {
        var verdict = c(wc);
        if (verdict && verdict.win && verdict.team) add(verdict.team);
        if (verdict && verdict.suppress) delete winners[verdict.suppress];
      });

      // Disqualifications (e.g. Disease: a voter for the marked player cannot win) - flag pass.
      var dq = {};
      collectDisqualifiers(state).forEach(function (d) { d(wc, dq); });

      state.result = {
        winners: Object.keys(winners),
        deaths: deaths.slice(),
        disqualifiedSeats: Object.keys(dq).map(Number),
        teamsBySeat: state.players.map(function (p) { return finalTeamOf(state, p.seat); }),
        rolesBySeat: state.players.map(function (p) { return finalRoleId(state, p.seat); })
      };
      pushLog(state, 'Winner(s): ' + (state.result.winners.join(', ') || 'no one'));
      return state.result;
    }

    // Helpers handed to a game's custom resolveOutcome (Vampire/Alien).
    function outcomeHelpers(state) {
      return {
        deaths: state.deaths.slice(),
        players: state.players,
        REG: REG,
        finalRoleId: function (s) { return finalRoleId(state, s); },
        finalTeamOf: function (s) { return finalTeamOf(state, s); },
        markOf: function (s) { return state.marks ? markTypeOfSeat(state, s) : null; },
        roleFlag: function (s, flag) { var r = REG[finalRoleId(state, s)]; return !!(r && r[flag]); },
        neighbors: function (s) { return neighbors(state, s); },
        votes: state.votes,
        died: function (s) { return state.deaths.indexOf(s) !== -1; }
      };
    }

    function makeWinContext(state, deaths, diedSet, wwSeats, werewolfDied, someoneDied) {
      return {
        state: state, deaths: deaths, diedSet: diedSet, players: state.players,
        finalRoleId: function (s) { return finalRoleId(state, s); },
        finalTeamOf: function (s) { return finalTeamOf(state, s); },
        isFinalWerewolf: function (s) { return isFinalWerewolf(state, s); },
        wwSeats: wwSeats, werewolfDied: werewolfDied, someoneDied: someoneDied,
        votes: state.votes, marks: state.marks, neighbors: function (s) { return neighbors(state, s); }
      };
    }
    function collectWinContributors(state) {
      var list = (def.winContributors || []).slice();
      var seen = {};
      state.players.forEach(function (p) {
        var rid = finalRoleId(state, p.seat);
        var r = REG[rid];
        if (r && r.winContributor && !seen[r.id + p.seat]) {
          seen[r.id + p.seat] = true;
          list.push(function (wc) { return r.winContributor(wc, p.seat); });
        }
      });
      return list;
    }
    function collectDisqualifiers(state) {
      var list = [];
      state.players.forEach(function (p) {
        var rid = finalRoleId(state, p.seat);
        var r = REG[rid];
        if (r && r.disqualifier) list.push(function (wc, dq) { return r.disqualifier(wc, dq, p.seat); });
      });
      return list;
    }

    // =========================================================================
    // Bot play - computer-controlled seats. Night actions are chosen legally (random via the
    // engine PRNG, so deterministic + replayable); votes use a light heuristic from the bot's
    // OWN private knowledge (never from anything a human couldn't also deduce).
    // =========================================================================
    function isBot(state, seat) { return !!(state.players[seat] && state.players[seat].bot); }
    function centerCountOf(state) { return Object.keys(state.positions).filter(function (k) { return k[0] === 'c'; }).length; }

    function botInputsForCurrent(state) {
      var step = currentStep(state); if (!step) return {};
      var seat = step.seat, r = REG[actingRole(state, seat)];
      var ctx = makeCtx(state, seat);
      var spec = (r.inputs ? r.inputs(ctx) : []) || [];
      var inputs = {};
      spec.forEach(function (s) {
        if (s.visibleWhen) { var k = Object.keys(s.visibleWhen)[0]; if (inputs[k] !== s.visibleWhen[k]) return; }
        if (s.type === 'choice') {
          inputs[s.id] = s.options[randInt(state, s.options.length)].value;
        } else if (s.type === 'pickPlayer') {
          var legal = [];
          for (var i = 0; i < state.players.length; i++) {
            if (i === seat) continue;
            if (s.exclude && s.exclude.indexOf(i) !== -1) continue;
            legal.push(i);
          }
          if (s.optional && nextRand(state) < 0.25) inputs[s.id] = null;
          else inputs[s.id] = legal.length ? legal[randInt(state, legal.length)] : null;
        } else if (s.type === 'pickCenter') {
          var idxs = []; for (var c = 0; c < centerCountOf(state); c++) idxs.push(c);
          shuffleInPlace(state, idxs);
          inputs[s.id] = idxs.slice(0, s.count || 1);
        }
      });
      return inputs;
    }

    // Resolve every consecutive bot night step until the next human (or night end).
    function autoResolveBotNight(state) {
      var n = 0;
      while (state.phase === 'night') {
        var step = currentStep(state);
        if (!step || !isBot(state, step.seat)) break;
        submitStep(state, botInputsForCurrent(state));
        if (n++ > 500) break;
      }
      return n;
    }

    function botVote(state, seat) {
      var pc = state.players.length;
      var meRole = actingRole(state, seat);
      var wolfAligned = isWerewolfRole(meRole) || (REG[meRole] && REG[meRole].minion);
      var know = state.knowledge[seat] || [];
      var allies = {}, knownWolves = [];
      know.forEach(function (f) {
        if (f.kind === 'allies') f.allies.forEach(function (a) { allies[a.seat] = true; });
        if (f.kind === 'sawCard' && f.seat != null && isWerewolfRole(f.role)) knownWolves.push(f.seat);
      });
      var others = [];
      for (var i = 0; i < pc; i++) if (i !== seat) others.push(i);
      if (wolfAligned) {
        // a wolf-aligned bot avoids voting its known partners
        var nonAllies = others.filter(function (i) { return !allies[i]; });
        var pool = nonAllies.length ? nonAllies : others;
        return pool[randInt(state, pool.length)];
      }
      // village/solo bot: prefer a known wolf, else a random other player
      var wolves = knownWolves.filter(function (i) { return i !== seat; });
      if (wolves.length) return wolves[randInt(state, wolves.length)];
      return others[randInt(state, others.length)];
    }
    function autoCastBotVotes(state) {
      for (var i = 0; i < state.players.length; i++) {
        if (isBot(state, i) && state.votes[i] == null) castVote(state, i, botVote(state, i));
      }
    }

    // =========================================================================
    // INFORMATION BOUNDARY - what the shared (public) screen may render.
    // Returns NOTHING that could identify a role/team/card before the end.
    // =========================================================================
    function publicView(state) {
      return {
        game: state.game,
        mode: state.mode,
        phase: state.phase,
        playerCount: state.players.length,
        centerCount: Object.keys(state.positions).filter(function (k) { return k[0] === 'c'; }).length,
        players: state.players.map(function (p) {
          return { seat: p.seat, name: p.name, number: p.number, alive: p.alive };
        }),
        // role-set CARDS in play are public knowledge in this family, but NOT who holds them:
        rolesInPlay: countRolesInPlay(state),
        nightProgress: { cursor: state.cursor, total: state.schedule.length },
        // Cards a role turned face-up are intentionally public (the table is meant to see them).
        revealedCards: Object.keys(state.faceUp).map(function (s) {
          var rid = state.faceUp[s].role;
          return { seat: +s, name: state.players[s].name, roleName: (REG[rid] || {}).name };
        }),
        revealedCenter: Object.keys(state.faceUpCenter || {}).map(function (i) {
          var rid = state.faceUpCenter[i].role;
          return { index: +i, roleName: (REG[rid] || {}).name };
        }),
        votesCast: Object.keys(state.votes).length,
        // results only exist after the game ends (state.result), surfaced separately:
        ended: state.phase === 'end'
      };
    }
    function countRolesInPlay(state) {
      var counts = {};
      state.config.roleSet.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; });
      return Object.keys(counts).map(function (id) {
        return { roleId: id, roleName: (REG[id] && REG[id].name) || id, count: counts[id], wake: REG[id] ? REG[id].wake : null };
      }).sort(function (a, b) {
        var aw = a.wake == null ? 999 : a.wake, bw = b.wake == null ? 999 : b.wake;
        return aw - bw;
      });
    }

    // PRIVATE: what a single seat is entitled to see (gated behind a per-player handoff).
    function privateReveal(state, seat) {
      return {
        seat: seat,
        name: state.players[seat].name,
        dealtRole: state.players[seat].dealtRole,
        dealtRoleName: (REG[state.players[seat].dealtRole] || {}).name,
        knowledge: (state.knowledge[seat] || []).slice(),
        // tokens on your card you are entitled to peek (e.g. a Daybreak Artifact)
        tokens: state.tokens.filter(function (t) { return t.onPosition === 'p' + seat; }).map(function (t) { return t.type; }),
        // your current Mark (Vampire), which you are entitled to know
        mark: state.marks ? markTypeOfSeat(state, seat) : null
      };
    }

    // Full truth - only valid AFTER the game ends (used by the end-of-night reveal/recap).
    function endReveal(state) {
      if (state.phase !== 'end') return null;
      return {
        winners: state.result.winners,
        deaths: state.deaths.slice(),
        seats: state.players.map(function (p) {
          return {
            seat: p.seat, name: p.name,
            dealtRole: p.dealtRole, dealtRoleName: (REG[p.dealtRole] || {}).name,
            finalRole: finalRoleId(state, p.seat), finalRoleName: (REG[finalRoleId(state, p.seat)] || {}).name,
            team: finalTeamOf(state, p.seat),
            alive: p.alive
          };
        }),
        center: Object.keys(state.positions).filter(function (k) { return k[0] === 'c'; }).map(function (pos) {
          var rid = printedRoleAt(state, pos);
          return { pos: pos, role: rid, roleName: (REG[rid] || {}).name };
        }),
        log: state.log.slice()
      };
    }

    // =========================================================================
    // Public api
    // =========================================================================
    return {
      game: def.game,
      registry: REG,
      // config
      defaultConfig: defaultConfig,
      validateConfig: validateConfig,
      defaultNames: defaultNames,
      presetRoleSet: presetRoleSet,
      // lifecycle
      newGame: newGame,
      rebuildSchedule: buildSchedule,
      beginNight: beginNight,
      buildNarrationScript: buildNarrationScript,
      narrationForRoleSet: narrationForRoleSet,
      // night
      getStep: getStep,
      submitStep: submitStep,
      currentStep: currentStep,
      scheduleReWake: scheduleReWake,
      // vote + outcome
      beginVote: beginVote,
      castVote: castVote,
      allVotesIn: allVotesIn,
      resolveVotes: resolveVotes,
      baseDeaths: baseDeaths,
      // bots
      isBot: isBot,
      botInputsForCurrent: botInputsForCurrent,
      autoResolveBotNight: autoResolveBotNight,
      botVote: botVote,
      autoCastBotVotes: autoCastBotVotes,
      // queries
      finalRoleId: finalRoleId,
      finalTeamOf: finalTeamOf,
      isFinalWerewolf: isFinalWerewolf,
      actingRole: actingRole,
      teamOfRole: teamOfRole,
      // boundary
      publicView: publicView,
      privateReveal: privateReveal,
      endReveal: endReveal,
      // seeded RNG (for deterministic UI decisions like decoy-handoff placement)
      rand: function (state) { return nextRand(state); },
      randInt: function (state, n) { return randInt(state, n); },
      // util
      serialize: function (state) { return JSON.stringify(state); },
      deserialize: function (s) { return JSON.parse(s); },
      _internals: { nextRand: nextRand, shuffleInPlace: shuffleInPlace, REG: REG }
    };
  }

  return { createEngine: createEngine, version: '0.1.0' };
});
