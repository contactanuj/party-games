/*
 * word-engine.js - shared rules engine for the "secret-word / find-the-outsider" family
 * (Imposter, Out of the Loop, Spyfall, and later The Chameleon). PURE: no DOM, no network.
 *
 * This is the SECOND engine in @partydeck/core, a sibling to core-engine.js (the Werewolf
 * "night/vote/reveal" family). Those games deal hidden ROLE CARDS and resolve a night of
 * swaps; THIS family hands every "insider" a shared SECRET (a word, a word-pair, or a
 * location+role) and hides it from one or more "outsiders", who must blend in while the
 * table hunts them by listening to clues / answers / questions, then voting.
 *
 * One engine, three games, by configuration - this is deliberate so that "every practical
 * variation" is a config flag on ONE well-tested core, not four diverging copies:
 *
 *   contentModel:                what the insiders share, and what the outsider lacks
 *     'word'          everyone gets the SAME word; the outsider gets nothing (Imposter, OotL)
 *     'wordPair'      insiders get word A, outsiders get the CLOSE word B (Undercover variant)
 *     'locationRoles' everyone gets the SAME location + a personal role; the spy gets nothing
 *   interaction:                 how information is exchanged before the vote
 *     'clues'         each player says one (recordable) word, in order (Imposter, Chameleon)
 *     'questions'     the APP poses questions; players answer in turn (Out of the Loop)
 *     'play'          free-form Q&A on a timer; accuse/guess can interrupt (Spyfall)
 *   guessMode:                   the caught outsider's escape hatch
 *     'free'          type/choose the secret word          'list'  pick from the master list
 *     'fromTopic'     pick a cell within one topic         'none'  no second chance
 *
 * Design tenets (shared verbatim with core-engine.js so both engines feel the same):
 *  - DETERMINISTIC given a seed: a single mulberry32 PRNG on state.rngState is the ONLY source
 *    of randomness, so (config, seed, inputs) => byte-identical state. Bots use this PRNG too,
 *    so a whole match (humans + bots) replays exactly.
 *  - JSON-SERIALIZABLE state: only arrays/objects/primitives on `state` (survives localStorage
 *    and a future network transport). No functions/Map/Set on state.
 *  - INFORMATION BOUNDARY (the secrecy backbone - read before touching the UI):
 *      publicState(state)  -> what a SHARED screen may render. Carries NOTHING that differs by
 *                             role: no isOutsider, no secret, no per-seat private data, and the
 *                             player list is byte-identical in shape for outsider and insider.
 *      revealFor(state,seat)-> a SINGLE seat's private secret, gated behind a "pass the device
 *                             to X" handoff. Shape-identical for outsider vs insider so neither
 *                             screen length, field set, nor timing can leak the role.
 *      endReveal(state)    -> the full truth, valid ONLY after the round/match ends.
 *    The UI MUST render every shared surface (lobby, progress, vote list, recheck list) from
 *    publicState() exclusively, and must show a secret only via a gated revealFor() handoff.
 */
