/*
 * ui.outoftheloop.smoke.test.js — loads the REAL word-ui.js + Out of the Loop in a node DOM stub
 * and drives a full round (reveal -> questions -> debate -> vote -> tally -> guess -> round_over),
 * asserting the secret never leaks onto a shared screen and that the Outsider sees only the
 * category (never the word) on their gated card.
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
function noLeak(where) { ok(!hasWord(text(), secret()), 'no leak on ' + where + ' (secret "' + secret() + '")'); }

section('lobby + start');
ok(text().indexOf('Out of the Loop') !== -1, 'title shows');
DOM.clickText(app, 'Start game');
ok(st().phase === 'reveal', 'starts at reveal');

section('reveal: outsider sees the category, never the word');
var guard = 0;
while (st().phase === 'reveal' && guard++ < 60) {
  var ui = H.ui;
  if (!ui.reveal.shown) { noLeak('reveal pass'); DOM.clickText(app, 'show me'); }
  else {
    var seat = ui.reveal.order[ui.reveal.idx];
    if (H.engine.isOutsider(st(), seat)) {
      ok(!hasWord(text(), secret()), 'OUTSIDER card never shows the secret word');
      ok(text().toLowerCase().indexOf('category') !== -1, 'outsider card shows the category');
    } else ok(hasWord(text(), secret()), 'in-the-loop card shows the word');
    DOM.clickText(app, 'Hide');
  }
}
ok(st().phase === 'questions', 'reveals done -> questions');

section('questions phase is leak-free');
guard = 0;
while (st().phase === 'questions' && guard++ < 30) { noLeak('question screen'); DOM.clickText(app, 'next'); }
ok(st().phase === 'debate' || st().phase === 'vote', 'questions complete');

section('debate + vote leak-free, round resolves');
if (st().phase === 'debate') { noLeak('debate'); DOM.clickText(app, 'Go to vote'); }
guard = 0;
while (st().phase === 'vote' && guard++ < 120) {
  if (!H.ui.vote.shown) { noLeak('vote pass'); DOM.clickText(app, "I'm "); }
  else { noLeak('vote pick'); DOM.choices(app)[0].click(); DOM.clickText(app, 'Lock in vote'); }
}
if (st().phase === 'tally') DOM.clickText(app, 'Reveal');
if (st().phase === 'guess') { var gi = DOM.inputs(app); if (gi.length) { gi[0].value = 'wrong'; if (gi[0].oninput) gi[0].oninput(); DOM.clickText(app, 'Guess'); } }
ok(st().phase === 'round_over' || st().phase === 'game_over', 'round concluded (' + st().phase + ')');

console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILURES PRESENT') + ': ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail === 0 ? 0 : 1);
