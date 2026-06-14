/*
 * ui.werewolf.smoke.test.js - loads the REAL shared UI against a DOM stub and drives a full
 * pass-and-play game by clicking. Asserts the INFORMATION BOUNDARY: no role name ever appears
 * on a shared/observable screen (handoff gates, decoy night screens, the day screen, vote
 * screens). Private screens (your reveal, your night action, the post-game reveal) may show
 * roles and are not asserted against.
 *
 * Run: node tests/ui.werewolf.smoke.test.js
 */
'use strict';
var path = require('path');
function reqCore(p) {
  try { return require('@partydeck/core/' + p.replace(/\.js$/, '')); }
  catch (e) {
    var rel = (/^engine\//.test(p) || /^ui\//.test(p)) ? 'src/' + p : p;
    return require(path.resolve(__dirname, '../../../packages/core/' + rel));
  }
}

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } }

var dom = reqCore('tests/helpers/dom-stub.js');
var app = dom.install();

// Wire the globals the UI expects, then boot the UI (its IIFE renders on require).
reqCore('engine/core-engine.js');        // -> window.GameCore
require('../src/roles.js');               // -> window.PARTY_GAME
reqCore('ui/sound.js');                   // -> window.PartySound (safe no-op without WebAudio)
require('../src/ui-glue.js');             // -> window.PARTY_META
reqCore('ui/ui-core.js');                 // boots: renders Home

var WEREWOLF = require('../src/roles.js');
var ROLE_NAMES = WEREWOLF.roles.map(function (r) { return r.name; });

function html() { return app.innerHTML; }
function nodes(sel) { return app.querySelectorAll(sel); }
function byAct(v) { return nodes('[data-act]').filter(function (n) { return n.getAttribute('data-act') === v; })[0]; }
function clickAct(v) { var n = byAct(v); if (!n) throw new Error('no [data-act="' + v + '"] on screen: ' + html().slice(0, 120)); n.click(); }

function assertNoLeak(where) {
  var h = html();
  ROLE_NAMES.forEach(function (rn) {
    ok(h.indexOf('>' + rn) === -1 && h.indexOf(rn + '<') === -1 && h.indexOf(' ' + rn + ' ') === -1,
      'no role-name leak ("' + rn + '") on shared screen: ' + where);
  });
}

// Satisfy whatever inputs the current night action needs, then Confirm.
function firstUnsatisfiedGroup(list, attr) {
  var groups = {};
  list.forEach(function (n) { var id = n.getAttribute(attr); (groups[id] = groups[id] || []).push(n); });
  var keys = Object.keys(groups);
  for (var i = 0; i < keys.length; i++) {
    var g = groups[keys[i]];
    var sel = g.some(function (x) { return / sel/.test(' ' + x._class); });
    if (!sel) return g;
  }
  return null;
}
function autoAct() {
  for (var i = 0; i < 14; i++) {
    var confirm = byAct('act-confirm');
    if (confirm && !confirm.disabled) { confirm.click(); return; }
    var cg = firstUnsatisfiedGroup(nodes('[data-choice]'), 'data-choice');
    if (cg) { cg[0].click(); continue; }
    var pg = firstUnsatisfiedGroup(nodes('[data-pick]'), 'data-pick');
    if (pg) { pg[0].click(); continue; }
    var centers = nodes('[data-center]');
    if (centers.length) {
      var need = +centers[0].getAttribute('data-count');
      var selCount = centers.filter(function (c) { return / sel/.test(' ' + c._class); }).length;
      var unsel = centers.filter(function (c) { return !/ sel/.test(' ' + c._class); });
      if (selCount < need && unsel.length) { unsel[0].click(); continue; }
    }
    break;
  }
  var c2 = byAct('act-confirm'); if (c2 && !c2.disabled) c2.click();
}

