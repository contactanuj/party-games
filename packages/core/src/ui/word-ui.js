/*
 * word-ui.js — the shared pass-and-play UI for the word-deduction family (Imposter, Out of the
 * Loop, Spyfall). Reads window.WordCore + window.WORD_GAME + window.WORD_CONTENT and renders the
 * whole game into #app. No framework; plain DOM. One UI, three games, by configuration.
 *
 * ============================== SECRECY INVARIANTS ==============================
 * This game is ruined the instant a SHARED screen betrays who the outsider is — exactly the class
 * of bug we hit in Wink Killer (role-coded icons/colours leaking on the all-visible screen AND on
 * the recheck list). So this UI obeys hard rules, asserted in tests:
 *   1. Every SHARED screen (lobby, turn order, clue recap, vote list, timer, scoreboard) is built
 *      ONLY from engine.publicState() — which contains no per-seat role/secret data — and renders
 *      every player row identically. No role-derived colour, icon, ordering, or emphasis. Ever.
 *   2. A secret is shown ONLY on the neutral .gate handoff, to ONE player who tapped to confirm
 *      it is them, and the gate looks structurally identical for outsider and insider (same
 *      colours/lay-out/buttons; only the words differ). No red "you are the imposter" screen.
 *   3. "Re-check my word" is the same gated single-player handoff — NEVER a list of everyone.
 *   4. The full truth (who was who) appears only AFTER the round ends (engine.endReveal()).
 * If you add a screen, run it past these four rules.
 * ===============================================================================
 */
