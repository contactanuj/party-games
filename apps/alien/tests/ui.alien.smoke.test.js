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

console.log('\n# Alien UI smoke - full games, no-leak on shared screens');
playOneGame('game A');
playOneGame('game B (3 bots)', 3);

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
