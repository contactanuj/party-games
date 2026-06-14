/*
 * ui.werewolf.smoke.test.js — loads the REAL shared UI against a DOM stub and drives a full
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

function playOneGame(label, botClicks) {
  // Home -> setup -> start
  clickAct('new');
  ok(/New game/.test(html()), label + ': reached setup');
  for (var b = 0; b < (botClicks || 0); b++) clickAct('bot+');
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

console.log('\n# config integrity — deck always = players + center; cannot be set against the count');
(function () {
  function deck() { var m = html().match(/(\d+) \/ (\d+) cards/); return m ? { have: +m[1], need: +m[2] } : null; }
  clickAct('new');
  // changing the player count always leaves a valid deck and an enabled Start
  for (var i = 0; i < 6; i++) { if (byAct('pc+')) clickAct('pc+'); var d = deck(); ok(d && d.have === d.need, 'deck matches need after pc+ (' + JSON.stringify(d) + ')'); ok(byAct('start') && !byAct('start').disabled, 'Start enabled at a valid count'); }
  for (var j = 0; j < 8; j++) { if (byAct('pc-')) clickAct('pc-'); var d2 = deck(); ok(d2 && d2.have === d2.need, 'deck matches need after pc-'); }
  // adding a special role keeps the deck size locked (swaps out a Villager)
  var before = deck();
  var plus = nodes('[data-role-plus]').filter(function (n) { return !n.disabled; })[0];
  if (plus) { plus.click(); var after = deck(); ok(after.have === after.need && after.have === before.have, 'adding a role keeps the deck size locked'); }
  // no matter how many adds, the deck can never exceed the needed count
  for (var k = 0; k < 60; k++) { var p = nodes('[data-role-plus]').filter(function (n) { return !n.disabled; }); if (!p.length) break; p[0].click(); }
  var d3 = deck();
  ok(d3 && d3.have === d3.need, 'deck stays exactly = need after exhaustive adds (' + JSON.stringify(d3) + ')');
  ok(byAct('start') && !byAct('start').disabled, 'still a startable (valid) configuration');
  clickAct('home');
})();

console.log('\n# UI smoke — full pass-and-play games, no-leak assertions');
playOneGame('game A');
playOneGame('game B');
playOneGame('game C (3 bots)', 3);   // bot players fill seats; night/vote auto-resolve for them

// Narrator mode: switch the draft to narrator, start, and walk the script (no leaks asserted —
// the script names roles aloud by design, but it shows no player's secret identity).
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