(function () {
  'use strict';
  var WordCore = window.WordCore, GAME = window.WORD_GAME, CONTENT = window.WORD_CONTENT || { packs: [] };
  var META = (GAME && GAME.meta) || {};
  var SND = window.PartySound || { play: function () {}, setEnabled: function () {}, isEnabled: function () { return true; }, resume: function () {} };
  if (!WordCore || !GAME) { document.getElementById('app').textContent = 'Missing engine/game.'; return; }

  var engine = WordCore.createEngine(GAME);
  var LIB = CONTENT.packs || [];
  var OUT = (GAME.outsider && GAME.outsider.label) || 'Outsider';
  var OUTS = (GAME.outsider && GAME.outsider.plural) || (OUT + 's');
  var IN = (GAME.insider && GAME.insider.label) || 'Insider';
  var LS = 'word:' + GAME.game + ':config';

  // ----------------------------- UI state -----------------------------
  var UI = {
    screen: 'lobby',
    config: loadConfig(),
    g: null,
    reveal: { order: [], idx: 0, shown: false },
    recheck: { active: false, seat: null, shown: false },
    clueText: '',
    vote: { order: [], idx: 0, shown: false, pick: null },
    tablePick: null,
    accuse: { active: false, accused: null, confirmWho: null },
    timer: { remaining: 0, handle: null, running: false },
    revealTimer: { remaining: 0, handle: null },
    guessText: '',
    notice: ''
  };

  function loadConfig() {
    try {
      var saved = JSON.parse(localStorage.getItem(LS) || 'null');
      if (saved && saved.playerCount) { var d = engine.defaultConfig(saved.playerCount, saved.playerNames); for (var k in saved) if (saved.hasOwnProperty(k)) d[k] = saved[k]; return d; }
    } catch (e) {}
    var c = engine.defaultConfig(5);
    applyVariant(c, META.defaultVariant);
    return c;
  }
  function saveConfig() { try { localStorage.setItem(LS, JSON.stringify(UI.config)); } catch (e) {} }
  function applyVariant(c, id) {
    var v = (META.variants || []).filter(function (x) { return x.id === id; })[0];
    if (v) for (var k in v.patch) if (v.patch.hasOwnProperty(k)) c[k] = v.patch[k];
    c._variant = id || (v && v.id);
  }

  // ----------------------------- DOM helpers -----------------------------
  var app = document.getElementById('app');
  function clear() { while (app.firstChild) app.removeChild(app.firstChild); }
  function E(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(label, cls, onClick) { var b = E('button', 'btn ' + (cls || ''), label); b.onclick = function () { SND.resume(); SND.play('tap'); onClick(); }; return b; }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function screen(centered) { var s = E('div', 'screen' + (centered ? ' center' : '')); return s; }

  // ----------------------------- content helpers -----------------------------
  function activePack() { return UI.g && UI.g.pack ? LIB.filter(function (p) { return p.id === UI.g.pack.id; })[0] : null; }
  // Bridge per-round data the engine's bots need (clue hints) + list size for list-guess games.
  function bridgeRound() {
    var pack = activePack();
    if (!pack) return;
    UI.g._packClues = (pack.items || []).map(function (it) { return engine._internals.normItem(it).clues || []; });
    UI.g._listSize = (pack.items || []).length;
  }

  // ============================================================================
  // RENDER dispatch
  // ============================================================================
  function render() {
    clear();
    // Always start a freshly-rendered screen at the (safe-area-padded) top. This keeps the header
    // clear of the status bar after any action — including when a text input opened the keyboard
    // and the page had scrolled. Combined with Android's 'resize' keyboard mode, focusing an input
    // never pushes the UI up under the status bar.
    try { window.scrollTo(0, 0); } catch (e) {}
    clearRevealTimer();   // never let a secret-card auto-hide countdown bleed onto another screen
    stopTimerIfLeaving();
    if (UI.recheck.active) return renderRecheck();
    if (UI.screen === 'lobby') return renderLobby();
    if (UI.screen === 'settings') return renderSettings();
    if (UI.screen === 'game') return renderGame();
    renderLobby();
  }

  // ----------------------------- LOBBY (shared, no secrets) -----------------------------
  function renderLobby() {
    var s = screen();
    add(s, E('h1', null, META.title || GAME.game));
    add(s, E('p', 'tagline', META.tagline || ''));

    // Players stepper
    add(s, fieldLabel('Players'));
    add(s, stepper(UI.config.playerCount, GAME.minPlayers || 3, GAME.maxPlayers || 12, function (v) {
      var names = UI.config.playerNames.slice();
      while (names.length < v) names.push('Player ' + (names.length + 1));
      names = names.slice(0, v);
      UI.config = mergeConfig(engine.defaultConfig(v, names), UI.config);
      UI.config.playerNames = names; clampOutsiders();
      render();
    }));

    // Names
    add(s, fieldLabel('Names'));
    var nameWrap = E('div', 'stack');
    UI.config.playerNames.forEach(function (nm, i) {
      var inp = E('input'); inp.type = 'text'; inp.value = nm; inp.maxLength = 16;
      inp.placeholder = 'Player ' + (i + 1);
      inp.oninput = function () { UI.config.playerNames[i] = inp.value; };
      add(nameWrap, inp);
    });
    add(s, nameWrap);

    // Variant chips
    if (META.variants && META.variants.length) {
      add(s, fieldLabel('Mode'));
      var chips = E('div', 'grid');
      META.variants.forEach(function (v) {
        var sel = UI.config._variant === v.id;
        var c = E('div', 'choice' + (sel ? ' sel' : ''));
        add(c, E('div', null, v.name));
        add(c, E('div', 'small muted', v.blurb));
        c.onclick = function () { SND.play('tap'); applyVariant(UI.config, v.id); clampOutsiders(); render(); };
        add(chips, c);
      });
      add(s, chips);
    }

    // Bots (honest about practicality)
    add(s, fieldLabel('Computer players (fill empty seats)'));
    add(s, stepper(UI.config.botCount || 0, 0, UI.config.playerCount - 1, function (v) { UI.config.botCount = v; render(); }));
    if (GAME.botsImpractical && UI.config.botCount > 0) {
      add(s, note('warn', 'This is a talking game — computer players can fill seats and vote, but they cannot truly bluff. Best for learning the flow.'));
    }

    // Validate + start
    var v = engine.validateConfig(UI.config, LIB);
    v.errors.forEach(function (e) { add(s, note('err', e)); });
    v.warnings.slice(0, 2).forEach(function (w) { add(s, note('warn', w)); });

    add(s, E('div', 'divider'));
    var start = btn('Start game', '', function () { saveConfig(); startGame(); });
    start.disabled = !v.ok;
    add(s, start);
    add(s, btn('Advanced settings', 'secondary', function () { UI.screen = 'settings'; render(); }));
    add(s, btn('How to play', 'ghost', function () { showHelp(); }));
    add(s, soundFooter());
    app.appendChild(s);
  }

  function clampOutsiders() {
    var maxOut = Math.max(1, Math.ceil(UI.config.playerCount / 2) - 1);
    if (UI.config.outsiderCount > maxOut) UI.config.outsiderCount = maxOut;
    if (UI.config.botCount > UI.config.playerCount - 1) UI.config.botCount = UI.config.playerCount - 1;
  }
  function mergeConfig(base, old) { for (var k in old) if (old.hasOwnProperty(k) && base.hasOwnProperty(k) && k !== 'playerNames' && k !== 'playerCount') base[k] = old[k]; base._variant = old._variant; return base; }

  // ----------------------------- SETTINGS (shared, no secrets) -----------------------------
  function renderSettings() {
    var s = screen();
    add(s, E('h1', null, 'Settings'));
    // Validate up-front and surface problems at the TOP (not buried under the form). The proceed
    // button below is disabled while anything is invalid, so you can never leave Settings with a
    // configuration that can't start. (Steppers below also cap to the player count, so most
    // invalid states can't be entered in the first place.)
    var v = engine.validateConfig(UI.config, LIB);
    v.errors.forEach(function (e) { add(s, note('err', e)); });
    v.warnings.forEach(function (w) { add(s, note('warn', w)); });
    var hidden = META.hiddenOptions || [];
    var labels = META.optionLabels || {};
    function show(key) { return hidden.indexOf(key) === -1; }
    function L(key, dflt) { return labels[key] || dflt; }

    var c = UI.config;
    // Roles
    add(s, E('h2', null, 'Roles'));
    if (show('outsiderCount')) add(s, intRow(L('outsiderCount', 'Number of ' + OUTS), c.outsiderCount, 1, Math.max(1, Math.ceil(c.playerCount / 2) - 1), function (v) { c.outsiderCount = v; }));
    if (show('giveOutsiderHint')) add(s, toggleRow(L('giveOutsiderHint', 'Give the ' + OUT + ' a category hint'), c.giveOutsiderHint, function (v) { c.giveOutsiderHint = v; }));

    // Interaction
    add(s, E('h2', null, 'Round flow'));
    if (c.interaction === 'clues' && show('cluesPerPlayer')) add(s, intRow(L('cluesPerPlayer', 'Clue rounds'), c.cluesPerPlayer, 1, 3, function (v) { c.cluesPerPlayer = v; }));
    if (c.interaction === 'clues' && show('recordClues')) add(s, toggleRow(L('recordClues', 'Type each clue (recap on the screen)'), c.recordClues, function (v) { c.recordClues = v; }));
    if (c.interaction === 'questions' && show('questionsPerRound')) add(s, intRow(L('questionsPerRound', 'Questions per round'), c.questionsPerRound, 1, 8, function (v) { c.questionsPerRound = v; }));
    if (show('debatePhase')) add(s, toggleRow(L('debatePhase', 'Discussion step before voting'), c.debatePhase, function (v) { c.debatePhase = v; }));
    if (show('timerSeconds')) add(s, selectRow(L('timerSeconds', 'Timer'), c.timerSeconds, [[0, 'Off'], [60, '1 min'], [120, '2 min'], [180, '3 min'], [300, '5 min'], [480, '8 min']], function (v) { c.timerSeconds = v; }));
    if (show('revealSeconds')) add(s, selectRow(L('revealSeconds', 'Auto-hide the secret card'), c.revealSeconds, [[0, 'Off (tap to hide)'], [5, 'After 5s'], [8, 'After 8s'], [12, 'After 12s'], [20, 'After 20s']], function (v) { c.revealSeconds = v; }));

    // Catching
    add(s, E('h2', null, 'Catching the ' + OUT));
    if (show('accusationMode')) add(s, selectRow(L('accusationMode', 'Accusation'), c.accusationMode, [['vote', 'One final vote'], ['unanimous_anytime', 'Accuse anytime (must be unanimous)']], function (v) { c.accusationMode = v; }));
    if (show('votingMode')) add(s, selectRow(L('votingMode', 'Voting'), c.votingMode, [['open', 'Tap (pass device)'], ['secret', 'Secret (pass device)'], ['table', 'Show of hands (host enters)']], function (v) { c.votingMode = v; }));
    if (show('revealVotes')) add(s, toggleRow(L('revealVotes', 'Show who voted for whom'), c.revealVotes, function (v) { c.revealVotes = v; }));
    if (show('tieBreaker')) add(s, selectRow(L('tieBreaker', 'On a tie'), c.tieBreaker, [['revote', 'Re-vote'], ['dealer', 'Starter decides'], ['outsider_escapes', OUT + ' escapes']], function (v) { c.tieBreaker = v; }));
    if (show('guessMode') && c.guessMode !== 'none' && show('outsiderGuesses')) add(s, intRow(L('outsiderGuesses', 'Guesses if caught'), c.outsiderGuesses, 1, 3, function (v) { c.outsiderGuesses = v; }));
    if (show('allowOutsiderEarlyGuess')) add(s, toggleRow(L('allowOutsiderEarlyGuess', OUT + ' may stop the round to guess'), c.allowOutsiderEarlyGuess, function (v) { c.allowOutsiderEarlyGuess = v; }));

    // Scoring
    add(s, E('h2', null, 'Scoring'));
    if (show('scoring')) add(s, toggleRow(L('scoring', 'Keep score across rounds'), c.scoring, function (v) { c.scoring = v; render(); }));
    if (c.scoring && show('winTarget')) add(s, intRow(L('winTarget', 'Points to win the match'), c.winTarget, 1, 20, function (v) { c.winTarget = v; }));
    if (show('dealerRotation')) add(s, selectRow(L('dealerRotation', 'Who starts next round'), c.dealerRotation, [['clockwise', 'Next player'], ['random', 'Random'], ['outsider', 'The ' + OUT]], function (v) { c.dealerRotation = v; }));

    // Content packs (shared, no secrets — pack NAMES are public)
    var packsForModel = LIB.filter(function (p) { return engine.packMatchesConfig(p, withAllPacks(c)); });
    if (packsForModel.length > 1) {
      add(s, E('h2', null, 'Content packs'));
      add(s, E('p', 'small muted', 'Choose which packs are in play. Leave all on for variety.'));
      var allOn = !c.packIds;
      packsForModel.forEach(function (p) {
        var on = allOn || (c.packIds && c.packIds.indexOf(p.id) !== -1);
        add(s, toggleRow(p.name, on, function (v) { togglePack(p.id, v, packsForModel); }));
      });
    }

    add(s, E('div', 'divider'));
    var done = btn('Done', '', function () { saveConfig(); UI.screen = 'lobby'; render(); });
    done.disabled = !v.ok; // can't leave Settings with an unstartable config
    add(s, done);
    if (!v.ok) add(s, E('div', 'footer-note', 'Fix the highlighted setting' + (v.errors.length > 1 ? 's' : '') + ' above to continue.'));
    add(s, btn('Reset to defaults', 'ghost', function () { var pc = c.playerCount, nm = c.playerNames.slice(); UI.config = engine.defaultConfig(pc, nm); applyVariant(UI.config, META.defaultVariant); render(); }));
    app.appendChild(s);
  }
  function withAllPacks(c) { var d = {}; for (var k in c) d[k] = c[k]; d.packIds = null; return d; }
  function togglePack(id, on, packsForModel) {
    var ids = UI.config.packIds ? UI.config.packIds.slice() : packsForModel.map(function (p) { return p.id; });
    if (on) { if (ids.indexOf(id) === -1) ids.push(id); }
    else { ids = ids.filter(function (x) { return x !== id; }); }
    UI.config.packIds = ids.length === packsForModel.length ? null : ids;
    render();
  }

  // ----------------------------- form widgets -----------------------------
  function fieldLabel(t) { return E('label', 'field', t); }
  function note(kind, t) { return E('div', kind, t); }
  function stepper(val, min, max, onChange) {
    var wrap = E('div', 'stepper');
    var minus = E('button', 'stepbtn', '−'); var v = E('div', 'val', '' + val); var plus = E('button', 'stepbtn', '+');
    minus.onclick = function () { if (val > min) { val--; onChange(val); } };
    plus.onclick = function () { if (val < max) { val++; onChange(val); } };
    add(wrap, minus, v, plus); return wrap;
  }
  function intRow(label, val, min, max, onChange) {
    var wrap = E('div'); add(wrap, fieldLabel(label));
    add(wrap, stepper(val, min, max, function (v) { onChange(v); render(); }));
    return wrap;
  }
  function toggleRow(label, on, onChange) {
    var row = E('div', 'toggle'); add(row, E('div', null, label));
    var sw = E('div', 'sw' + (on ? ' on' : '')); add(sw, E('div', 'knob'));
    sw.onclick = function () { SND.play('tap'); onChange(!on); render(); };
    add(row, sw); return row;
  }
  function selectRow(label, val, options, onChange) {
    var wrap = E('div'); add(wrap, fieldLabel(label));
    var sel = E('select');
    options.forEach(function (o) { var opt = E('option', null, o[1]); opt.value = o[0]; if ('' + o[0] === '' + val) opt.selected = true; add(sel, opt); });
    sel.onchange = function () { var raw = sel.value; var num = Number(raw); onChange(isNaN(num) || raw === '' ? raw : (('' + num) === raw ? num : raw)); render(); };
    add(wrap, sel); return wrap;
  }

  // ============================================================================
  // GAME
  // ============================================================================
  function startGame() {
    clampOutsiders();
    var seed = ((Date.now ? Date.now() : 1) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    UI.g = engine.newGame(UI.config, LIB, seed || 1);
    bridgeRound();
    UI.reveal = { order: engine.orderFrom(UI.g, UI.g.dealerSeat), idx: 0, shown: false };
    UI.screen = 'game';
    render();
  }

  function renderGame() {
    var ph = UI.g.phase;
    if (ph === 'reveal') return renderReveal();
    if (ph === 'clues') return renderClues();
    if (ph === 'questions') return renderQuestions();
    if (ph === 'play') return renderPlay();
    if (ph === 'debate') return renderDebate();
    if (ph === 'vote') return renderVote();
    if (ph === 'tally') return renderTally();
    if (ph === 'guess') return renderGuess();
    if (ph === 'round_over') return renderRoundOver();
    if (ph === 'game_over') return renderGameOver();
    renderLobby();
  }

  // ----------------------------- REVEAL handoff (gated, leak-free) -----------------------------
  function renderReveal() {
    var order = UI.reveal.order, idx = UI.reveal.idx;
    if (idx >= order.length) { engine.beginInteraction(UI.g); afterInteractionAutostep(); return render(); }
    var seat = order[idx];
    // bot seats are not handed the device — they "know" their secret internally
    if (engine.isBot(UI.g, seat)) { UI.reveal.idx++; return render(); }

    var s = screen(true);
    if (!UI.reveal.shown) {
      // PASS screen — shared-safe (a name only)
      add(s, E('div', 'pill', 'Reveal ' + (countHumansBefore(order, idx) + 1) + ' of ' + countHumans(order)));
      var gate = E('div', 'gate');
      add(gate, E('div', 'hint', 'Pass the phone to'));
      add(gate, E('div', 'who', engine.nameOf(UI.g, seat)));
      add(gate, E('div', 'hint', 'Only ' + engine.nameOf(UI.g, seat) + ' should look. Everyone else, eyes up.'));
      add(s, gate);
      add(s, btn("I'm " + engine.nameOf(UI.g, seat) + " — show me", '', function () { UI.reveal.shown = true; SND.play('reveal'); render(); }));
    } else {
      // SECRET screen — identical chrome for outsider and insider
      add(s, secretCard(engine.revealFor(UI.g, seat)));
      add(s, btn('Hide & pass on', '', function () { UI.reveal.shown = false; UI.reveal.idx++; SND.play('pass'); render(); }));
      if (UI.config.revealSeconds > 0) add(s, E('div', 'footer-note reveal-countdown', 'Auto-hiding in ' + UI.config.revealSeconds + 's'));
    }
    app.appendChild(s);
    if (UI.reveal.shown && UI.config.revealSeconds > 0) {
      startAutoHide(function () { UI.reveal.shown = false; UI.reveal.idx++; SND.play('pass'); render(); });
    }
  }
  function countHumans(order) { var n = 0; order.forEach(function (st) { if (!engine.isBot(UI.g, st)) n++; }); return n; }
  function countHumansBefore(order, idx) { var n = 0; for (var i = 0; i < idx; i++) if (!engine.isBot(UI.g, order[i])) n++; return n; }

  // The one place a secret is shown. SAME layout for everyone — no role colour/icon.
  function secretCard(info) {
    var wrap = E('div', 'gate');
    add(wrap, E('div', 'hint', info.name));
    if (info.contentModel === 'locationRoles') {
      if (info.isOutsider) {
        add(wrap, E('div', 'big-role', 'You are the ' + OUT));
        add(wrap, E('div', 'hint', "You don't know the location. Blend in, work out where everyone is — or guess it."));
      } else {
        add(wrap, E('div', 'hint', 'Location'));
        add(wrap, E('div', 'big-role', info.location));
        add(wrap, E('div', 'pill', 'Your role: ' + (info.roleAtLocation || '—')));
      }
    } else if (info.word != null) {
      // The seat HAS a word. This covers every insider AND the Undercover outsider (who gets a
      // close word and is NOT told they are the odd one out). The card is byte-identical for both,
      // so the reveal itself can never betray the role — you must deduce it from the clues.
      add(wrap, E('div', 'hint', 'Your secret word'));
      add(wrap, E('div', 'big-role', info.word));
      add(wrap, E('div', 'hint', 'Give a one-word clue that proves you know it — without handing it to the ' + OUT + '.'));
      if (info.hint) add(wrap, E('div', 'pill', 'Category: ' + info.hint));
    } else {
      // The seat has NO word -> it is the outsider (Classic Imposter / Out of the Loop / blind).
      add(wrap, E('div', 'big-role', 'You are the ' + OUT));
      add(wrap, E('div', 'hint', 'You have no word. Listen carefully, then give a clue that blends in.'));
      if (info.hint) add(wrap, E('div', 'pill', 'Category: ' + info.hint));
    }
    if (info.allies && info.allies.length) add(wrap, E('div', 'pill', 'With you: ' + info.allies.join(', ')));
    return wrap;
  }

  // ----------------------------- RECHECK (gated single-seat, never a list) -----------------------------
  function openRecheck() { UI.recheck = { active: true, seat: null, shown: false }; render(); }
  function renderRecheck() {
    var s = screen(true);
    add(s, E('h2', null, 'Re-check your secret'));
    if (UI.recheck.seat == null) {
      add(s, E('p', 'muted', 'Tap your own name. Make sure no one else is looking.'));
      var grid = E('div', 'grid');
      UI.g.players.forEach(function (p) {
        if (engine.isBot(UI.g, p.seat)) return;
        var c = E('div', 'choice', p.name);
        c.onclick = function () { UI.recheck.seat = p.seat; SND.play('tap'); render(); };
        add(grid, c);
      });
      add(s, grid);
      add(s, btn('Cancel', 'ghost', function () { UI.recheck.active = false; render(); }));
    } else if (!UI.recheck.shown) {
      var gate = E('div', 'gate');
      add(gate, E('div', 'who', engine.nameOf(UI.g, UI.recheck.seat)));
      add(gate, E('div', 'hint', 'Confirm it is you, with no one watching.'));
      add(s, gate);
      add(s, btn('Show my word', '', function () { UI.recheck.shown = true; SND.play('reveal'); render(); }));
      add(s, btn('Back', 'ghost', function () { UI.recheck.seat = null; render(); }));
    } else {
      add(s, secretCard(engine.revealFor(UI.g, UI.recheck.seat)));
      add(s, btn('Hide', '', function () { UI.recheck.active = false; SND.play('pass'); render(); }));
      if (UI.config.revealSeconds > 0) add(s, E('div', 'footer-note reveal-countdown', 'Auto-hiding in ' + UI.config.revealSeconds + 's'));
    }
    app.appendChild(s);
    if (UI.recheck.active && UI.recheck.shown && UI.config.revealSeconds > 0) {
      startAutoHide(function () { UI.recheck.active = false; SND.play('pass'); render(); });
    }
  }
  // Re-check label adapts to the game (word vs location). Always a gated single-player handoff.
  function recheckBtn() { return btn(GAME.contentModel === 'locationRoles' ? 'Re-check my location & role' : 'Re-check my word', 'ghost', openRecheck); }

  // ----------------------------- CLUES interaction (shared turn screen) -----------------------------
  function afterInteractionAutostep() { if (UI.g.phase === 'clues') engine.autoAdvanceClues(UI.g); }
  function renderClues() {
    engine.autoAdvanceClues(UI.g); // resolve any leading bot turns
    if (UI.g.phase !== 'clues') return render();
    var s = screen();
    add(s, topBar());
    add(s, E('h2', null, 'Clue ' + (UI.g.clueRound + 1) + ' of ' + (UI.config.cluesPerPlayer || 1)));
    add(s, clueRecap());
    var giver = engine.currentClueGiver(UI.g);
    add(s, E('div', 'panel'));
    var turn = E('div', 'gate');
    add(turn, E('div', 'hint', 'Now giving a clue'));
    add(turn, E('div', 'who', engine.nameOf(UI.g, giver)));
    add(s, turn);

    if (UI.config.recordClues) {
      var inp = E('input'); inp.type = 'text'; inp.maxLength = 24; inp.placeholder = 'one-word clue (said aloud)';
      inp.value = UI.clueText; inp.oninput = function () { UI.clueText = inp.value; };
      add(s, inp);
      add(s, btn('Submit clue', '', function () { var t = (UI.clueText || '').trim(); if (!t) return; UI.clueText = ''; engine.nextClue(UI.g, t); SND.play('tap'); render(); }));
    } else {
      add(s, E('p', 'muted center-text', engine.nameOf(UI.g, giver) + ' says their clue out loud, then taps next.'));
      add(s, btn(engine.nameOf(UI.g, giver) + ' done', '', function () { engine.nextClue(UI.g); SND.play('tap'); render(); }));
    }
    add(s, recheckBtn());
    app.appendChild(s);
  }
  // Clue recap: PUBLIC text only, seat order, no role marking.
  function clueRecap() {
    if (!UI.config.recordClues) return E('div');
    var pub = engine.publicState(UI.g);
    var panel = E('div', 'panel');
    var any = false;
    UI.g.players.forEach(function (p) {
      var arr = pub.clues[p.seat] || [];
      if (!arr.length) return;
      any = true;
      var row = E('div', 'reveal-row');
      add(row, E('div', 'nm', p.name));
      add(row, E('div', null, arr.join('  ·  ')));
      add(panel, row);
    });
    if (!any) { add(panel, E('div', 'muted small', 'Clues will appear here as they are given.')); }
    return panel;
  }

  // ----------------------------- QUESTIONS interaction (Out of the Loop) -----------------------------
  function renderQuestions() {
    var s = screen();
    add(s, topBar());
    var pack = activePack();
    var qs = (pack && pack.questions) || META.fallbackQuestions || ['Describe it in one word.'];
    var qIdx = engine.currentQuestionIndex(UI.g);
    var question = qs[qIdx % qs.length];
    add(s, E('h2', null, 'Question ' + (qIdx + 1) + ' of ' + (UI.config.questionsPerRound || 1)));
    var card = E('div', 'panel'); add(card, E('p', null, question)); add(s, card);
    add(s, E('p', 'muted center-text', 'Going around from ' + engine.nameOf(UI.g, UI.g.dealerSeat) + ', everyone answers out loud (no saying the word!).'));
    add(s, btn('Everyone answered — next', '', function () { engine.nextQuestion(UI.g); SND.play('tap'); render(); }));
    add(s, recheckBtn());
    app.appendChild(s);
  }

  // ----------------------------- PLAY interaction (Spyfall timer + accuse/guess) -----------------------------
  function renderPlay() {
    var s = screen();
    add(s, topBar());
    if (UI.accuse.active) { app.appendChild(playAccuse(s)); return; }

    // Timer
    if (UI.config.timerSeconds > 0) {
      if (!UI.timer.handle && UI.timer.remaining === 0 && !UI.timer.running) UI.timer.remaining = UI.config.timerSeconds;
      add(s, E('div', 'timer', fmtTime(UI.timer.remaining)));
      var trow = E('div', 'row');
      add(trow, btn(UI.timer.running ? 'Pause' : 'Start timer', 'secondary', function () { UI.timer.running ? pauseTimer() : startTimer(); }));
      add(trow, btn('Reset', 'ghost', function () { resetTimer(); }));
      add(s, trow);
    }

    // Public reference: the master list of all possible locations (intended public in Spyfall).
    var pack = activePack();
    if (pack && GAME.contentModel === 'locationRoles') {
      add(s, E('h3', null, 'Possible locations'));
      var pills = E('div', 'row wrap');
      (pack.items || []).forEach(function (it) { add(pills, E('span', 'pill', engine._internals.normItem(it).display)); });
      add(s, pills);
    }

    add(s, E('div', 'divider'));
    add(s, E('p', 'muted center-text', 'Ask each other questions. Prove you belong — without giving the place away.'));
    add(s, btn('Accuse someone', 'secondary', function () { UI.accuse = { active: true, accused: null, confirmWho: null }; render(); }));
    if (UI.config.allowOutsiderEarlyGuess) add(s, btn('I am the ' + OUT + ' — stop & guess', 'ghost', function () { spyGuessFlow(); }));
    add(s, btn('Time is up — go to vote', '', function () { engine.beginVote(UI.g); render(); }));
    add(s, recheckBtn());
    app.appendChild(s);
  }
  // Mid-round accusation: pick WHO is accusing, then WHO they accuse (so the accuser can never be
  // the accused, and the +bonus is attributed to the real accuser). Everyone else must then agree.
  function resetAccuse() { UI.accuse = { active: false, accused: null, confirmWho: null }; }
  function playAccuse(s) {
    if (UI.accuse.confirmWho == null) {
      add(s, E('h2', null, 'Who is accusing?'));
      add(s, E('p', 'muted center-text', 'Tap the player making the accusation.'));
      add(s, playerGrid(function (seat) { UI.accuse.confirmWho = seat; render(); }, null));
      add(s, btn('Cancel', 'ghost', function () { resetAccuse(); render(); }));
    } else if (UI.accuse.accused == null) {
      add(s, E('h2', null, engine.nameOf(UI.g, UI.accuse.confirmWho) + ' accuses…'));
      add(s, playerGrid(function (seat) { UI.accuse.accused = seat; render(); }, UI.accuse.confirmWho)); // can't accuse yourself
      add(s, btn('Back', 'ghost', function () { UI.accuse.confirmWho = null; render(); }));
    } else {
      add(s, E('p', 'center-text', engine.nameOf(UI.g, UI.accuse.confirmWho) + ' accuses ' + engine.nameOf(UI.g, UI.accuse.accused) + '. Everyone else must agree.'));
      add(s, btn('Everyone agrees — reveal', 'danger', function () {
        engine.callAccusation(UI.g, UI.accuse.confirmWho, UI.accuse.accused, true);
        resetAccuse(); SND.play('vote'); render();
      }));
      add(s, btn('No agreement — keep playing', 'ghost', function () {
        engine.callAccusation(UI.g, UI.accuse.confirmWho, UI.accuse.accused, false);
        resetAccuse(); render();
      }));
    }
    return s;
  }
  function spyGuessFlow() {
    // the spy outs themselves: which human is it? (gated pick — but they are self-declaring)
    var spy = UI.g.outsiderSeats[0];
    engine.outsiderReveal(UI.g, spy);
    render();
  }

  // ----------------------------- DEBATE -----------------------------
  function renderDebate() {
    var s = screen();
    add(s, topBar());
    add(s, E('h2', null, 'Discuss'));
    add(s, clueRecap());
    if (UI.config.timerSeconds > 0) {
      if (UI.timer.remaining === 0 && !UI.timer.running) UI.timer.remaining = UI.config.timerSeconds;
      add(s, E('div', 'timer', fmtTime(UI.timer.remaining)));
      var trow = E('div', 'row');
      add(trow, btn(UI.timer.running ? 'Pause' : 'Start timer', 'secondary', function () { UI.timer.running ? pauseTimer() : startTimer(); }));
      add(trow, btn('Reset', 'ghost', function () { resetTimer(); }));
      add(s, trow);
    }
    add(s, E('p', 'muted center-text', 'Talk it out. Who is the ' + OUT + '? When ready, vote.'));
    add(s, btn('Go to vote', '', function () { resetTimer(); engine.beginVote(UI.g); render(); }));
    add(s, recheckBtn());
    app.appendChild(s);
  }

  // ----------------------------- VOTE -----------------------------
  function renderVote() {
    // table mode: host picks the accused directly
    if (UI.config.votingMode === 'table') return renderVoteTable();
    // open/secret: pass-and-tap, one human at a time
    engine.autoCastBotVotes(UI.g);
    if (!UI.vote.order.length) UI.vote = { order: engine.orderFrom(UI.g, UI.g.dealerSeat).filter(function (st) { return !engine.isBot(UI.g, st); }), idx: 0, shown: false, pick: null };
    var order = UI.vote.order, idx = UI.vote.idx;
    if (idx >= order.length) { resolveAndGo(); return; }
    var voter = order[idx];
    var s = screen(true);
    if (!UI.vote.shown) {
      var gate = E('div', 'gate');
      add(gate, E('div', 'hint', 'Pass the phone to'));
      add(gate, E('div', 'who', engine.nameOf(UI.g, voter)));
      add(gate, E('div', 'hint', 'Cast your vote in private.'));
      add(s, gate);
      add(s, btn("I'm " + engine.nameOf(UI.g, voter), '', function () { UI.vote.shown = true; UI.vote.pick = null; render(); }));
    } else {
      add(s, E('h2', null, 'Who is the ' + OUT + '?'));
      add(s, playerGrid(function (seat) { UI.vote.pick = seat; render(); }, voter, UI.vote.pick));
      var confirm = btn('Lock in vote', '', function () {
        engine.castVote(UI.g, voter, UI.vote.pick); SND.play('vote');
        UI.vote.shown = false; UI.vote.idx++; render();
      });
      confirm.disabled = UI.vote.pick == null;
      add(s, confirm);
    }
    app.appendChild(s);
  }
  function renderVoteTable() {
    var s = screen();
    add(s, topBar());
    add(s, E('h2', null, 'Who did the table accuse?'));
    add(s, E('p', 'muted', 'Show of hands. Tap the most-accused player.'));
    add(s, playerGrid(function (seat) { UI.tablePick = seat; render(); }, null, UI.tablePick));
    var go = btn('Reveal', '', function () { engine.resolveVotesManual(UI.g, UI.tablePick); UI.tablePick = null; postVote(); });
    go.disabled = UI.tablePick == null;
    add(s, go);
    app.appendChild(s);
  }
  function resolveAndGo() { engine.resolveVotes(UI.g); UI.vote = { order: [], idx: 0, shown: false, pick: null }; postVote(); }
  function postVote() {
    // re-votes loop back to the vote screen
    if (UI.g.phase === 'vote') { UI.vote = { order: [], idx: 0, shown: false, pick: null }; UI.notice = 'Tied vote — vote again.'; }
    render();
  }

  // ----------------------------- TALLY (reveal accused) -----------------------------
  function renderTally() {
    var s = screen(true);
    var accused = UI.g.accusedSeat;
    add(s, E('h2', null, 'The table accuses'));
    add(s, E('div', 'big-role', engine.nameOf(UI.g, accused)));
    if (UI.config.revealVotes && UI.g.lastVotes && UI.g.lastVotes.ballots && UI.config.votingMode !== 'secret') {
      add(s, voteBreakdown());
    }
    add(s, btn('Reveal: are they the ' + OUT + '?', '', function () { engine.revealAccused(UI.g); SND.play('reveal'); render(); }));
    app.appendChild(s);
  }
  function voteBreakdown() {
    var panel = E('div', 'panel');
    var b = UI.g.lastVotes.ballots;
    UI.g.players.forEach(function (p) {
      if (b[p.seat] == null) return;
      var row = E('div', 'reveal-row');
      add(row, E('div', 'nm', p.name));
      add(row, E('div', 'muted', '→ ' + engine.nameOf(UI.g, b[p.seat])));
      add(panel, row);
    });
    return panel;
  }

  // ----------------------------- GUESS (caught outsider) -----------------------------
  function renderGuess() {
    var s = screen(true);
    var who = engine.nameOf(UI.g, UI.g.accusedSeat);
    add(s, E('h2', null, who + ' is the ' + OUT + '!'));
    add(s, E('p', 'muted', 'One last chance: name the secret to escape. ' + UI.g.guessesLeft + ' guess' + (UI.g.guessesLeft === 1 ? '' : 'es') + ' left.'));
    if (UI.config.guessMode === 'list' || UI.config.guessMode === 'fromTopic') {
      var pack = activePack();
      var grid = E('div', 'grid');
      (pack.items || []).forEach(function (it, i) {
        if (UI.g.guessHistory.indexOf(i) !== -1) return;
        var c = E('div', 'choice', engine._internals.normItem(it).display);
        c.onclick = function () { engine.outsiderGuess(UI.g, i); SND.play('reveal'); render(); };
        add(grid, c);
      });
      add(s, grid);
    } else {
      var inp = E('input'); inp.type = 'text'; inp.placeholder = 'the secret word'; inp.value = UI.guessText;
      inp.oninput = function () { UI.guessText = inp.value; };
      add(s, inp);
      add(s, btn('Guess', '', function () { var t = UI.guessText; UI.guessText = ''; engine.outsiderGuess(UI.g, t); SND.play('reveal'); render(); }));
    }
    app.appendChild(s);
  }

  // ----------------------------- ROUND OVER / GAME OVER (full reveal) -----------------------------
  function renderRoundOver() { roundEndScreen(false); }
  function renderGameOver() { roundEndScreen(true); }
  function roundEndScreen(matchOver) {
    var s = screen();
    var R = engine.endReveal(UI.g);
    var headline = outcomeHeadline(R.outcome);
    add(s, E('h1', null, matchOver ? 'Match over' : 'Round ' + UI.g.round));
    add(s, E('div', 'result-win center-text', headline));
    add(s, E('p', 'center-text', 'The secret was'));
    add(s, E('div', 'big-role center-text', R.secret));

    // who was who (now safe to show)
    var panel = E('div', 'panel');
    add(panel, E('h3', null, 'Roles'));
    R.seats.forEach(function (seat) {
      var row = E('div', 'reveal-row');
      add(row, E('div', 'nm', seat.name + (engine.isBot(UI.g, seat.seat) ? ' (bot)' : '')));
      add(row, E('div', seat.isOutsider ? 'dead-tag' : 'muted', seat.isOutsider ? OUT : IN));
      add(panel, row);
    });
    add(s, panel);

    if (UI.config.scoring) {
      var sc = E('div', 'panel');
      add(sc, E('h3', null, 'Scores'));
      R.standings.forEach(function (st) {
        var row = E('div', 'reveal-row');
        var delta = R.roundScores[st.seat] ? '  (+' + R.roundScores[st.seat] + ')' : '';
        add(row, E('div', 'nm', st.name));
        add(row, E('div', null, st.score + delta));
        add(sc, row);
      });
      add(s, sc);
    }

    add(s, E('div', 'divider'));
    if (matchOver) {
      var winners = (R.winnerSeats || []).map(function (st) { return engine.nameOf(UI.g, st); }).join(', ');
      add(s, E('div', 'result-win center-text', '★ ' + winners + ' win' + ((R.winnerSeats || []).length > 1 ? '' : 's') + '!'));
      add(s, btn('Play again (same players)', '', function () { UI.g = engine.rematch(UI.g, LIB, ((Date.now ? Date.now() : 2) ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0); bridgeRound(); resetReveal(); render(); }));
      add(s, btn('Back to menu', 'ghost', function () { UI.screen = 'lobby'; render(); }));
    } else {
      add(s, btn('Next round', '', function () { engine.nextRound(UI.g, LIB); bridgeRound(); resetReveal(); render(); }));
      add(s, btn('End match', 'ghost', function () { UI.screen = 'lobby'; render(); }));
    }
    app.appendChild(s);
  }
  function resetReveal() { UI.reveal = { order: engine.orderFrom(UI.g, UI.g.dealerSeat), idx: 0, shown: false }; UI.vote = { order: [], idx: 0, shown: false, pick: null }; resetTimer(); }
  function outcomeHeadline(o) {
    var O = engine.OUTCOMES;
    if (o === O.escaped_undetected) return 'The ' + OUT + ' escaped!';
    if (o === O.caught_guessed) return 'Caught — but guessed the secret and escaped!';
    if (o === O.caught_failed) return 'The ' + OUT + ' was caught!';
    if (o === O.wrong_conviction) return 'Wrong! The ' + OUT + ' fooled everyone.';
    if (o === O.outsider_solved) return 'The ' + OUT + ' solved it!';
    return 'Round over';
  }

  // ----------------------------- shared widgets -----------------------------
  function topBar() {
    var bar = E('div', 'row');
    add(bar, E('div', 'pill', (META.title || GAME.game)));
    add(bar, E('div', 'pill', UI.g.outsiderSeats.length + ' ' + (UI.g.outsiderSeats.length === 1 ? OUT : OUTS) + ' among you'));
    add(bar, E('div', 'spacer'));
    add(bar, E('div', 'pill', 'Round ' + UI.g.round));
    return bar;
  }
  // A player-pick grid built from publicState only. Renders every player identically.
  function playerGrid(onPick, excludeSeat, selected) {
    var grid = E('div', 'grid');
    engine.publicState(UI.g).players.forEach(function (p) {
      if (excludeSeat != null && p.seat === excludeSeat) return;
      var c = E('div', 'choice' + (selected === p.seat ? ' sel' : ''), p.name + (p.bot ? ' (bot)' : ''));
      c.onclick = function () { SND.play('tap'); onPick(p.seat); };
      add(grid, c);
    });
    return grid;
  }
  function showHelp() {
    clear();
    var s = screen();
    add(s, E('h1', null, 'How to play'));
    (META.help || []).forEach(function (h, i) { var p = E('div', 'panel'); add(p, E('div', 'pill', '' + (i + 1))); add(p, E('p', null, h)); add(s, p); });
    add(s, E('div', 'divider'));
    add(s, btn('Got it', '', function () { render(); }));
    app.appendChild(s);
  }
  function soundFooter() {
    var row = E('div', 'row');
    add(row, E('div', 'spacer'));
    add(row, btn(SND.isEnabled() ? 'Sound: on' : 'Sound: off', 'ghost', function () { SND.setEnabled(!SND.isEnabled()); render(); }));
    add(row, E('div', 'spacer'));
    return row;
  }

  // ----------------------------- timer -----------------------------
  function startTimer() {
    if (UI.timer.handle) return;
    UI.timer.running = true;
    UI.timer.handle = setInterval(function () {
      if (UI.timer.remaining <= 0) { pauseTimer(); SND.play('day'); render(); return; }
      UI.timer.remaining--;
      if (UI.timer.remaining <= 5 && UI.timer.remaining > 0) SND.play('tick');
      var el = app.querySelector('.timer'); if (el) el.textContent = fmtTime(UI.timer.remaining); else render();
    }, 1000);
    render();
  }
  function pauseTimer() { if (UI.timer.handle) { clearInterval(UI.timer.handle); UI.timer.handle = null; } UI.timer.running = false; }
  function resetTimer() { pauseTimer(); UI.timer.remaining = UI.config.timerSeconds || 0; }
  function stopTimerIfLeaving() { /* timers are re-created per screen; clear stray intervals when not on a timed screen */
    var ph = UI.g ? UI.g.phase : null;
    if (ph !== 'play' && ph !== 'debate' && UI.timer.handle) pauseTimer();
  }
  function fmtTime(sec) { var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  // ----------------------------- reveal auto-hide (wink-killer style) -----------------------------
  // The secret card shows a short countdown and hides itself, so a role is never left on screen for
  // others to glance at. A player can still hide early, and can always re-check later (gated).
  function clearRevealTimer() { if (UI.revealTimer.handle) { clearInterval(UI.revealTimer.handle); UI.revealTimer.handle = null; } }
  function startAutoHide(onExpire) {
    clearRevealTimer();
    var secs = UI.config.revealSeconds || 0;
    if (!secs) return;                       // 0 = manual hide only
    UI.revealTimer.remaining = secs;
    UI.revealTimer.handle = setInterval(function () {
      UI.revealTimer.remaining--;
      var el = app.querySelector('.reveal-countdown');
      if (!el) { clearRevealTimer(); return; }   // screen changed under us
      if (UI.revealTimer.remaining <= 0) { clearRevealTimer(); onExpire(); return; }
      el.textContent = 'Auto-hiding in ' + UI.revealTimer.remaining + 's';
    }, 1000);
  }

  // ----------------------------- boot -----------------------------
  // Test-only hook (no footprint in production: only attached when a test sets window.__WORD_TEST).
  if (window.__WORD_TEST) window.__WORD_UI = { state: function () { return UI.g; }, ui: UI, engine: engine, render: render };
  render();
})();
