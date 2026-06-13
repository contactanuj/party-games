/*
 * make-icon.js (Imposter) — renders assets/icon.png (1024x1024), zero deps.
 * A clean domino/masquerade mask (hidden identity) in brand violet inside a thin ring, on the
 * deep-indigo brand background. Drawn with SDF shapes via the shared png-canvas helper.
 * Run: node scripts/make-icon.js
 */
'use strict';
var path = require('path');
function loadCanvas() {
  try { return require('@partydeck/core/build/png-canvas'); }
  catch (e) { return require(path.resolve(__dirname, '../../../packages/core/build/png-canvas.js')); }
}
var C = loadCanvas();

var W = 1024, H = 1024, CX = 512, CY = 520;
var BG_C = [28, 24, 48], BG_E = [16, 14, 28];
var VIOLET = [124, 92, 255], VIOLET_LT = [182, 164, 255];
var RING = [124, 92, 255];

function mir(x) { return 1024 - x; }

// Mask body = two rounded lobes + a central bridge (a clean domino-mask silhouette).
function maskSD(px, py) {
  var d = 1e9;
  d = Math.min(d, C.sdRoundRect(px, py, 392, CY, 132, 104, 78));   // left lobe
  d = Math.min(d, C.sdRoundRect(px, py, mir(392), CY, 132, 104, 78)); // right lobe
  d = Math.min(d, C.sdRoundRect(px, py, CX, CY, 150, 64, 52));     // bridge joining them
  return d;
}

var cv = C.create(W, H).fillRadial(BG_C, BG_E, CX, 470, 760);

cv.paint(function (px, py) {
  // thin ring badge (annulus 442..470)
  var rd = C.dist(px, py, CX, 512);
  var ring = Math.max(rd - 470, 442 - rd);
  var ringCov = C.cov(ring) * 0.9;

  var md = maskSD(px, py);
  var maskCov = C.cov(md);

  // eye cut-outs (almond ellipses), only inside the mask -> punch back to background
  var eL = C.ellipseVal(px, py, 402, 506, 70, 40);
  var eR = C.ellipseVal(px, py, mir(402), 506, 70, 40);
  var eye = Math.min(eL, eR);
  var eyeCov = C.clamp((1 - eye) / 0.06, 0, 1);

  // compose: ring first, then mask (with a soft top-light gradient), then eye holes
  var out = null, cover = 0;
  if (ringCov > 0) { out = RING; cover = ringCov; }
  if (maskCov > 0) {
    var shade = C.clamp((py - 360) / 360, 0, 1);
    var mc = C.mix(VIOLET_LT, VIOLET, shade);
    out = out ? C.mix(out, mc, maskCov) : mc;
    cover = Math.max(cover, maskCov);
  }
  if (out == null) return null;
  // eye holes: blend the mask area back toward the background colour
  if (maskCov > 0 && eyeCov > 0) { out = C.mix(out, BG_C, eyeCov); }
  return { color: out, coverage: cover };
});

var out = cv.writePng(path.join(__dirname, '..', 'assets', 'icon.png'));
cv.writePng(path.join(__dirname, '..', 'assets', 'splash.png')); // splash = emblem on brand bg (resizeMode contain centres it)
console.log('Wrote ' + out + ' + splash.png (1024x1024).');