function playOneGame(label, botClicks, centerDelta) {
  // Home -> setup -> start
  clickAct('new');
  ok(/New game/.test(html()), label + ': reached setup');
  for (var b = 0; b < (botClicks || 0); b++) clickAct('bot+');
  var cd = centerDelta || 0;                                  // play at a non-default center count
  for (var cdi = 0; cdi < Math.abs(cd); cdi++) clickAct(cd < 0 ? 'cc-' : 'cc+');
  clickAct('start');
  ok(/Pass the phone to/.test(html()), label + ': reached the first private reveal gate');

  var guard = 0, sawDecoy = false, sawGate = false, sawDay = false, sawVoteGate = false;
  while (guard++ < 800) {
    var h = html();
    if (/result-win/.test(h)) break;                      // END reached
    if (byAct('reveal-show')) { assertNoLeak('reveal-gate'); sawGate = true; clickAct('reveal-show'); }
    else if (byAct('reveal-next')) { clickAct('reveal-next'); }            // private
    else if (byAct('night-open')) { assertNoLeak('night-gate'); clickAct('night-open'); }
    else if (byAct('act-confirm')) { autoAct(); }                          // private
    else if (/Nothing for you to do/.test(h)) { assertNoLeak('night-decoy'); sawDecoy = true; clickAct('night-next'); }
    else if (byAct('night-next')) { clickAct('night-next'); }              // private result
    else if (byAct('to-vote')) { assertNoLeak('day'); sawDay = true; clickAct('to-vote'); }
    else if (byAct('vote-open')) { assertNoLeak('vote-gate'); sawVoteGate = true; clickAct('vote-open'); }
    else if (nodes('[data-vote]').length) { assertNoLeak('vote-pick'); nodes('[data-vote]')[0].click(); }
    else { ok(false, label + ': UI got stuck at: ' + h.slice(0, 160)); break; }
  }
  ok(/result-win/.test(html()), label + ': game reached an end/result screen');
  ok(sawGate && sawDay && sawVoteGate, label + ': exercised reveal gate, day, and vote screens');
  // End screen (private/post-game) legitimately shows roles:
  ok(ROLE_NAMES.some(function (rn) { return html().indexOf(rn) !== -1; }), label + ': end reveal shows final roles');
  // back home for the next game
  clickAct('home');
}

