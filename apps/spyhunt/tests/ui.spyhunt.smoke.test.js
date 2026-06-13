/*
 * ui.spyhunt.smoke.test.js — loads the REAL word-ui.js + Spy Hunt in a node DOM stub and drives
 * a round through the 'play' interaction: reveal (gated) -> play (accuse) -> tally -> round_over.
 * Asserts the location never leaks onto a shared screen and the spy's card shows no location.
 */
'use strict';
var path = require('path');
function reqCoreFile(rel) { try { return require('@partydeck/core/' + rel); } catch (e) { return require(path.resolve(__dirname, '../../../packages/core/' + rel)); } }
var DOM = reqCoreFile('tests/helpers/dom-node-stub.js');

var app = DOM.install();
global.__WORD_TEST = true; window.__WORD_TEST = true;
reqCoreFile('src/engine/word-engine.js');
require('../src/game.js');
require('../src/content.js');
reqCoreFile('src/ui/word-ui.js');

var H = window.__WORD_UI;
var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  FAIL: ' + m); } }
function section(n) { console.log('\n# ' + n); }
function st() { return H.state(); }
function secret() { return H.engine.secretDisplay(st()); }
function text() { return DOM.allText(app); }
function hasWord(hay, word) { var re = new RegExp('(^|[^a-zA-Z])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-zA-Z]|$)', 'i'); return re.test(hay); }

section('lobby + start');
ok(text().indexOf('Spy Hunt') !== -1, 'title shows');
DOM.clickText(app, 'Start game');
ok(st().phase === 'reveal', 'starts at reveal');

section('reveal: spy card shows no location; agents see it (gated)');
var guard = 0;
while (st().phase === 'reveal' && guard++ < 80) {
  var ui = H.ui;
  if (!ui.reveal.shown) { ok(!hasWord(text(), secret()), 'no location on the pass screen'); DOM.clickText(app, 'show me'); }
  else {
    var seat = ui.reveal.order[ui.reveal.idx];
    if (H.engine.isOutsider(st(), seat)) {
      ok(!hasWord(text(), secret()), 'SPY card never shows the location');
      ok(text().toLowerCase().indexOf('spy') !== -1, 'spy is told they are the Spy');
    } else {
      ok(hasWord(text(), secret()), 'agent card shows the location');
      ok(text().toLowerCase().indexOf('role') !== -1, 'agent card shows their role');
    }
    DOM.clickText(app, 'Hide');
  }
}
ok(st().phase === 'play', 'reveals done -> play');

section('play: the master location list is public (intended); proceed to accuse');
ok(hasWord(text(), secret()), 'the active location IS in the public candidate list (intended in Spyfall)');
// drive a mid-round accusation of the spy: Accuse -> who's accusing -> accuse who -> everyone agrees
DOM.clickText(app, 'Accuse someone');
(function () {
  var pc = st().players.length, spy = st().outsiderSeats[0], accuser = (spy + 1) % pc;
  var accuserName = H.engine.nameOf(st(), accuser), spyName = H.engine.nameOf(st(), spy);
  function clickChoice(name) { var chs = DOM.choices(app); for (var i = 0; i < chs.length; i++) if (chs[i].textContent === name) { chs[i].click(); return true; } return false; }
  ok(clickChoice(accuserName), "step 1: pick who's accusing (" + accuserName + ')');
  ok(clickChoice(spyName), 'step 2: accuse the spy (' + spyName + ')');
})();
DOM.clickText(app, 'Everyone agrees');
ok(st().phase === 'tally' || st().phase === 'round_over', 'unanimous accusation resolves (' + st().phase + ')');
if (st().phase === 'tally') DOM.clickText(app, 'Reveal');
ok(st().phase === 'round_over' || st().phase === 'game_over', 'round concluded (' + st().phase + ')');

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