(function (root, factory) {
  var WC = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = WC;
  if (root) root.WordCore = WC;
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

  // Phases visited depend on config (interaction phase is one of clues|questions|play):
  var PHASES = ['reveal', 'clues', 'questions', 'play', 'debate', 'vote', 'tally', 'guess', 'round_over', 'game_over'];
  var VOTING_MODES = ['table', 'open', 'secret'];
  var TIE_BREAKERS = ['dealer', 'revote', 'outsider_escapes'];
  var DEALER_ROTATIONS = ['outsider', 'clockwise', 'random'];
  var INTERACTIONS = ['clues', 'questions', 'play'];
  var GUESS_MODES = ['none', 'free', 'list', 'fromTopic'];

  // Outcomes are shared across all three games (named, not per-game, so scoring is uniform):
  var OUTCOMES = {
    escaped_undetected: 'escaped_undetected',     // the table never convicted the outsider
    caught_guessed: 'caught_guessed',             // outsider convicted, but guessed the secret -> escapes
    caught_failed: 'caught_failed',               // outsider convicted and failed the guess -> insiders win
    wrong_conviction: 'wrong_conviction',         // an INSIDER was convicted (outsider wins big)
    outsider_solved: 'outsider_solved'            // outsider self-revealed and named the secret (Spyfall spy)
  };

  // ===========================================================================
  // Engine factory. `def` describes ONE game; the returned api operates on plain state.
  // ===========================================================================
  function createEngine(def) {
    if (!def || !def.game) throw new Error('createEngine: def.game is required.');

    var OUTSIDER = def.outsider || { label: 'Outsider', plural: 'Outsiders' };
    var INSIDER = def.insider || { label: 'Insider', plural: 'Insiders' };
    var CONTENT_MODEL = def.contentModel || 'word';
    // contentModel is a CONFIG field (defaulting to the def's) so one game can offer variants:
    // e.g. Imposter "Classic" (model 'word', outsider blank) vs "Undercover" (model 'wordPair').
    var ALLOWED_MODELS = def.allowedContentModels || [CONTENT_MODEL];
    var DEFAULT_INTERACTION = def.interaction || 'clues';
    var DEFAULT_GUESS = def.guessMode || 'free';
    var CONTENT_MODELS = ['word', 'wordPair', 'locationRoles'];

    function outsiderLabel(n) { return n === 1 ? OUTSIDER.label : (OUTSIDER.plural || (OUTSIDER.label + 's')); }
    // Each content model is fed by exactly one pack type, so selecting a model also selects which
    // packs are eligible (a 'word' game ignores 'pairs' packs and vice-versa).
    function modelPackType(model) {
      return model === 'wordPair' ? 'pairs' : (model === 'locationRoles' ? 'locations' : 'words');
    }
    function modelOf(stateOrConfig) {
      var c = stateOrConfig && stateOrConfig.config ? stateOrConfig.config : stateOrConfig;
      return (c && c.contentModel) || CONTENT_MODEL;
    }

    // -------------------------------------------------------------------------
    // Config construction. defaultConfig is a FAITHFUL, START-READY config for a
    // player count; every variation the games support is a field here so the UI's
    // "settings" screen is just editing this object (then validateConfig guards it).
    // -------------------------------------------------------------------------
    function defaultNames(pc) {
      var out = [];
      for (var i = 0; i < pc; i++) out.push('Player ' + (i + 1));
      return out;
    }

    function defaultConfig(playerCount, names) {
      var pc = playerCount || 4;
      var base = {
        game: def.game,
        playerCount: pc,
        playerNames: (names && names.slice(0, pc)) || defaultNames(pc),
        botCount: 0,                       // last N seats are computer players (fill-the-table)

        // ---- content selection ----
        contentModel: CONTENT_MODEL,       // which variant: word | wordPair | locationRoles
        packIds: null,                     // null = all packs; or an array of pack ids to allow

        // ---- roles ----
        outsiderCount: 1,                  // how many outsiders this round (>=1, < playerCount)
        giveOutsiderHint: !!def.giveOutsiderHintDefault, // tell the outsider the CATEGORY (easier)

        // ---- interaction phase ----
        interaction: DEFAULT_INTERACTION,  // clues | questions | play
        cluesPerPlayer: 1,                 // clue rounds (each player speaks once per round)
        recordClues: true,                 // type each spoken clue so the debate can recap them
        questionsPerRound: 3,              // ('questions') how many app questions before the vote
        debatePhase: true,                 // an explicit "discuss now" step before voting
        timerSeconds: def.defaultTimerSeconds || 0, // discussion/play clock (0 = off)
        revealSeconds: def.revealSeconds == null ? 8 : def.revealSeconds, // auto-hide the secret card after N seconds (0 = manual only). Limits over-the-shoulder peeking - a UI concern, not a rule.

        // ---- catching the outsider ----
        accusationMode: def.defaultAccusationMode || 'vote', // 'vote' (one tally) | 'unanimous_anytime' (Spyfall)
        votingMode: 'open',                // table = report aloud | open = tap | secret = pass-to-vote
        revealVotes: true,                 // show who voted for whom (open/secret)
        tieBreaker: 'revote',              // dealer | revote | outsider_escapes
        outsiderGuesses: 1,                // guesses the outsider gets when caught
        guessMode: DEFAULT_GUESS,          // none | free | list | fromTopic
        caughtCanGuess: def.caughtCanGuessDefault !== false, // a CAUGHT outsider gets a guess (Spyfall: false - the spy's only guess is a voluntary stop)
        allowOutsiderEarlyGuess: !!def.allowOutsiderEarlyGuessDefault, // spy may stop & guess anytime

        // ---- scoring (named buckets cover all three games) ----
        scoring: true,
        winTarget: def.defaultWinTarget || 7,
        scoreOutsiderEscape: 2,            // outsider not caught
        scoreOutsiderGuess: 1,             // outsider caught but guessed the secret
        scoreInsiderCatch: 1,              // each insider, when the outsider is caught & fails
        scoreOutsiderSolved: 2,            // outsider self-reveal + correct secret (Spyfall)
        scoreWrongConviction: 2,           // outsider, when an insider is wrongly convicted
        scoreAccuserBonus: 0,              // extra to the insider who led a correct catch (Spyfall=1)

        // ---- flow / misc ----
        dealerRotation: 'clockwise',       // who starts next round: outsider | clockwise | random
        hideContentDuringVote: false       // ('fromTopic') hide the grid once clues are in
      };
      // Per-game default overrides (each game tweaks a handful of these).
      if (def.configDefaults) {
        var o = def.configDefaults(pc);
        for (var k in o) if (o.hasOwnProperty(k)) base[k] = o[k];
      }
      return base;
    }

    // -------------------------------------------------------------------------
    // Count authority. The MOST outsiders a player count can support while leaving the informed
    // players a strict majority (so the hunt is always fair). This is the single source of truth
    // for the "config must respect the player count" rule - the UI's steppers and normalizeConfig
    // both read it, so they can never drift from validateConfig.
    //   pc 3->1  4->1  5->2  6->2  7->3  8->3  9->4 ...
    // -------------------------------------------------------------------------
    function maxOutsiders(pc) { return Math.max(1, Math.ceil(pc / 2) - 1); }

    function clampInt(v, lo, hi, dflt) {
      v = Math.round(Number(v));
      if (!isFinite(v)) v = dflt;
      return Math.max(lo, Math.min(hi, v));
    }

    // normalizeConfig - coerce ANY config into a valid one for its (clamped) player count, in place.
    // After this, validateConfig() can only fail on things the user must type (e.g. a blank name) or
    // content selection - never on a count-vs-config contradiction. The UI calls this on load and
    // after every change so the screen can never present, or start, a self-contradictory setup.
    function normalizeConfig(config) {
      var c = config || {};
      var minP = def.minPlayers || 3, maxP = def.maxPlayers || 12;
      c.playerCount = clampInt(c.playerCount, minP, maxP, minP);
      var pc = c.playerCount;
      // names: exactly pc entries
      var names = (c.playerNames || []).slice(0, pc);
      while (names.length < pc) names.push('Player ' + (names.length + 1));
      c.playerNames = names;
      // counts that MUST respect the player count
      c.botCount = clampInt(c.botCount == null ? 0 : c.botCount, 0, pc - 1, 0);
      c.outsiderCount = clampInt(c.outsiderCount == null ? 1 : c.outsiderCount, 1, maxOutsiders(pc), 1);
      // other numeric guards (kept in sensible ranges so a stale/hand-edited value can't break a game)
      c.cluesPerPlayer = clampInt(c.cluesPerPlayer == null ? 1 : c.cluesPerPlayer, 1, 5, 1);
      c.questionsPerRound = clampInt(c.questionsPerRound == null ? 3 : c.questionsPerRound, 1, 12, 3);
      if (c.guessMode !== 'none') c.outsiderGuesses = clampInt(c.outsiderGuesses == null ? 1 : c.outsiderGuesses, 1, 5, 1);
      if (c.scoring) c.winTarget = clampInt(c.winTarget == null ? 7 : c.winTarget, 1, 50, 7);
      if (c.timerSeconds != null) c.timerSeconds = Math.max(0, clampInt(c.timerSeconds, 0, 36000, 0));
      if (c.revealSeconds != null) c.revealSeconds = Math.max(0, clampInt(c.revealSeconds, 0, 600, 0));
      // variant / interaction must be ones this game actually supports
      if (ALLOWED_MODELS.indexOf(modelOf(c)) === -1) c.contentModel = CONTENT_MODEL;
      if (def.allowedInteractions && def.allowedInteractions.indexOf(c.interaction) === -1) c.interaction = DEFAULT_INTERACTION;
      return c;
    }

    // -------------------------------------------------------------------------
    // Validation. errors block start; warnings are off-spec but still playable.
    // This is the guardrail that the "all variations" config can never produce a
    // broken or unwinnable game. `library` (optional) lets us warn on empty packs.
    // -------------------------------------------------------------------------
    function validateConfig(config, library) {
      var errors = [], warnings = [];
      var c = config;
      if (!c || typeof c !== 'object') return { ok: false, errors: ['No configuration provided.'], warnings: [] };

      var pc = c.playerCount;
      var minP = def.minPlayers || 3, maxP = def.maxPlayers || 12;
      if (typeof pc !== 'number' || pc !== Math.round(pc)) errors.push('Player count must be a whole number.');
      if (!(pc >= minP)) errors.push('You need at least ' + minP + ' players.');
      if (pc > maxP) errors.push('This game supports at most ' + maxP + ' players.');

      // Names: one per player, non-empty; duplicates are a soft warning.
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

      // Bots.
      if (c.botCount != null) {
        if (c.botCount < 0) errors.push('Bot count cannot be negative.');
        if (c.botCount >= pc) errors.push('At least one player must be human.');
        if (c.botCount > 0 && def.botsImpractical) {
          warnings.push('Heads-up: this is a talking game, so computer players can fill seats and vote but cannot truly bluff. They are best for learning the flow, not a full match.');
        }
      }

      // Bot count must be a whole number too.
      if (c.botCount != null && c.botCount !== Math.round(c.botCount)) errors.push('Bot count must be a whole number.');

      // Outsider count: must leave a clear majority of insiders, or the hunt is impossible.
      var oc = c.outsiderCount;
      if (oc != null && oc !== Math.round(oc)) errors.push('Number of ' + outsiderLabel(2) + ' must be a whole number.');
      if (!(oc >= 1)) errors.push('There must be at least 1 ' + OUTSIDER.label + '.');
      else if (oc >= pc) errors.push('The ' + outsiderLabel(2) + ' cannot be everyone - leave players in the know.');
      else if (oc >= Math.ceil(pc / 2)) errors.push('With ' + oc + ' ' + outsiderLabel(oc) + ' and only ' + pc + ' players, the informed players are not a majority - the hunt is unfair. Use at most ' + (Math.ceil(pc / 2) - 1) + '.');
      else if (oc > 1) warnings.push('More than one ' + OUTSIDER.label + ' is a team variant - they win/lose together. Balance shifts toward the ' + outsiderLabel(2) + '.');

      // Content model (variant).
      var model = modelOf(c);
      if (CONTENT_MODELS.indexOf(model) === -1) errors.push('Content model must be one of: ' + CONTENT_MODELS.join(', ') + '.');
      else if (ALLOWED_MODELS.indexOf(model) === -1) errors.push('This game does not support the "' + model + '" variant.');

      // Interaction phase.
      if (INTERACTIONS.indexOf(c.interaction) === -1) errors.push('Interaction must be one of: ' + INTERACTIONS.join(', ') + '.');
      if (def.allowedInteractions && def.allowedInteractions.indexOf(c.interaction) === -1) {
        errors.push('This game does not support the "' + c.interaction + '" interaction.');
      }
      if (c.interaction === 'clues' && !(c.cluesPerPlayer >= 1)) errors.push('Players need at least 1 clue round.');
      if (c.interaction === 'questions' && !(c.questionsPerRound >= 1)) errors.push('There must be at least 1 question per round.');
      if (c.timerSeconds != null && c.timerSeconds < 0) errors.push('The timer cannot be negative.');
      if (c.revealSeconds != null && c.revealSeconds < 0) errors.push('The reveal time cannot be negative.');

      // Catching.
      if (VOTING_MODES.indexOf(c.votingMode) === -1) errors.push('Voting mode must be one of: ' + VOTING_MODES.join(', ') + '.');
      if (TIE_BREAKERS.indexOf(c.tieBreaker) === -1) errors.push('Tie-breaker must be one of: ' + TIE_BREAKERS.join(', ') + '.');
      if (GUESS_MODES.indexOf(c.guessMode) === -1) errors.push('Guess mode must be one of: ' + GUESS_MODES.join(', ') + '.');
      if (c.guessMode !== 'none' && !(c.outsiderGuesses >= 1)) errors.push('The ' + OUTSIDER.label + ' needs at least 1 guess when caught.');

      // Scoring.
      if (c.scoring) {
        if (!(c.winTarget >= 1)) errors.push('The winning score must be at least 1 point.');
        var buckets = ['scoreOutsiderEscape', 'scoreOutsiderGuess', 'scoreInsiderCatch', 'scoreOutsiderSolved', 'scoreWrongConviction', 'scoreAccuserBonus'];
        for (var b = 0; b < buckets.length; b++) {
          if (c[buckets[b]] != null && c[buckets[b]] < 0) errors.push('Point values cannot be negative (' + buckets[b] + ').');
        }
        if (!c.scoreOutsiderEscape && !c.scoreOutsiderGuess && !c.scoreInsiderCatch && !c.scoreOutsiderSolved && !c.scoreWrongConviction) {
          warnings.push('All point values are 0 - nobody can ever reach the winning score.');
        }
      }

      if (DEALER_ROTATIONS.indexOf(c.dealerRotation) === -1) errors.push('Dealer rotation must be one of: ' + DEALER_ROTATIONS.join(', ') + '.');

      // Content availability (if a library was provided).
      if (library) {
        var avail = availablePacks(c, library);
        var items = avail.reduce(function (n, p) { return n + (p.items ? p.items.length : 0); }, 0);
        if (avail.length === 0 || items === 0) errors.push('No content matches your selection. Enable more packs.');
        else if (avail.length < 2) warnings.push('Only one content pack is selected - rounds will repeat quickly.');
        // locationRoles + guessMode:list needs enough locations to make a guess meaningful.
        if (modelOf(c) === 'locationRoles' && c.guessMode === 'list' && items < 6) {
          warnings.push('Fewer than 6 locations makes the ' + OUTSIDER.label + "'s final guess almost free.");
        }
      }

      // Game-supplied extra rules.
      (def.validateRules || []).forEach(function (rule) {
        var m = rule(c, { OUTSIDER: OUTSIDER, INSIDER: INSIDER });
        if (!m) return;
        if (m.level === 'error') errors.push(m.text); else warnings.push(m.text);
      });

      return { ok: errors.length === 0, errors: errors, warnings: warnings };
    }

    // -------------------------------------------------------------------------
    // Content library helpers. A pack is data:
    //   word:          { id, name, category, type:'words', items:[ 'Pizza' | {w:'Pizza', c:['cheese','slice']} ] }
    //   wordPair:      { id, name, category, type:'pairs', items:[ {a:'Coffee', b:'Tea', c:[...]} ] }
    //   locationRoles: { id, name, type:'locations', items:[ {name:'Bank', roles:['Teller',...7]} ] }
    // `c` (clue hints) are OPTIONAL and only feed the offline bots; humans never see them.
    // -------------------------------------------------------------------------
    function packMatchesConfig(p, c) {
      if (p.type !== modelPackType(modelOf(c))) return false; // a model only sees its own pack type
      if (c.packIds && c.packIds.length && c.packIds.indexOf(p.id) === -1) return false;
      return true;
    }
    function availablePacks(config, library) {
      return (library || []).filter(function (p) { return packMatchesConfig(p, config); });
    }
    function pickPack(state, library) {
      var avail = availablePacks(state.config, library);
      if (!avail.length) throw new Error('No content packs available for this configuration.');
      var recent = state.recentPackIds || [];
      var fresh = avail.filter(function (p) { return recent.indexOf(p.id) === -1; });
      var pool = fresh.length ? fresh : avail;
      return pool[randInt(state, pool.length)];
    }

    // Normalize an item to { display, clues:[...] } regardless of authored shorthand.
    function normItem(item) {
      if (typeof item === 'string') return { display: item, clues: [] };
      if (item.w != null) return { display: item.w, clues: item.c || [] };
      if (item.a != null) return { display: item.a, alt: item.b, clues: item.c || [] };
      if (item.name != null) return { display: item.name, roles: item.roles || [], clues: item.c || [] };
      return { display: String(item), clues: [] };
    }

    // -------------------------------------------------------------------------
    // Match / round lifecycle.
    // -------------------------------------------------------------------------
    function newGame(config, library, seed) {
      var v = validateConfig(config, library);
      if (!v.ok) throw new Error('Invalid config: ' + v.errors.join(' '));
      var state = {
        schemaVersion: 1,
        game: def.game,
        rngState: (seed >>> 0) || 1,
        config: deepClone(config),
        players: [],
        scores: {},            // seat -> cumulative points (persists across rounds)
        round: 0,
        dealerSeat: 0,
        recentPackIds: [],
        // per-round fields (populated by startRound)
        outsiderSeats: [],
        pack: null,
        secret: null,          // { model, display, alt?, index?, packId } - the truth (NEVER in publicState)
        seatSecret: {},        // seat -> private payload (role at location, near-word) - NEVER in publicState
        clueOrder: [],
        clueRound: 0,          // 0-based pass index (cluesPerPlayer passes)
        clueIdx: 0,
        clues: {},             // seat -> [text per pass]
        questionIdx: 0,
        accusations: [],       // ('unanimous_anytime') history of {accuser, accused, confirmed}
        votes: {},
        lastVotes: null,
        revoteCount: 0,
        accusedSeat: null,
        accuserSeat: null,     // who led the accusation (for the Spyfall accuser bonus)
        caught: false,
        guessesLeft: 0,
        guessHistory: [],
        outsiderGuessedCorrectly: false,
        outcome: null,
        roundScores: {},
        winnerSeats: null,
        phase: 'reveal',
        log: []
      };

      var pc = config.playerCount;
      var botCount = Math.max(0, Math.min(pc - 1, config.botCount || 0));
      for (var s = 0; s < pc; s++) {
        state.players.push({
          seat: s,
          name: config.playerNames[s],
          number: s + 1,
          bot: s >= pc - botCount   // last N seats are bots (mirrors core-engine.js)
        });
        state.scores[s] = 0;
      }
      state.dealerSeat = randInt(state, pc);
      startRound(state, library, true);
      return state;
    }

    function startRound(state, library, firstRound) {
      state.round++;
      if (!firstRound) rotateDealer(state);
      var pc = state.players.length;
      var c = state.config;

      // ---- assign outsider(s) ----
      var bag = []; for (var s = 0; s < pc; s++) bag.push(s);
      shuffleInPlace(state, bag);
      state.outsiderSeats = bag.slice(0, Math.max(1, c.outsiderCount)).sort(function (a, b) { return a - b; });

      // ---- pick content + the secret, and each seat's private payload ----
      var pack = pickPack(state, library);
      state.pack = { id: pack.id, name: pack.name, type: pack.type, category: pack.category || null };
      state.recentPackIds = (state.recentPackIds || []).concat([pack.id]);
      var availCount = availablePacks(c, library).length;
      var keep = Math.max(0, Math.min(state.recentPackIds.length, Math.floor(availCount / 2)));
      state.recentPackIds = state.recentPackIds.slice(state.recentPackIds.length - keep);

      state.seatSecret = {};
      assignSecret(state, pack);

      // ---- order of play: start clockwise from the dealer ----
      state.clueOrder = orderFrom(state, state.dealerSeat);
      state.clueRound = 0;
      state.clueIdx = 0;
      state.clues = {};
      state.questionIdx = 0;
      state.accusations = [];
      state.votes = {};
      state.lastVotes = null;
      state.revoteCount = 0;
      state.accusedSeat = null;
      state.accuserSeat = null;
      state.caught = false;
      state.guessesLeft = 0;
      state.guessHistory = [];
      state.outsiderGuessedCorrectly = false;
      state.outcome = null;
      state.roundScores = {};
      state.winnerSeats = null;
      state.phase = 'reveal';

      pushLog(state, 'Round ' + state.round + ' - ' + nameOf(state, state.dealerSeat) + ' starts. Pack: ' + pack.name + '.');
      return state;
    }

    // The heart of the secrecy: pick the truth + each seat's gated private payload.
    function assignSecret(state, pack) {
      var items = pack.items || [];
      var idx = randInt(state, items.length);
      var it = normItem(items[idx]);
      var isOut = {}; state.outsiderSeats.forEach(function (s) { isOut[s] = true; });
      var c = state.config;
      var CM = modelOf(state);

      if (CM === 'wordPair') {
        // Insiders get word A; outsiders get the CLOSE word B (they may not realize they differ).
        state.secret = { model: 'wordPair', display: it.display, alt: it.alt, index: idx, packId: pack.id };
        state.players.forEach(function (p) {
          state.seatSecret[p.seat] = { word: isOut[p.seat] ? (it.alt || null) : it.display };
        });
      } else if (CM === 'locationRoles') {
        // Everyone shares the location; each insider gets a distinct role; the spy gets none.
        state.secret = { model: 'locationRoles', display: it.display, index: idx, packId: pack.id };
        var roles = (it.roles || []).slice();
        shuffleInPlace(state, roles);
        var r = 0;
        state.players.forEach(function (p) {
          if (isOut[p.seat]) state.seatSecret[p.seat] = { location: null, roleAtLocation: null };
          else state.seatSecret[p.seat] = { location: it.display, roleAtLocation: roles[r++ % (roles.length || 1)] || null };
        });
      } else {
        // 'word': insiders share the word; the outsider gets nothing (optionally the category).
        state.secret = { model: 'word', display: it.display, index: idx, packId: pack.id };
        state.players.forEach(function (p) {
          state.seatSecret[p.seat] = { word: isOut[p.seat] ? null : it.display };
        });
      }
      // The outsider may be told the CATEGORY (a softer variant) - stored privately only.
      if (c.giveOutsiderHint) {
        state.outsiderSeats.forEach(function (s) {
          state.seatSecret[s] = state.seatSecret[s] || {};
          state.seatSecret[s].hint = pack.category || pack.name;
        });
      }
    }

    function rotateDealer(state) {
      var mode = state.config.dealerRotation;
      if (mode === 'outsider' && state.outsiderSeats && state.outsiderSeats.length) {
        state.dealerSeat = state.outsiderSeats[0];
      } else if (mode === 'random') {
        state.dealerSeat = randInt(state, state.players.length);
      } else {
        state.dealerSeat = (state.dealerSeat + 1) % state.players.length;
      }
    }

    // ---- helpers ----
    function getPlayer(state, seat) { return state.players[seat]; }
    function nameOf(state, seat) { var p = state.players[seat]; return p ? p.name : '?'; }
    function isOutsider(state, seat) { return state.outsiderSeats.indexOf(seat) !== -1; }
    function isBot(state, seat) { return !!(state.players[seat] && state.players[seat].bot); }
    function pushLog(state, text) { state.log.push({ round: state.round, text: text }); }
    function orderFrom(state, startSeat) {
      var out = [], n = state.players.length;
      for (var k = 0; k < n; k++) out.push((startSeat + k) % n);
      return out;
    }
    function secretDisplay(state) { return state.secret ? state.secret.display : null; }
    function effectiveGuesses(state) { return Math.max(1, state.config.outsiderGuesses || 1); }

    // What a single seat is privately entitled to see at the reveal. SHAPE-IDENTICAL for
    // outsider and insider (the UI renders the same boxes; only the values differ) so that
    // nothing about the layout/length/timing of this screen can betray the role.
    function revealFor(state, seat) {
      var priv = state.seatSecret[seat] || {};
      var out = isOutsider(state, seat);
      var info = {
        seat: seat,
        name: nameOf(state, seat),
        isOutsider: out,                 // the seat is allowed to know its OWN role
        outsiderLabel: OUTSIDER.label,
        insiderLabel: INSIDER.label,
        contentModel: modelOf(state),
        category: state.pack ? (state.pack.category || state.pack.name) : null,
        // The shared secret (or null when this seat is the outsider, unless a variant fills it):
        word: priv.word != null ? priv.word : null,
        location: priv.location != null ? priv.location : null,
        roleAtLocation: priv.roleAtLocation != null ? priv.roleAtLocation : null,
        hint: priv.hint != null ? priv.hint : null,
        // Team-variant: outsiders may know each other (config-able by the game).
        allies: out && def.outsidersKnowEachOther
          ? state.outsiderSeats.filter(function (s) { return s !== seat; }).map(function (s) { return nameOf(state, s); })
          : []
      };
      return info;
    }

    // -------------------------------------------------------------------------
    // Phase transitions: reveal -> interaction -> [debate] -> vote.
    // -------------------------------------------------------------------------
    function beginInteraction(state) {
      var c = state.config;
      state.phase = c.interaction; // 'clues' | 'questions' | 'play'
      if (state.phase === 'clues') pushLog(state, 'Clues begin with ' + nameOf(state, state.clueOrder[0]) + '.');
      else if (state.phase === 'questions') pushLog(state, 'Question round begins.');
      else pushLog(state, 'Discussion begins.');
      return state;
    }

    // ----- clues interaction -----
    function currentClueGiver(state) {
      if (state.phase !== 'clues') return null;
      return state.clueOrder[state.clueIdx];
    }
    function nextClue(state, word) {
      if (state.phase !== 'clues') throw new Error('Not in the clue phase.');
      var giver = state.clueOrder[state.clueIdx];
      if (state.config.recordClues && word != null) {
        state.clues[giver] = state.clues[giver] || [];
        state.clues[giver][state.clueRound] = ('' + word).slice(0, 40);
      }
      state.clueIdx++;
      if (state.clueIdx >= state.clueOrder.length) {
        state.clueIdx = 0;
        state.clueRound++;
        if (state.clueRound >= (state.config.cluesPerPlayer || 1)) {
          state.phase = state.config.debatePhase ? 'debate' : 'vote';
          if (state.phase === 'vote') beginVote(state);
          pushLog(state, 'All clues given.');
        }
      }
      return state;
    }

    // ----- questions interaction (app-driven) -----
    // The app holds the question text; the engine only tracks which question we are on and
    // advances after all seats have answered it (answers are spoken, not stored).
    function currentQuestionIndex(state) { return state.phase === 'questions' ? state.questionIdx : -1; }
    function nextQuestion(state) {
      if (state.phase !== 'questions') throw new Error('Not in the question phase.');
      state.questionIdx++;
      if (state.questionIdx >= (state.config.questionsPerRound || 1)) {
        state.phase = state.config.debatePhase ? 'debate' : 'vote';
        if (state.phase === 'vote') beginVote(state);
        pushLog(state, 'Questions complete.');
      }
      return state;
    }

    // ----- play interaction (Spyfall: free-form + timer; accuse/guess can interrupt) -----
    // Mid-round accusation: an accuser names a suspect; the table must UNANIMOUSLY agree
    // (everyone except the accused). The UI collects the show-of-hands and reports it here.
    function callAccusation(state, accuserSeat, accusedSeat, unanimous) {
      if (state.phase !== 'play' && state.phase !== 'debate') throw new Error('Cannot accuse right now.');
      if (accuserSeat === accusedSeat) throw new Error('You must accuse another player.');
      state.accusations.push({ accuser: accuserSeat, accused: accusedSeat, confirmed: !!unanimous });
      if (unanimous) {
        state.accusedSeat = accusedSeat;
        state.accuserSeat = accuserSeat;
        state.phase = 'tally';
        pushLog(state, nameOf(state, accuserSeat) + ' accuses ' + nameOf(state, accusedSeat) + ' - the table agrees.');
        return revealAccused(state);
      }
      pushLog(state, nameOf(state, accuserSeat) + ' accused ' + nameOf(state, accusedSeat) + ' - no agreement. Play continues.');
      return state;
    }
    // The outsider (spy) stops the clock and declares - moves straight to the guess.
    function outsiderReveal(state, seat) {
      if (!isOutsider(state, seat)) throw new Error('Only the ' + OUTSIDER.label + ' may stop the round to guess.');
      if (!state.config.allowOutsiderEarlyGuess) throw new Error('Early guessing is disabled for this game.');
      state.accusedSeat = seat;       // the outsider outs themselves
      state.caught = true;            // they are "revealed" - but via their own choice
      state.selfRevealed = true;
      state.guessesLeft = effectiveGuesses(state);
      state.guessHistory = [];
      state.phase = 'guess';
      pushLog(state, nameOf(state, seat) + ' stops the round to name the secret.');
      return state;
    }

    // The timer ran out (or the table calls a final vote) -> go to the structured vote.
    function beginVote(state) {
      state.phase = 'vote';
      state.votes = {};
      state.revoteCount = 0;
      return state;
    }

    // -------------------------------------------------------------------------
    // Voting for the suspect.
    // -------------------------------------------------------------------------
    function castVote(state, voterSeat, suspectSeat) {
      if (state.phase !== 'vote') throw new Error('Not in the voting phase.');
      if (!getPlayer(state, voterSeat)) throw new Error('Unknown voter.');
      if (!getPlayer(state, suspectSeat)) throw new Error('Unknown suspect.');
      if (voterSeat === suspectSeat) throw new Error('You cannot vote for yourself.');
      state.votes[voterSeat] = suspectSeat;
      return state;
    }
    function allVotesIn(state) {
      for (var i = 0; i < state.players.length; i++) if (state.votes[i] == null) return false;
      return true;
    }

    var MAX_REVOTES = 3;

    function resolveVotes(state) {
      if (state.phase !== 'vote') throw new Error('Not in the voting phase.');
      var tally = {};
      for (var v in state.votes) {
        if (!state.votes.hasOwnProperty(v)) continue;
        var s = state.votes[v];
        tally[s] = (tally[s] || 0) + 1;
      }
      var max = -1, leaders = [];
      for (var id in tally) {
        if (!tally.hasOwnProperty(id)) continue;
        if (tally[id] > max) { max = tally[id]; leaders = [Number(id)]; }
        else if (tally[id] === max) leaders.push(Number(id));
      }
      state.lastVotes = { tally: tally, leaders: leaders.slice(), manual: false, ballots: deepClone(state.votes) };
      return finishVote(state, leaders);
    }
    // table mode: the caller reports the accused (or an array for a reported tie).
    function resolveVotesManual(state, accusedOrLeaders) {
      if (state.phase !== 'vote') throw new Error('Not in the voting phase.');
      var leaders = Array.isArray(accusedOrLeaders) ? accusedOrLeaders.slice() : [accusedOrLeaders];
      state.lastVotes = { tally: null, leaders: leaders.slice(), manual: true, ballots: null };
      return finishVote(state, leaders);
    }

    function finishVote(state, leaders) {
      if (!leaders.length) {
        return concludeRound(state, null, OUTCOMES.escaped_undetected, 'No accusation was made - the ' + OUTSIDER.label + ' escapes.');
      }
      var accusedSeat;
      if (leaders.length === 1) {
        accusedSeat = leaders[0];
      } else {
        var tb = state.config.tieBreaker;
        if (tb === 'revote' && state.revoteCount < MAX_REVOTES) {
          state.revoteCount++;
          state.phase = 'vote';
          state.votes = {};
          state.lastVotes = { tally: null, leaders: leaders.slice(), manual: false, ballots: null, revote: true, revoteAmong: leaders.slice() };
          pushLog(state, 'Tied vote - revote (' + state.revoteCount + ').');
          return state;
        }
        if (tb === 'outsider_escapes') {
          return concludeRound(state, null, OUTCOMES.escaped_undetected, 'Tied vote - no one is accused, the ' + OUTSIDER.label + ' escapes.');
        }
        var dealerVote = state.votes[state.dealerSeat];
        accusedSeat = (dealerVote != null && leaders.indexOf(dealerVote) !== -1) ? dealerVote : leaders[0];
        pushLog(state, 'Tied vote - ' + nameOf(state, state.dealerSeat) + ' decides: ' + nameOf(state, accusedSeat) + '.');
      }
      state.accusedSeat = accusedSeat;
      state.phase = 'tally';
      pushLog(state, 'The table accuses ' + nameOf(state, accusedSeat) + '.');
      return state;
    }

    // Reveal the accused. Outsider caught -> they get to guess. Insider accused -> wrong conviction.
    function revealAccused(state) {
      if (state.phase !== 'tally') throw new Error('No accusation to reveal.');
      var seat = state.accusedSeat;
      state.caught = isOutsider(state, seat);
      if (!state.caught) {
        return concludeRound(state, seat, OUTCOMES.wrong_conviction,
          nameOf(state, seat) + ' is NOT the ' + OUTSIDER.label + '. The ' + outsiderLabel(state.outsiderSeats.length) + ' win!');
      }
      if (state.config.guessMode === 'none' || state.config.caughtCanGuess === false) {
        return concludeRound(state, seat, OUTCOMES.caught_failed,
          nameOf(state, seat) + ' IS the ' + OUTSIDER.label + '! Caught.');
      }
      state.guessesLeft = effectiveGuesses(state);
      state.guessHistory = [];
      state.phase = 'guess';
      pushLog(state, nameOf(state, seat) + ' IS the ' + OUTSIDER.label + '! ' +
        state.guessesLeft + ' guess' + (state.guessesLeft === 1 ? '' : 'es') + ' at the secret.');
      return state;
    }

    // The caught (or self-revealed) outsider guesses the secret.
    //   guessMode 'free': payload is a string; matched case-insensitively to the secret.
    //   guessMode 'list'/'fromTopic': payload is an index into the master list / topic.
    function outsiderGuess(state, payload) {
      if (state.phase !== 'guess') throw new Error('Not in the guessing phase.');
      var c = state.config, correct = false, label = '';
      if (c.guessMode === 'free') {
        var g = ('' + payload).trim().toLowerCase();
        correct = g.length > 0 && g === ('' + secretDisplay(state)).trim().toLowerCase();
        label = '' + payload;
        state.guessHistory.push(label);
      } else {
        var idx = payload | 0;
        if (state.guessHistory.indexOf(idx) !== -1) throw new Error('Already guessed that one.');
        state.guessHistory.push(idx);
        correct = idx === state.secret.index;
        label = '#' + idx;
      }
      state.guessesLeft--;
      var selfSolved = state.selfRevealed;
      if (correct) {
        state.outsiderGuessedCorrectly = true;
        var outc = selfSolved ? OUTCOMES.outsider_solved : OUTCOMES.caught_guessed;
        return concludeRound(state, state.accusedSeat, outc,
          'The ' + OUTSIDER.label + ' named "' + secretDisplay(state) + '" correctly!');
      }
      if (state.guessesLeft <= 0) {
        return concludeRound(state, state.accusedSeat, OUTCOMES.caught_failed,
          'Wrong. The secret was "' + secretDisplay(state) + '". The ' + outsiderLabel(state.outsiderSeats.length) + ' lose.');
      }
      pushLog(state, 'Wrong guess. ' + state.guessesLeft + ' left.');
      return state;
    }

    // -------------------------------------------------------------------------
    // Round conclusion + scoring. One scoring routine, driven by named buckets, so
    // every game's scoring is the same code with different point values.
    // -------------------------------------------------------------------------
    function concludeRound(state, accusedSeat, outcome, message) {
      state.accusedSeat = accusedSeat;
      state.outcome = outcome;
      state.roundScores = {};
      state.players.forEach(function (p) { state.roundScores[p.seat] = 0; });
      var c = state.config;
      var outs = state.outsiderSeats;

      if (c.scoring) {
        if (outcome === OUTCOMES.escaped_undetected) {
          outs.forEach(function (s) { state.roundScores[s] += c.scoreOutsiderEscape; });
        } else if (outcome === OUTCOMES.caught_guessed) {
          outs.forEach(function (s) { state.roundScores[s] += c.scoreOutsiderGuess; });
        } else if (outcome === OUTCOMES.outsider_solved) {
          outs.forEach(function (s) { state.roundScores[s] += c.scoreOutsiderSolved; });
        } else if (outcome === OUTCOMES.wrong_conviction) {
          outs.forEach(function (s) { state.roundScores[s] += c.scoreWrongConviction; });
        } else if (outcome === OUTCOMES.caught_failed) {
          state.players.forEach(function (p) {
            if (!isOutsider(state, p.seat)) state.roundScores[p.seat] += c.scoreInsiderCatch;
          });
          // Spyfall: the insider who LED the correct accusation gets a bonus.
          if (c.scoreAccuserBonus && state.accuserSeat != null && !isOutsider(state, state.accuserSeat)) {
            state.roundScores[state.accuserSeat] += c.scoreAccuserBonus;
          }
        }
        for (var id in state.roundScores) {
          if (state.roundScores.hasOwnProperty(id)) state.scores[id] += state.roundScores[id];
        }
      }

      pushLog(state, message);

      if (c.scoring) {
        var leaders = matchLeaders(state);
        if (leaders.atTarget.length > 0) {
          state.winnerSeats = leaders.atTarget;
          state.phase = 'game_over';
          pushLog(state, 'Match over - ' + leaders.atTarget.map(function (s) { return nameOf(state, s); }).join(', ') +
            ' reached ' + c.winTarget + '.');
          return state;
        }
      }
      state.phase = 'round_over';
      return state;
    }

    function matchLeaders(state) {
      var c = state.config, max = -Infinity, atMax = [], atTarget = [];
      state.players.forEach(function (p) {
        var sc = state.scores[p.seat];
        if (sc > max) { max = sc; atMax = [p.seat]; }
        else if (sc === max) atMax.push(p.seat);
      });
      if (c.scoring) atMax.forEach(function (s) { if (state.scores[s] >= c.winTarget) atTarget.push(s); });
      return { max: max, atMax: atMax, atTarget: atTarget };
    }
    function standings(state) {
      return state.players.map(function (p) { return { seat: p.seat, name: p.name, score: state.scores[p.seat] }; })
        .sort(function (a, b) { return b.score - a.score; });
    }
    function nextRound(state, library) {
      if (state.phase === 'game_over') throw new Error('The match is over.');
      startRound(state, library, false);
      return state;
    }
    function rematch(state, library, seed) { return newGame(state.config, library, seed); }

    // =========================================================================
    // Bot play - computer-controlled seats fill the table for solo/practice. Mirrors the
    // werewolf bot philosophy: choices come from the engine PRNG (deterministic + replayable),
    // and a bot may use ONLY its own private knowledge (never anything a human couldn't deduce).
    // NOTE: these are TALKING games, so bots can fill seats, give a templated clue, answer, and
    // vote - but they cannot truly bluff. def.botsImpractical surfaces that honestly to the UI.
    // =========================================================================
    function botClueText(state, seat) {
      var priv = state.seatSecret[seat] || {};
      // Insider bot: emit an authored clue hint for the secret if available, else a generic one.
      if (!isOutsider(state, seat)) {
        var clues = (state.pack && state._packClues) ? state._packClues : null;
        var bank = clues && clues[state.secret.index] ? clues[state.secret.index] : [];
        if (bank.length) return bank[randInt(state, bank.length)];
        return GENERIC_SAFE[randInt(state, GENERIC_SAFE.length)];
      }
      // Outsider bot: it has no word, so it bluffs with a safe generic term (cannot truly fake).
      return GENERIC_SAFE[randInt(state, GENERIC_SAFE.length)];
    }
    var GENERIC_SAFE = ['interesting', 'common', 'classic', 'everyday', 'familiar', 'tricky', 'depends', 'sometimes'];

    function autoAdvanceClues(state) {
      var n = 0;
      while (state.phase === 'clues' && isBot(state, currentClueGiver(state))) {
        nextClue(state, botClueText(state, currentClueGiver(state)));
        if (n++ > 500) break;
      }
      return n;
    }
    // Bot vote: a light, NON-cheating heuristic. A bot cannot see who the outsider is, so it
    // votes a random other seat, mildly biased AWAY from seats that gave a recorded clue (a
    // missing/blank clue looks more suspicious) - exactly what a human has to go on.
    function botVote(state, seat) {
      var pc = state.players.length, others = [];
      for (var i = 0; i < pc; i++) if (i !== seat) others.push(i);
      // weight: blank/short clue -> more suspicious. (Outsider bots also use this; they have no
      // extra info to exploit, keeping bots fair.)
      var weights = others.map(function (i) {
        var arr = state.clues[i] || [];
        var gave = arr.filter(function (x) { return x && x.length; }).length;
        return gave >= (state.config.cluesPerPlayer || 1) ? 1 : 2; // suspicious seats weigh 2x
      });
      var total = weights.reduce(function (a, b) { return a + b; }, 0);
      var r = randInt(state, total), acc = 0;
      for (var k = 0; k < others.length; k++) { acc += weights[k]; if (r < acc) return others[k]; }
      return others[others.length - 1];
    }
    function autoCastBotVotes(state) {
      for (var i = 0; i < state.players.length; i++) {
        if (isBot(state, i) && state.votes[i] == null) castVote(state, i, botVote(state, i));
      }
    }
    // Bot outsider guess (when caught): pick a legal guess via PRNG.
    function botGuess(state) {
      if (state.config.guessMode === 'free') return secretDisplay(state); // a bot has no better strategy; it may fluke
      var n = state.secret && state.secret.index != null ? Math.max(2, (state._listSize || 8)) : 8;
      var tries = []; for (var i = 0; i < n; i++) if (state.guessHistory.indexOf(i) === -1) tries.push(i);
      return tries.length ? tries[randInt(state, tries.length)] : 0;
    }

    // =========================================================================
    // INFORMATION BOUNDARY - the ONLY thing a shared screen may render.
    // Carries nothing that differs by role. The players array is shape-identical for
    // every seat (name/number/bot only). NO isOutsider, NO secret, NO seatSecret.
    // =========================================================================
    function publicState(state) {
      return {
        game: state.game,
        phase: state.phase,
        round: state.round,
        playerCount: state.players.length,
        outsiderCount: state.outsiderSeats.length, // a COUNT is public ("1 imposter among you"); WHO is not
        dealerSeat: state.dealerSeat,
        // public, role-independent: who is at the table + (in clue mode) WHOSE turn it is
        players: state.players.map(function (p) {
          return { seat: p.seat, name: p.name, number: p.number, bot: p.bot };
        }),
        pack: state.pack ? { id: state.pack.id, name: state.pack.name } : null, // pack NAME is public; the secret is not
        interaction: state.config.interaction,
        clueProgress: { round: state.clueRound, of: state.config.cluesPerPlayer || 1, idx: state.clueIdx, total: state.clueOrder.length },
        currentTurnSeat: state.phase === 'clues' ? currentClueGiver(state) : null,
        // recorded clues are PUBLIC by design (they were said aloud) - but they are TEXT only,
        // and the engine never colours/orders them by role, so they cannot leak who is who:
        clues: state.config.recordClues ? deepClone(state.clues) : {},
        questionIdx: state.questionIdx,
        questionsOf: state.config.questionsPerRound || 0,
        votesCast: Object.keys(state.votes).length,
        accusedSeat: (state.phase === 'tally' || state.phase === 'guess') ? state.accusedSeat : null,
        ended: state.phase === 'game_over'
      };
    }

    // Full truth - valid only AFTER a round ends (round_over / game_over).
    function endReveal(state) {
      if (state.phase !== 'round_over' && state.phase !== 'game_over') return null;
      return {
        outcome: state.outcome,
        secret: secretDisplay(state),
        outsiders: state.outsiderSeats.map(function (s) { return { seat: s, name: nameOf(state, s) }; }),
        accusedSeat: state.accusedSeat,
        caught: state.caught,
        outsiderGuessedCorrectly: state.outsiderGuessedCorrectly,
        roundScores: deepClone(state.roundScores),
        scores: deepClone(state.scores),
        standings: standings(state),
        winnerSeats: state.winnerSeats ? state.winnerSeats.slice() : null,
        seats: state.players.map(function (p) {
          return {
            seat: p.seat, name: p.name, isOutsider: isOutsider(state, p.seat),
            secret: (state.seatSecret[p.seat] || {})
          };
        }),
        log: state.log.slice()
      };
    }

    // =========================================================================
    // Public api
    // =========================================================================
    return {
      game: def.game,
      meta: { outsider: OUTSIDER, insider: INSIDER, contentModel: CONTENT_MODEL, guessMode: DEFAULT_GUESS },
      PHASES: PHASES, VOTING_MODES: VOTING_MODES, TIE_BREAKERS: TIE_BREAKERS,
      DEALER_ROTATIONS: DEALER_ROTATIONS, INTERACTIONS: INTERACTIONS, GUESS_MODES: GUESS_MODES, OUTCOMES: OUTCOMES,
      // config
      defaultConfig: defaultConfig, defaultNames: defaultNames, validateConfig: validateConfig,
      maxOutsiders: maxOutsiders, normalizeConfig: normalizeConfig,
      // content
      packMatchesConfig: packMatchesConfig, availablePacks: availablePacks, normItem: normItem,
      // lifecycle
      newGame: newGame, startRound: startRound, nextRound: nextRound, rematch: rematch,
      // queries
      getPlayer: getPlayer, nameOf: nameOf, isOutsider: isOutsider, isBot: isBot,
      revealFor: revealFor, secretDisplay: secretDisplay, effectiveGuesses: effectiveGuesses,
      currentClueGiver: currentClueGiver, currentQuestionIndex: currentQuestionIndex,
      allVotesIn: allVotesIn, matchLeaders: matchLeaders, standings: standings, orderFrom: orderFrom,
      // phase actions
      beginInteraction: beginInteraction, nextClue: nextClue, nextQuestion: nextQuestion,
      callAccusation: callAccusation, outsiderReveal: outsiderReveal,
      beginVote: beginVote, castVote: castVote, resolveVotes: resolveVotes, resolveVotesManual: resolveVotesManual,
      revealAccused: revealAccused, outsiderGuess: outsiderGuess, nextRound: nextRound,
      // bots
      botClueText: botClueText, autoAdvanceClues: autoAdvanceClues,
      botVote: botVote, autoCastBotVotes: autoCastBotVotes, botGuess: botGuess,
      // boundary
      publicState: publicState, endReveal: endReveal,
      // util
      serialize: function (state) { return JSON.stringify(state); },
      deserialize: function (s) { return JSON.parse(s); },
      _internals: { nextRand: nextRand, shuffleInPlace: shuffleInPlace, normItem: normItem }
    };
  }

  return { createEngine: createEngine, version: '0.1.0' };
});
