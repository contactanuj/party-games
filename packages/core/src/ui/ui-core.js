/*
 * ui-core.js — the shared pass-and-play UI for every game in the family. Reads window.GameCore
 * (engine) + window.PARTY_GAME (this game's definition + presets + meta). No game-specific
 * logic lives here; per-game copy comes from PARTY_GAME / window.PARTY_META.
 *
 * INFORMATION BOUNDARY (the cardinal rule): shared/observable screens render ONLY from
 * engine.publicView() and NEVER show a role/team/card or any role-coded color or icon. Anything
 * private (your dealt role, what you saw at night) appears ONLY behind a per-player handoff
 * gate. During the night the device is handed to EVERY player (real actors + indistinguishable
 * decoys) so observers can't even tell who has a night role.
 */
(function () {
  'use strict';
  var DEF = window.PARTY_GAME;
  var META = window.PARTY_META || {};
  var E = window.GameCore.createEngine(DEF);
  var S = window.PartySound || { play: function () {}, resume: function () {}, setEnabled: function () {}, isEnabled: function () { return true; } };
  var KEY = 'pg_' + DEF.game;
  var REG = {}; DEF.roles.forEach(function (r) { REG[r.id] = r; });

  var view = 'home';      // home | help | setup | play
  var G = null;           // engine state
  var draft = null;       // config being edited
  var ui = {};            // transient per-screen UI state
  var app = document.getElementById('app');

  // ---- persistence (resume an in-progress game) ----
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ view: view, G: G, ui: stripUi() })); } catch (e) {} }
  function stripUi() { return { flow: ui.flow || null }; }
  function loadSaved() { try { var s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function clearSaved() { try { localStorage.removeItem(KEY); } catch (e) {} }

  function esc(s) { return ('' + (s == null ? '' : s)).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function roleName(id) { return (REG[id] && REG[id].name) || id; }
  function title() { return DEF.title || META.title || DEF.game; }

  // =========================================================================
  // Render router
  // =========================================================================
  function render() {
    var html;
    if (view === 'home') html = renderHome();
    else if (view === 'help') html = renderHelp();
    else if (view === 'setup') html = renderSetup();
    else if (view === 'play') html = renderPlay();
    else html = renderHome();
    app.innerHTML = html;
    bind();
    window.scrollTo(0, 0);
  }

  // =========================================================================
  // Home
  // =========================================================================
  function renderHome() {
    var saved = loadSaved();
    var resume = saved && saved.G && saved.G.phase !== 'end' ? '<button class="btn" data-act="resume">Resume game</button>' : '';
    return screen(true,
      '<h1>' + esc(title()) + '</h1>' +
      '<p class="tagline">' + esc(META.tagline || 'A social-deduction party game. One secret night. One vote. Find them out.') + '</p>' +
      resume +
      '<button class="btn" data-act="new">New game</button>' +
      '<button class="btn secondary" data-act="help">How to play &amp; roles</button>' +
      '<p class="footer-note">Pass &amp; play on one device, for ' + minPlayers() + '–' + maxPlayers() + ' players.</p>'
    );
  }
  function minPlayers() { return 3; }
  function maxPlayers() { return 10; }

  // =========================================================================
  // Help / glossary (general info — no secrecy concerns)
  // =========================================================================
  function renderHelp() {
    var rolesByWake = DEF.roles.slice().sort(function (a, b) {
      var aw = a.wake == null ? 999 : a.wake, bw = b.wake == null ? 999 : b.wake; return aw - bw;
    });
    var list = rolesByWake.map(function (r) {
      var team = teamLabel(typeof r.team === 'function' ? 'varies' : r.team);
      return '<div class="panel"><div class="row"><b>' + esc(r.name) + '</b><span class="spacer"></span><span class="pill">' + esc(team) + '</span></div>' +
        '<div class="small muted">' + esc(r.blurb || '') + '</div></div>';
    }).join('');
    return screen(false,
      '<div class="row"><h1>How to play</h1></div>' +
      '<div class="panel"><p><b>Goal.</b> Everyone is secretly dealt a role. Over one night, some roles wake (in order) to peek at or swap cards — so by morning you may not be who you started as. Then everyone discusses and votes; the most-voted player is eliminated. Which team wins depends on who is eliminated.</p>' +
      '<p class="small muted">Your role can change during the night without you knowing. The team that wins is decided by the card you hold at the very end.</p></div>' +
      '<h2>Roles</h2>' + list +
      '<button class="btn secondary" data-act="home">Back</button>'
    );
  }
  function teamLabel(t) {
    var teams = DEF.teams || [];
    for (var i = 0; i < teams.length; i++) if (teams[i].id === t) return teams[i].name;
    if (t === 'varies') return 'Varies';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // =========================================================================
  // Setup / configuration (maximum-configurable, but validated)
  // =========================================================================
  function newDraft(pc) {
    var c = E.defaultConfig(pc);
    c.botCount = 0;
    return c;
  }
  function applyBotNames(d) {
    var pc = d.playerCount, bc = d.botCount || 0;
    for (var i = 0; i < pc; i++) {
      var isBot = i >= pc - bc;
      if (isBot) d.playerNames[i] = 'Bot ' + (i - (pc - bc) + 1);
      else if (/^Bot \d+$/.test(d.playerNames[i] || '')) d.playerNames[i] = 'Player ' + (i + 1);
    }
  }
  function renderSetup() {
    if (!draft) draft = newDraft(5);
    var v = E.validateConfig(draft);
    return screen(false,
      '<div class="row"><h1>New game</h1><span class="spacer"></span><button class="btn ghost small" data-act="home">Cancel</button></div>' +

      // Player count
      '<label class="field">Players</label>' +
      '<div class="stepper panel">' +
      '<button class="stepbtn" data-act="pc-">−</button>' +
      '<span class="val">' + draft.playerCount + '</span>' +
      '<button class="stepbtn" data-act="pc+">+</button>' +
      '</div>' +

      // Bots
      '<label class="field">Computer players (bots)</label>' +
      '<div class="stepper panel"><button class="stepbtn" data-act="bot-">−</button><span class="val">' + (draft.botCount || 0) + '</span><button class="stepbtn" data-act="bot+">+</button></div>' +
      '<p class="small muted">Bots fill seats and play on their own — great for practice or a small group. At least one human always plays.</p>' +

      // Names
      '<label class="field">Player names</label>' +
      '<div class="stack">' + draft.playerNames.map(function (n, i) {
        var bot = i >= draft.playerCount - (draft.botCount || 0);
        return '<input type="text" data-name="' + i + '" value="' + esc(n) + '" ' + (bot ? 'readonly' : '') + ' placeholder="Player ' + (i + 1) + '" />';
      }).join('') + '</div>' +

      // Mode
      '<label class="field">How are you playing?</label>' +
      modeToggle() +

      // Role set editor
      '<h2>Roles in the deck</h2>' +
      '<p class="small muted">You need exactly <b>' + (draft.playerCount + draft.centerCount) + '</b> cards (' + draft.playerCount + ' players + ' + draft.centerCount + ' center). <button class="btn ghost small" style="display:inline-block;width:auto;padding:4px 10px" data-act="preset">Use recommended</button></p>' +
      roleEditor() +
      cardCountBar() +

      // Options
      optionsBlock() +

      // Day timer
      '<label class="field">Day discussion timer</label>' +
      '<div class="stepper panel"><button class="stepbtn" data-act="t-">−</button><span class="val">' + (draft.dayTimerSeconds ? draft.dayTimerSeconds + 's' : 'Off') + '</span><button class="stepbtn" data-act="t+">+</button></div>' +

      // Validation + start
      renderValidation(v) +
      '<button class="btn" data-act="start" ' + (v.ok ? '' : 'disabled') + '>Start game</button>'
    );
  }

  function modeToggle() {
    function opt(val, label, desc) {
      var sel = draft.mode === val ? ' sel' : '';
      return '<div class="choice' + sel + '" data-mode="' + val + '" style="text-align:left">' +
        '<b>' + label + '</b><div class="small muted">' + desc + '</div></div>';
    }
    return '<div class="grid">' +
      opt('digital', 'Digital', 'The phone holds the cards and runs the night for you.') +
      opt('narrator', 'Narrator', 'You use physical cards; the app calls the night order.') +
      '</div>';
  }

  function roleCounts() {
    var counts = {}; draft.roleSet.forEach(function (id) { counts[id] = (counts[id] || 0) + 1; }); return counts;
  }
  function roleEditor() {
    var counts = roleCounts();
    var ordered = DEF.roles.slice().sort(function (a, b) {
      var aw = a.wake == null ? 999 : a.wake, bw = b.wake == null ? 999 : b.wake; return aw - bw;
    });
    return ordered.map(function (r) {
      var c = counts[r.id] || 0;
      return '<div class="panel"><div class="row">' +
        '<div style="flex:1"><b>' + esc(r.name) + '</b> <span class="small muted">' + esc(r.blurb || '') + '</span></div>' +
        '<button class="stepbtn" data-role-minus="' + r.id + '">−</button>' +
        '<span class="val" style="min-width:30px">' + c + '</span>' +
        '<button class="stepbtn" data-role-plus="' + r.id + '">+</button>' +
        '</div></div>';
    }).join('');
  }
  function cardCountBar() {
    var have = draft.roleSet.length, need = draft.playerCount + draft.centerCount;
    var cls = have === need ? 'good' : 'danger';
    return '<div class="panel center-text"><b style="color:var(--' + cls + ')">' + have + ' / ' + need + ' cards</b></div>';
  }

  function optionsBlock() {
    var opts = DEF.defaultOptions || {};
    var keys = Object.keys(opts);
    if (!keys.length) return '';
    var labels = (META.optionLabels) || {};
    return '<h2>House rules</h2>' + keys.map(function (k) {
      var on = draft.options[k];
      return '<div class="toggle panel" data-opt="' + k + '"><div><b>' + esc(labels[k] || k) + '</b></div>' +
        '<div class="sw' + (on ? ' on' : '') + '"><div class="knob"></div></div></div>';
    }).join('');
  }

  function renderValidation(v) {
    if (v.ok && !v.warnings.length) return '';
    return '<div class="stack">' +
      v.errors.map(function (e) { return '<div class="err">⛔ ' + esc(e) + '</div>'; }).join('') +
      v.warnings.map(function (w) { return '<div class="warn">⚠ ' + esc(w) + '</div>'; }).join('') +
      '</div>';
  }

  // =========================================================================
  // Play — dispatch on engine phase + UI flow
  // =========================================================================
  function renderPlay() {
    if (G.mode === 'narrator') return renderNarrator();
    if (G.phase === 'reveal') return renderReveal();
    if (G.phase === 'night') return renderNight();
    if (G.phase === 'day') return renderDay();
    if (G.phase === 'vote') return renderVote();
    if (G.phase === 'end') return renderEnd();
    return renderHome();
  }

  // ---- Initial private role reveal (digital): each player privately sees their card ----
  function renderReveal() {
    if (!ui.flow) ui.flow = { kind: 'reveal', idx: 0, stage: 'gate' };
    var f = ui.flow;
    while (f.idx < G.players.length && G.players[f.idx].bot) f.idx++; // bots have no reveal
    if (f.idx >= G.players.length) { // done revealing -> night
      E.beginNight(G); S.play('night');
      ui.flow = null; save(); return renderNight();
    }
    var p = G.players[f.idx];
    if (f.stage === 'gate') {
      return gateScreen(p.name, 'Make sure only ' + esc(p.name) + ' can see the screen.', 'I am ' + esc(p.name) + ' — show my role', 'reveal-show');
    }
    // show role privately
    var r = REG[p.dealtRole];
    return screen(true,
      '<p class="muted">' + esc(p.name) + ', your secret role is</p>' +
      '<div class="big-role">' + esc(r.name) + '</div>' +
      '<p class="muted" style="max-width:340px">' + esc(r.blurb || '') + '</p>' +
      '<div class="divider"></div>' +
      '<button class="btn" data-act="reveal-next">Hide &amp; pass on</button>'
    );
  }

  // ---- Night: hand the device to EVERY player (real actors + decoys), in resolution order ----
  function buildHandoffs() {
    var sched = G.schedule;
    // Only HUMAN seats get a handoff; bot night actions resolve invisibly.
    var reals = sched.filter(function (st) { return !G.players[st.seat].bot; }).map(function (st) { return { kind: 'real', seat: st.seat }; });
    var actionSeats = {}; sched.forEach(function (st) { actionSeats[st.seat] = true; });
    var result = reals.slice();
    if (G.config.hideRoleHolders !== false) {
      G.players.forEach(function (p) {
        if (!p.bot && !actionSeats[p.seat]) { // decoy for a human with no night action
          var pos = Math.floor(Math.random() * (result.length + 1));
          result.splice(pos, 0, { kind: 'decoy', seat: p.seat });
        }
      });
    }
    return result;
  }
  function renderNight() {
    if (G.phase === 'night') E.autoResolveBotNight(G);          // clear any bot steps first
    if (G.phase !== 'night') { ui.flow = null; save(); return renderDay(); }
    if (!ui.flow || ui.flow.kind !== 'night') ui.flow = { kind: 'night', plan: buildHandoffs(), idx: 0, stage: 'gate', facts: null };
    var f = ui.flow;

    // Drain: if the plan is exhausted but the engine still has steps (e.g. a Doppelgänger
    // re-wake added one, or trailing bot steps), resolve bots then append human steps.
    if (f.idx >= f.plan.length) {
      E.autoResolveBotNight(G);
      if (E.currentStep(G)) { f.plan.push({ kind: 'real', seat: E.currentStep(G).seat }); }
      else { ui.flow = null; save(); return renderDay(); }
    }
    var entry = f.plan[f.idx];
    var liveStep = (entry.kind === 'real') ? E.getStep(G) : null;
    // If a real entry has no live step left (consumed by drains), skip it.
    if (entry.kind === 'real' && !liveStep) { f.idx++; return renderNight(); }
    var who = entry.kind === 'real' ? liveStep.name : G.players[entry.seat].name;

    if (f.stage === 'gate') {
      return gateScreen(who, 'Eyes on your own screen only. (Everyone takes a turn — passing the phone reveals nothing.)',
        'I am ' + esc(who) + ' — continue', 'night-open');
    }
    if (entry.kind === 'decoy') {
      return screen(true,
        '<p class="muted">Night</p><div class="big-role">…</div>' +
        '<p class="muted" style="max-width:320px">Nothing for you to do right now. Tap to pass the phone along — don\'t let anyone read your screen.</p>' +
        '<button class="btn secondary" data-act="night-next">Pass on</button>'
      );
    }
    // real action
    if (f.stage === 'act') return renderAct(liveStep);
    if (f.stage === 'result') return renderActResult(f.facts);
    return renderNight();
  }

  function renderAct(step) {
    ui.inputs = ui.inputs || {};
    if (step.feared) {
      return screen(true,
        '<p class="muted">Your secret role</p>' +
        '<div class="big-role" style="font-size:26px">' + esc(step.roleName) + '</div>' +
        '<div class="panel">You carry the <b>Mark of Fear</b> — you cannot use your power tonight.</div>' +
        '<button class="btn" data-act="act-confirm">Continue</button>'
      );
    }
    var inputsHtml = step.inputs.map(function (spec) { return renderInput(spec); }).join('');
    var canConfirm = clientInputsValid(step.inputs, ui.inputs);
    return screen(false,
      '<p class="muted">Your secret role</p>' +
      '<div class="big-role" style="font-size:26px">' + esc(step.roleName) + '</div>' +
      '<p class="small muted">' + esc(step.prompt) + '</p>' +
      '<div class="divider"></div>' +
      inputsHtml +
      '<button class="btn" data-act="act-confirm" ' + (canConfirm ? '' : 'disabled') + '>Confirm</button>'
    );
  }
  function renderInput(spec) {
    if (spec.visibleWhen) {
      var k = Object.keys(spec.visibleWhen)[0];
      if (ui.inputs[k] !== spec.visibleWhen[k]) return '';
    }
    var html = '<label class="field">' + esc(spec.label || '') + '</label>';
    if (spec.type === 'choice') {
      html += '<div class="grid">' + spec.options.map(function (o) {
        var sel = ui.inputs[spec.id] === o.value ? ' sel' : '';
        return '<div class="choice' + sel + '" data-choice="' + spec.id + '" data-val="' + esc(o.value) + '">' + esc(o.label) + '</div>';
      }).join('') + '</div>';
    } else if (spec.type === 'pickPlayer') {
      html += '<div class="grid">' + G.players.map(function (p) {
        if (p.seat === ui.curSelf && !spec.allowSelf) return '';
        if (spec.exclude && spec.exclude.indexOf(p.seat) !== -1) return '';
        var sel = ui.inputs[spec.id] === p.seat ? ' sel' : '';
        return '<div class="choice' + sel + '" data-pick="' + spec.id + '" data-seat="' + p.seat + '">' + esc(p.name) + '</div>';
      }).join('') + (spec.optional ? '<div class="choice' + (ui.inputs[spec.id] === null ? ' sel' : '') + '" data-pick="' + spec.id + '" data-seat="null">Skip</div>' : '') + '</div>';
    } else if (spec.type === 'pickCenter') {
      var cur = ui.inputs[spec.id] || [];
      html += '<div class="grid">' + range(G.config.centerCount).map(function (i) {
        var sel = cur.indexOf(i) !== -1 ? ' sel' : '';
        return '<div class="choice' + sel + '" data-center="' + spec.id + '" data-idx="' + i + '" data-count="' + (spec.count || 1) + '">Center ' + (i + 1) + '</div>';
      }).join('') + '</div><div class="small muted">Pick ' + (spec.count || 1) + '.</div>';
    }
    return html;
  }
  function clientInputsValid(spec, inputs) {
    for (var i = 0; i < spec.length; i++) {
      var s = spec[i];
      if (s.visibleWhen) { var k = Object.keys(s.visibleWhen)[0]; if (inputs[k] !== s.visibleWhen[k]) continue; }
      var val = inputs[s.id];
      var empty = (val == null || (Array.isArray(val) && val.length === 0));
      if (empty && !s.optional && !(s.type === 'pickPlayer' && val === null)) return false;
      if (s.type === 'pickCenter' && Array.isArray(val) && s.count && val.length !== s.count) return false;
    }
    return true;
  }
  function renderActResult(facts) {
    var lines = (facts || []).map(factText).filter(Boolean);
    if (!lines.length) lines = ['Done.'];
    return screen(true,
      '<p class="muted">You learned</p>' +
      lines.map(function (l) { return '<div class="panel">' + esc(l) + '</div>'; }).join('') +
      '<div class="divider"></div>' +
      '<button class="btn" data-act="night-next">Hide &amp; pass on</button>'
    );
  }
  function factText(f) {
    switch (f.kind) {
      case 'sawCard': return 'You saw ' + f.pos + ': ' + f.roleName + '.';
      case 'allies':
        if (!f.allies.length) return 'You found no partners — you appear to be alone.';
        return 'With you: ' + f.allies.map(function (a) { return a.name; }).join(', ') + '.';
      case 'copied': return 'You are now the ' + f.roleName + '.';
      case 'piJoin': return 'You investigated a ' + (f.team === 'tanner' ? 'Tanner' : 'Werewolf') + ' — you have joined them.';
      case 'shielded': return 'You placed a protective shield on a card.';
      case 'placedArtifact': return 'You placed a face-down Artifact (you did not see which).';
      case 'revealerHidden': return 'You flipped a card, but it was a Werewolf or Tanner — turned back face-down.';
      case 'feared': return 'You carry the Mark of Fear — you could not act tonight.';
      case 'mark': return 'You placed a mark.';
      case 'markMove': return 'You moved a mark.';
      case 'blocked': case 'swapBlocked': case 'tokenBlocked': return 'That card was protected — nothing happened.';
      case 'noop': return f.reason || 'You did nothing.';
      default: return '';
    }
  }

  // ---- Day (discussion + optional timer) ----
  function renderDay() {
    var timer = '';
    if (G.config.dayTimerSeconds) {
      if (ui.timerLeft == null) ui.timerLeft = G.config.dayTimerSeconds;
      timer = '<div class="timer">' + fmt(ui.timerLeft) + '</div>';
    }
    var pv = E.publicView(G);
    var revLines = (pv.revealedCards || []).map(function (r) { return esc(r.name) + ' — ' + esc(r.roleName); })
      .concat((pv.revealedCenter || []).map(function (r) { return 'Center ' + (r.index + 1) + ' — ' + esc(r.roleName); }));
    var revealed = revLines.length ? '<div class="panel"><b>Turned face-up for all to see:</b><br>' + revLines.join('<br>') + '</div>' : '';
    return screen(true,
      '<h1>Daybreak</h1>' +
      '<p class="muted" style="max-width:360px">Everyone wakes. Discuss what happened in the night — claim roles, accuse, defend. Remember: cards may have moved.</p>' +
      revealed +
      timer +
      '<button class="btn" data-act="to-vote">Everyone ready — vote</button>' +
      '<button class="btn ghost" data-act="recheck">Privately re-check my role</button>'
    );
  }

  // ---- Vote (secret pass-and-play to keep it simultaneous) ----
  function renderVote() {
    if (!ui.flow || ui.flow.kind !== 'vote') {
      E.autoCastBotVotes(G); // bots vote automatically
      ui.flow = { kind: 'vote', idx: 0, stage: 'gate', humans: G.players.filter(function (p) { return !p.bot; }).map(function (p) { return p.seat; }) };
    }
    var f = ui.flow;
    if (f.idx >= f.humans.length) {
      E.resolveVotes(G); S.play('day'); ui.flow = null; save(); return renderEnd();
    }
    var p = G.players[f.humans[f.idx]];
    if (f.stage === 'gate') {
      return gateScreen(p.name, 'Cast your vote in secret — all votes reveal together.', 'I am ' + esc(p.name) + ' — vote', 'vote-open');
    }
    ui.curSelf = p.seat;
    return screen(false,
      '<p class="muted">' + esc(p.name) + ', point at the player you want eliminated.</p>' +
      '<div class="grid">' + G.players.map(function (q) {
        if (q.seat === p.seat) return '';
        return '<div class="choice" data-vote="' + q.seat + '">' + esc(q.name) + (q.bot ? ' 🤖' : '') + '</div>';
      }).join('') + '</div>'
    );
  }

  // ---- End: full reveal + recap (post-game, revealing all is correct) ----
  function renderEnd() {
    var rev = E.endReveal(G);
    S.play('win');
    var winners = rev.winners.length ? rev.winners.map(teamLabel).join(' &amp; ') : 'No one';
    var deaths = rev.deaths.length ? rev.deaths.map(function (s) { return G.players[s].name; }).join(', ') : 'No one';
    var rows = rev.seats.map(function (s) {
      var changed = s.dealtRole !== s.finalRole;
      return '<div class="reveal-row"><div class="nm">' + esc(s.name) + (s.alive ? '' : ' <span class="dead-tag">✗ eliminated</span>') + '</div>' +
        '<div style="text-align:right">' + esc(s.finalRoleName) +
        (changed ? '<div class="small muted">started as ' + esc(s.dealtRoleName) + '</div>' : '') +
        '<div class="small muted">' + esc(teamLabel(s.team)) + '</div></div></div>';
    }).join('');
    var center = rev.center.map(function (c) { return '<span class="pill">' + esc(c.roleName) + '</span>'; }).join('');
    return screen(false,
      '<h1 class="result-win">' + winners + ' win!</h1>' +
      '<p class="muted">Eliminated: ' + esc(deaths) + '</p>' +
      '<h2>Final roles</h2>' + rows +
      '<h3>Center cards</h3><div>' + center + '</div>' +
      '<div class="divider"></div>' +
      '<button class="btn" data-act="play-again">Play again (same setup)</button>' +
      '<button class="btn secondary" data-act="new">New setup</button>' +
      '<button class="btn ghost" data-act="home">Home</button>'
    );
  }

  // ---- Narrator mode (physical cards): app just calls the night order + a day timer ----
  function renderNarrator() {
    if (!ui.flow || ui.flow.kind !== 'narrator') {
      ui.flow = { kind: 'narrator', lines: E.narrationForRoleSet(G.config.roleSet), idx: 0, stage: 'script' };
    }
    var f = ui.flow;
    if (f.stage === 'script') {
      var line = f.lines[f.idx];
      var isLast = f.idx >= f.lines.length - 1;
      return screen(true,
        '<p class="muted">Narrator — read aloud</p>' +
        '<div class="script-line ' + (line.kind === 'all' ? 'all' : '') + '" style="font-size:22px">' + esc(line.text) + '</div>' +
        '<div class="row"><button class="btn secondary" data-act="narr-prev" ' + (f.idx === 0 ? 'disabled' : '') + '>Back</button>' +
        '<button class="btn" data-act="narr-next">' + (isLast ? 'Go to discussion' : 'Next') + '</button></div>' +
        '<p class="footer-note">' + (f.idx + 1) + ' / ' + f.lines.length + '</p>'
      );
    }
    if (f.stage === 'day') {
      var timer = G.config.dayTimerSeconds ? '<div class="timer">' + fmt(ui.timerLeft == null ? (ui.timerLeft = G.config.dayTimerSeconds) : ui.timerLeft) + '</div>' : '';
      return screen(true,
        '<h1>Discuss</h1><p class="muted">Talk it out, then vote together — point on three.</p>' + timer +
        '<button class="btn" data-act="narr-vote">Time to vote</button>'
      );
    }
    return screen(true,
      '<h1>Vote!</h1><p class="muted">On the count of three, everyone points. Most votes is eliminated (ties: all tied are eliminated). Reveal cards and work out who won.</p>' +
      '<button class="btn" data-act="home">Done</button>'
    );
  }

  // =========================================================================
  // Shared screen helpers
  // =========================================================================
  function screen(center, body) { return '<div class="screen' + (center ? ' center' : '') + '">' + body + '</div>'; }
  function gateScreen(who, hint, btnLabel, act) {
    return '<div class="screen"><div class="gate">' +
      '<p class="muted">Pass the phone to</p>' +
      '<div class="who">' + esc(who) + '</div>' +
      '<p class="hint">' + esc(hint) + '</p>' +
      '<button class="btn" data-act="' + act + '">' + btnLabel + '</button>' +
      '</div></div>';
  }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function fmt(s) { var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }

  // =========================================================================
  // Event binding
  // =========================================================================
  function bind() {
    S.resume();
    [].forEach.call(app.querySelectorAll('[data-act]'), function (el) {
      el.addEventListener('click', function () { S.play('tap'); onAct(el.getAttribute('data-act')); });
    });
    // setup interactions
    [].forEach.call(app.querySelectorAll('[data-name]'), function (el) {
      el.addEventListener('input', function () { draft.playerNames[+el.getAttribute('data-name')] = el.value; });
    });
    [].forEach.call(app.querySelectorAll('[data-mode]'), function (el) {
      el.addEventListener('click', function () { draft.mode = el.getAttribute('data-mode'); render(); });
    });
    [].forEach.call(app.querySelectorAll('[data-role-plus]'), function (el) {
      el.addEventListener('click', function () { draft.roleSet.push(el.getAttribute('data-role-plus')); render(); });
    });
    [].forEach.call(app.querySelectorAll('[data-role-minus]'), function (el) {
      el.addEventListener('click', function () { var id = el.getAttribute('data-role-minus'); var i = draft.roleSet.indexOf(id); if (i !== -1) draft.roleSet.splice(i, 1); render(); });
    });
    [].forEach.call(app.querySelectorAll('[data-opt]'), function (el) {
      el.addEventListener('click', function () { var k = el.getAttribute('data-opt'); draft.options[k] = !draft.options[k]; render(); });
    });
    // night/vote interactions
    [].forEach.call(app.querySelectorAll('[data-choice]'), function (el) {
      el.addEventListener('click', function () { ui.inputs[el.getAttribute('data-choice')] = el.getAttribute('data-val'); render(); });
    });
    [].forEach.call(app.querySelectorAll('[data-pick]'), function (el) {
      el.addEventListener('click', function () {
        var seat = el.getAttribute('data-seat'); ui.inputs[el.getAttribute('data-pick')] = (seat === 'null' ? null : +seat); render();
      });
    });
    [].forEach.call(app.querySelectorAll('[data-center]'), function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-center'), idx = +el.getAttribute('data-idx'), count = +el.getAttribute('data-count');
        var arr = ui.inputs[id] || []; var at = arr.indexOf(idx);
        if (at !== -1) arr.splice(at, 1); else { if (arr.length >= count) arr.shift(); arr.push(idx); }
        ui.inputs[id] = arr; render();
      });
    });
    [].forEach.call(app.querySelectorAll('[data-vote]'), function (el) {
      el.addEventListener('click', function () {
        var seat = +el.getAttribute('data-vote');
        E.castVote(G, ui.flow.humans[ui.flow.idx], seat);
        S.play('vote'); ui.flow.idx++; ui.flow.stage = 'gate'; save(); render();
      });
    });
  }

  // Stepper bounds for player count.
  function clampPc(pc) { return Math.max(3, Math.min(20, pc)); }

  function onAct(a) {
    switch (a) {
      case 'home': view = 'home'; ui = {}; render(); break;
      case 'help': view = 'help'; render(); break;
      case 'new': draft = newDraft(draft ? draft.playerCount : 5); view = 'setup'; render(); break;
      case 'resume': { var s = loadSaved(); G = s.G; ui = {}; view = 'play'; render(); break; }

      // setup steppers
      case 'pc+': setPc(draft.playerCount + 1); break;
      case 'pc-': setPc(draft.playerCount - 1); break;
      case 'bot+': setBots((draft.botCount || 0) + 1); break;
      case 'bot-': setBots((draft.botCount || 0) - 1); break;
      case 't+': draft.dayTimerSeconds = Math.min(600, (draft.dayTimerSeconds || 0) + 30); render(); break;
      case 't-': draft.dayTimerSeconds = Math.max(0, (draft.dayTimerSeconds || 0) - 30); render(); break;
      case 'preset': { var pre = E.presetRoleSet(draft.playerCount); if (pre) draft.roleSet = pre; render(); break; }
      case 'start': startGame(); break;

      // reveal
      case 'reveal-show': ui.flow.stage = 'show'; S.play('reveal'); render(); break;
      case 'reveal-next': ui.flow.idx++; ui.flow.stage = 'gate'; S.play('pass'); render(); break;

      // night
      case 'night-open': {
        var entry = ui.flow.plan[ui.flow.idx];
        if (entry.kind === 'decoy') { ui.flow.stage = 'decoy'; }
        else { ui.curSelf = E.getStep(G).seat; ui.inputs = {}; ui.flow.stage = 'act'; }
        render(); break;
      }
      case 'act-confirm': {
        try {
          var facts = E.submitStep(G, ui.inputs);
          ui.flow.facts = facts; ui.flow.stage = 'result'; S.play('reveal'); save(); render();
        } catch (e) { alert(e.message); }
        break;
      }
      case 'night-next': ui.flow.idx++; ui.flow.stage = 'gate'; S.play('pass'); render(); break;

      // day
      case 'to-vote': E.beginVote(G); ui.timerLeft = null; stopTimer(); ui.flow = null; save(); render(); break;
      case 'recheck': openRecheck(); break;

      // vote-open
      case 'vote-open': ui.flow.stage = 'pick'; render(); break;

      // end
      case 'play-again': playAgain(); break;

      // narrator
      case 'narr-next': narrNext(); break;
      case 'narr-prev': ui.flow.idx = Math.max(0, ui.flow.idx - 1); render(); break;
      case 'narr-vote': ui.flow.stage = 'vote'; render(); break;
    }
  }

  function setPc(pc) {
    pc = clampPc(pc);
    draft.playerCount = pc;
    // resize names
    while (draft.playerNames.length < pc) draft.playerNames.push('Player ' + (draft.playerNames.length + 1));
    draft.playerNames = draft.playerNames.slice(0, pc);
    // reload recommended set for the new count if available, else keep (validation will guide)
    var pre = E.presetRoleSet(pc); if (pre) draft.roleSet = pre;
    if (draft.botCount > pc - 1) draft.botCount = pc - 1;
    applyBotNames(draft);
    render();
  }
  function setBots(n) {
    draft.botCount = Math.max(0, Math.min(draft.playerCount - 1, n));
    applyBotNames(draft);
    render();
  }

  function startGame() {
    var v = E.validateConfig(draft);
    if (!v.ok) { render(); return; }
    var seed = ((Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    G = E.newGame(draft, seed);
    ui = {};
    view = 'play';
    if (G.mode === 'narrator') { /* narrator uses the role set, not the deal */ }
    save(); render();
    if (G.config.dayTimerSeconds) {/* timer starts when day begins */}
  }

  function playAgain() {
    var seed = ((Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    G = E.newGame(G.config, seed); ui = {}; save(); render();
  }

  // Re-check own role during the day — gated per player, reveals only to that player.
  function openRecheck() {
    ui.recheck = { idx: 0, stage: 'gate' };
    view = 'play';
    // simple inline flow using prompt-free screens
    renderRecheck();
  }
  function renderRecheck() {
    // minimal: reuse the reveal pattern but from privateReveal (dealt role + what they learned)
    var rc = ui.recheck;
    if (rc.idx >= G.players.length) { ui.recheck = null; render(); return; }
    var p = G.players[rc.idx];
    if (rc.stage === 'gate') {
      app.innerHTML = gateScreen(p.name, 'Only ' + esc(p.name) + ' should look.', 'I am ' + esc(p.name), 'rc-show');
      bindRecheck(); return;
    }
    var pr = E.privateReveal(G, p.seat);
    var learned = pr.knowledge.map(factText).filter(Boolean);
    var extras = '';
    if (pr.mark && pr.mark !== 'clarity') {
      var md = (DEF.markDesc && DEF.markDesc[pr.mark]) || pr.mark;
      extras += '<div class="panel">Your Mark: <b>' + esc(md) + '</b></div>';
    }
    (pr.tokens || []).forEach(function (t) {
      if (t.indexOf('artifact:') === 0) {
        var key = t.split(':')[1], desc = (DEF.artifactDesc && DEF.artifactDesc[key]) || 'an Artifact';
        extras += '<div class="panel">Your Artifact: ' + esc(desc) + '</div>';
      }
    });
    app.innerHTML = screen(true,
      '<p class="muted">' + esc(p.name) + ', you started as</p>' +
      '<div class="big-role">' + esc(pr.dealtRoleName) + '</div>' + extras +
      (learned.length ? '<div class="divider"></div><p class="muted">What you saw in the night:</p>' + learned.map(function (l) { return '<div class="panel">' + esc(l) + '</div>'; }).join('') : '') +
      '<div class="divider"></div><button class="btn" data-act="rc-next">Hide &amp; pass on</button>'
    );
    bindRecheck();
  }
  function bindRecheck() {
    [].forEach.call(app.querySelectorAll('[data-act]'), function (el) {
      el.addEventListener('click', function () {
        var a = el.getAttribute('data-act');
        if (a === 'rc-show') { ui.recheck.stage = 'show'; renderRecheck(); }
        else if (a === 'rc-next') { ui.recheck.idx++; ui.recheck.stage = 'gate'; renderRecheck(); }
        else onAct(a);
      });
    });
  }

  function narrNext() {
    var f = ui.flow;
    if (f.idx >= f.lines.length - 1) { f.stage = 'day'; ui.timerLeft = null; }
    else f.idx++;
    render();
    if (f.stage === 'day' && G.config.dayTimerSeconds) startTimer();
  }

  // ---- day timer ----
  var timerHandle = null;
  function startTimer() {
    stopTimer();
    timerHandle = setInterval(function () {
      if (ui.timerLeft == null) ui.timerLeft = G.config.dayTimerSeconds;
      ui.timerLeft--;
      if (ui.timerLeft <= 0) { ui.timerLeft = 0; stopTimer(); S.play('day'); }
      else if (ui.timerLeft <= 5) S.play('tick');
      var el = app.querySelector('.timer'); if (el) el.textContent = fmt(ui.timerLeft);
    }, 1000);
  }
  function stopTimer() { if (timerHandle) { clearInterval(timerHandle); timerHandle = null; } }

  // Start the day timer when entering the day screen (digital mode).
  var _origRenderDay = renderDay;
  renderDay = function () { var h = _origRenderDay(); if (G.config.dayTimerSeconds && !timerHandle) setTimeout(startTimer, 0); return h; };

  // Boot
  render();
})();
