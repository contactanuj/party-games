/*
 * ui.alien.smoke.test.js - drives full Alien games through the real shared UI and asserts the
 * no-leak boundary on handoff gates, decoy night screens, and vote screens. The DAY screen is
 * exempt because the Exposer may turn center cards face-up there. Run: node tests/ui.alien.smoke.test.js
 */
'use strict';
var path = require('path');
function reqCore(p) {
  try { return require('@partydeck/core/' + p.replace(/\.js$/, '')); }
  catch (e) { var rel = (/^engine\//.test(p) || /^ui\//.test(p)) ? 'src/' + p : p; return require(path.resolve(__dirname, '../../../packages/core/' + rel)); }
}
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } }

var dom = reqCore('tests/helpers/dom-stub.js');
var app = dom.install();
reqCore('engine/core-engine.js');
require('../src/roles.js');
reqCore('ui/sound.js');
require('../src/ui-glue.js');
reqCore('ui/ui-core.js');

var ALIEN = require('../src/roles.js');
var ROLE_NAMES = ALIEN.roles.map(function (r) { return r.name; });
function html() { return app.innerHTML; }
function nodes(sel) { return app.querySelectorAll(sel); }
function byAct(v) { return nodes('[data-act]').filter(function (n) { return n.getAttribute('data-act') === v; })[0]; }
function clickAct(v) { var n = byAct(v); if (!n) throw new Error('no [data-act="' + v + '"] on: ' + html().slice(0, 120)); n.click(); }
function assertNoLeak(where) {
  var h = html();
  ROLE_NAMES.forEach(function (rn) { ok(h.indexOf('>' + rn) === -1 && h.indexOf(rn + '<') === -1 && h.indexOf(' ' + rn + ' ') === -1, 'no role-name leak ("' + rn + '") on shared screen: ' + where); });
}
function firstUnsatisfiedGroup(list, attr) {
  var g = {}; list.forEach(function (n) { var id = n.getAttribute(attr); (g[id] = g[id] || []).push(n); });
  var keys = Object.keys(g);
  for (var i = 0; i < keys.length; i++) { var gr = g[keys[i]]; if (!gr.some(function (x) { return / sel/.test(' ' + x._class); })) return gr; }
  return null;
}
function autoAct() {
  for (var i = 0; i < 16; i++) {
    var c = byAct('act-confirm'); if (c && !c.disabled) { c.click(); return; }
    var cg = firstUnsatisfiedGroup(nodes('[data-choice]'), 'data-choice'); if (cg) { cg[0].click(); continue; }
    var pg = firstUnsatisfiedGroup(nodes('[data-pick]'), 'data-pick'); if (pg) { pg[0].click(); continue; }
    var centers = nodes('[data-center]');
    if (centers.length) { var need = +centers[0].getAttribute('data-count'); var unsel = centers.filter(function (x) { return !/ sel/.test(' ' + x._class); }); var sel = centers.length - unsel.length; if (sel < need && unsel.length) { unsel[0].click(); continue; } }
    break;
  }
  var c2 = byAct('act-confirm'); if (c2 && !c2.disabled) c2.click();
}
function playOneGame(label, botClicks) {
  clickAct('new');
  for (var b = 0; b < (botClicks || 0); b++) clickAct('bot+');
  clickAct('start');
  ok(/Pass the phone to/.test(html()), label + ': first reveal gate');
  var guard = 0, sawGate = false, sawDay = false, sawVote = false;
  while (guard++ < 900) {
    var h = html();
    if (/result-win/.test(h)) break;
    if (byAct('reveal-show')) { assertNoLeak('reveal-gate'); sawGate = true; clickAct('reveal-show'); }
    else if (byAct('reveal-next')) clickAct('reveal-next');
    else if (byAct('night-open')) { assertNoLeak('night-gate'); clickAct('night-open'); }
    else if (byAct('act-confirm')) autoAct();
    else if (/Nothing for you to do/.test(h)) { assertNoLeak('night-decoy'); clickAct('night-next'); }
    else if (byAct('night-next')) clickAct('night-next');
    else if (byAct('to-vote')) { sawDay = true; clickAct('to-vote'); }            // DAY exempt (Exposer)
    else if (byAct('vote-open')) { assertNoLeak('vote-gate'); sawVote = true; clickAct('vote-open'); }
    else if (nodes('[data-vote]').length) { assertNoLeak('vote-pick'); nodes('[data-vote]')[0].click(); }
    else { ok(false, label + ': stuck at ' + h.slice(0, 160)); break; }
  }
  ok(/result-win/.test(html()), label + ': reached end');
  ok(sawGate && sawDay && sawVote, label + ': exercised reveal, day, vote');
  clickAct('home');
}

console.log('\n# config integrity - every role (incl. Villager) is freely editable; Start gated on exact count');
(function () {
  function deck() { var m = html().match(/(\d+) \/ (\d+) cards/); return m ? { have: +m[1], need: +m[2] } : null; }
  function start() { return byAct('start'); }
  function rmin(id) { return nodes('[data-role-minus]').filter(function (n) { return n.getAttribute('data-role-minus') === id; })[0]; }
  function rplus(id) { return nodes('[data-role-plus]').filter(function (n) { return n.getAttribute('data-role-plus') === id; })[0]; }
  clickAct('new');
  for (var i = 0; i < 6; i++) { if (byAct('pc+')) clickAct('pc+'); var d = deck(); ok(d && d.have === d.need, 'pc+ -> balanced deck ' + JSON.stringify(d)); ok(start() && !start().disabled, 'pc+ -> Start enabled'); }
  for (var j = 0; j < 8; j++) { if (byAct('pc-')) clickAct('pc-'); var d2 = deck(); ok(d2 && d2.have === d2.need, 'pc- -> balanced deck ' + JSON.stringify(d2)); }
  var vm = rmin('villager');
  ok(!!vm && !vm.disabled, 'Villager has an ENABLED minus button (the reported bug: it had none)');
  var bV = deck(); vm.click(); var aV = deck();
  ok(aV && aV.have === bV.have - 1, 'removing a Villager lowers the deck count (' + JSON.stringify(bV) + ' -> ' + JSON.stringify(aV) + ')');
  ok(aV.have < aV.need, 'deck is now short of the needed count');
  ok(start() && start().disabled, 'Start is DISABLED while the deck is off-count');
  ok(/Add 1 more card to start/.test(html()), 'Start button says exactly how many to add');
  ok(!!byAct('fillv'), '"Fill with Villagers" offered while short');
  clickAct('fillv'); var d3 = deck();
  ok(d3 && d3.have === d3.need, 'Fill with Villagers restores the exact count');
  ok(start() && !start().disabled, 'Start re-enabled after rebalancing');
  var p = nodes('[data-role-plus]').filter(function (n) { return !n.disabled; })[0];
  if (p) { p.click(); var d4 = deck(); ok(d4 && d4.have > d4.need, 'adding past the count over-fills the deck (' + JSON.stringify(d4) + ')'); ok(start() && start().disabled, 'Start disabled when over-count'); ok(/Remove \d+ card/.test(html()), 'Start button says to remove cards'); }
  clickAct('preset');
  ok(/\(max \d+\)/.test(html()), 'capped roles show their max');
  ok(rplus('villager') && !rplus('villager').disabled, 'Villager (filler) is never capped');
  var d5 = deck(); ok(d5 && d5.have === d5.need, '"Use recommended" yields an exact, startable deck');

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

console.log('\n# Alien UI smoke - full games, no-leak on shared screens');
playOneGame('game A');
playOneGame('game B (3 bots)', 3);

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