console.log('\n# config integrity - every role (incl. Villager) is freely editable; Start gated on exact count');
(function () {
  function deck() { var m = html().match(/(\d+) \/ (\d+) cards/); return m ? { have: +m[1], need: +m[2] } : null; }
  function start() { return byAct('start'); }
  function rmin(id) { return nodes('[data-role-minus]').filter(function (n) { return n.getAttribute('data-role-minus') === id; })[0]; }
  function rplus(id) { return nodes('[data-role-plus]').filter(function (n) { return n.getAttribute('data-role-plus') === id; })[0]; }
  clickAct('new');

  // (a) every player count snaps to a balanced, startable deck (= players + center)
  for (var i = 0; i < 6; i++) { if (byAct('pc+')) clickAct('pc+'); var d = deck(); ok(d && d.have === d.need, 'pc+ -> balanced deck ' + JSON.stringify(d)); ok(start() && !start().disabled, 'pc+ -> Start enabled'); }
  for (var j = 0; j < 8; j++) { if (byAct('pc-')) clickAct('pc-'); var d2 = deck(); ok(d2 && d2.have === d2.need, 'pc- -> balanced deck ' + JSON.stringify(d2)); }

  // (b) THE REGRESSION: the Villager (normal) role must be directly reducible
  var vm = rmin('villager');
  ok(!!vm && !vm.disabled, 'Villager has an ENABLED minus button (the reported bug: it had none)');
  var bV = deck();
  vm.click();
  var aV = deck();
  ok(aV && aV.have === bV.have - 1, 'removing a Villager lowers the deck count (' + JSON.stringify(bV) + ' -> ' + JSON.stringify(aV) + ')');
  ok(aV.have < aV.need, 'deck is now short of the needed count');
  ok(start() && start().disabled, 'Start is DISABLED while the deck is off-count');
  ok(/Add 1 more card to start/.test(html()), 'Start button says exactly how many to add');

  // (c) one-tap "Fill with Villagers" rebalances and re-enables Start
  ok(!!byAct('fillv'), '"Fill with Villagers" offered while short');
  clickAct('fillv');
  var d3 = deck();
  ok(d3 && d3.have === d3.need, 'Fill with Villagers restores the exact count');
  ok(start() && !start().disabled, 'Start re-enabled after rebalancing');

  // (d) adding a special past the exact count over-fills and re-disables Start with a remove hint
  var p = nodes('[data-role-plus]').filter(function (n) { return !n.disabled; })[0];
  if (p) {
    p.click();
    var d4 = deck();
    ok(d4 && d4.have > d4.need, 'adding past the count over-fills the deck (' + JSON.stringify(d4) + ')');
    ok(start() && start().disabled, 'Start disabled when over-count');
    ok(/Remove \d+ card/.test(html()), 'Start button says to remove cards');
  }

  // (e) per-role max-copies cap still holds; the Villager filler is the only uncapped role
  clickAct('preset');
  ok(/\(max \d+\)/.test(html()), 'capped roles show their max');
  ok(rplus('villager') && !rplus('villager').disabled, 'Villager (filler) is never capped');
  var d5 = deck();
  ok(d5 && d5.have === d5.need, '"Use recommended" yields an exact, startable deck');

  // (f) center cards are configurable: the stepper moves the needed count and the deck rebalances
  clickAct('preset');
  var nB = deck().need;
  ok(byAct('cc+') && byAct('cc-'), 'center-card stepper is present');
  clickAct('cc+'); var nUp = deck();
  ok(nUp && nUp.need === nB + 1 && nUp.have === nUp.need, 'cc+ raises the needed count and rebalances (' + JSON.stringify(nUp) + ')');
  clickAct('cc-'); clickAct('cc-'); var nDn = deck();
  ok(nDn && nDn.need === nB - 1 && nDn.have === nDn.need, 'cc- lowers the needed count and rebalances (' + JSON.stringify(nDn) + ')');
  for (var z = 0; z < 8; z++) clickAct('cc-'); var nMin = deck();
  ok(nMin && nMin.need === nB - 2 && nMin.have === nMin.need, 'center clamps at its minimum (1) and stays balanced (' + JSON.stringify(nMin) + ')');
  for (var z2 = 0; z2 < 8; z2++) clickAct('cc+'); var nMax = deck();
  ok(nMax && nMax.need === nB + 2 && nMax.have === nMax.need, 'center clamps at its maximum (5) and stays balanced (' + JSON.stringify(nMax) + ')');
  clickAct('preset');
  clickAct('home');
})();

console.log('\n# UI smoke - full pass-and-play games, no-leak assertions');
playOneGame('game A');
playOneGame('game B');
playOneGame('game C (3 bots)', 3);   // bot players fill seats; night/vote auto-resolve for them
playOneGame('game D (1 center card, 4 bots)', 4, -2);  // Seer peeks 2 but only 1 center -> clamp must not stall
playOneGame('game E (5 center cards, 4 bots)', 4, 2);  // a deck heavier on undealt center cards

// Narrator mode: switch the draft to narrator, start, and walk the script (no leaks asserted - // the script names roles aloud by design, but it shows no player's secret identity).
console.log('\n# Narrator mode walkthrough');
(function () {
  clickAct('new');
  // toggle to narrator
  var narr = nodes('[data-mode]').filter(function (n) { return n.getAttribute('data-mode') === 'narrator'; })[0];
  ok(!!narr, 'narrator mode option present');
  narr.click();
  clickAct('start');
  ok(/Narrator/.test(html()) || /read aloud/.test(html()), 'narrator script screen shown');
  var guard = 0;
  while (guard++ < 100 && byAct('narr-next')) clickAct('narr-next');
  ok(/Discuss/.test(html()), 'narrator reaches the discussion screen');
  clickAct('narr-vote');
  ok(/Vote!/.test(html()), 'narrator reaches the vote screen');
  clickAct('home');
})();

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
