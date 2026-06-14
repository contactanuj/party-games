/*
 * make-icon.js (Out of the Loop) - renders assets/icon.png (1024x1024), zero deps.
 * A clean "loop": a ring of dots, with ONE dot clearly OUTSIDE the loop - the player who's out
 * of it. Brand teal on the dark-teal background. Run: node scripts/make-icon.js
 */
'use strict';
var path = require('path');
function loadCanvas() {
  try { return require('@partydeck/core/build/png-canvas'); }
  catch (e) { return require(path.resolve(__dirname, '../../../packages/core/build/png-canvas.js')); }
}
var C = loadCanvas();

var W = 1024, H = 1024, CX = 512, CY = 512;
var BG_C = [17, 40, 43], BG_E = [10, 22, 24];
var TEAL = [43, 182, 168], TEAL_LT = [111, 227, 214], MUTED = [120, 170, 165];

var R = 286;              // loop radius
var dots = [];           // in-the-loop dots, evenly on the ring
var N = 6;
for (var i = 0; i < N; i++) { var a = (-90 + i * (360 / N)) * Math.PI / 180; dots.push([CX + R * Math.cos(a), CY + R * Math.sin(a), 42]); }
var OUT = [CX + (R + 168) * Math.cos(-38 * Math.PI / 180), CY + (R + 168) * Math.sin(-38 * Math.PI / 180), 50]; // the one outside

var cv = C.create(W, H).fillRadial(BG_C, BG_E, CX, 470, 760);

cv.paint(function (px, py) {
  // the loop ring (thin annulus)
  var rd = C.dist(px, py, CX, CY);
  var ringSd = Math.abs(rd - R) - 18;       // 36px-thick ring
  var ringCov = C.cov(ringSd) * 0.85;

  // in-loop dots (brand teal w/ a soft top light)
  var dotCov = 0, dotCol = TEAL;
  for (var i = 0; i < dots.length; i++) {
    var d = dots[i];
    var c = C.cov(C.dist(px, py, d[0], d[1]) - d[2]);
    if (c > dotCov) { dotCov = c; var sh = C.clamp((py - 220) / 600, 0, 1); dotCol = C.mix(TEAL_LT, TEAL, sh); }
  }
  // the outside dot - lighter, to read as the odd one out
  var outCov = C.cov(C.dist(px, py, OUT[0], OUT[1]) - OUT[2]);

  var out = null, cover = 0;
  if (ringCov > 0) { out = MUTED; cover = ringCov; }
  if (dotCov > 0) { out = out ? C.mix(out, dotCol, dotCov) : dotCol; cover = Math.max(cover, dotCov); }
  if (outCov > 0) { out = out ? C.mix(out, TEAL_LT, outCov) : TEAL_LT; cover = Math.max(cover, outCov); }
  if (out == null) return null;
  return { color: out, coverage: cover };
});

var file = cv.writePng(path.join(__dirname, '..', 'assets', 'icon.png'));
cv.writePng(path.join(__dirname, '..', 'assets', 'splash.png')); // splash = emblem on brand bg (resizeMode contain centres it)
console.log('Wrote ' + file + ' + splash.png (1024x1024).');
