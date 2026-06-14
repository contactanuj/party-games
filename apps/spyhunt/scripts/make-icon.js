/*
 * make-icon.js (Spy Hunt) - renders assets/icon.png (1024x1024), zero deps.
 * A clean magnifying glass (investigate / find the spy) in brand amber on warm noir, inside a
 * thin ring. Run: node scripts/make-icon.js
 */
'use strict';
var path = require('path');
function loadCanvas() {
  try { return require('@partydeck/core/build/png-canvas'); }
  catch (e) { return require(path.resolve(__dirname, '../../../packages/core/build/png-canvas.js')); }
}
var C = loadCanvas();

var W = 1024, H = 1024, CX = 512;
var BG_C = [34, 31, 22], BG_E = [18, 17, 12];
var AMBER = [224, 162, 58], AMBER_LT = [243, 207, 134], GLASS = [60, 70, 78];

// magnifying glass: lens centred up-left, handle sweeping to lower-right
var LX = 452, LY = 432, LR = 188, RINGT = 34;   // lens centre, radius, rim thickness
var ang = 45 * Math.PI / 180;
var hx0 = LX + (LR + 4) * Math.cos(ang), hy0 = LY + (LR + 4) * Math.sin(ang);
var hx1 = 772, hy1 = 752, HT = 40;

var cv = C.create(W, H).fillRadial(BG_C, BG_E, CX, 470, 760);

cv.paint(function (px, py) {
  // outer badge ring
  var rd = C.dist(px, py, CX, 512);
  var badge = Math.max(rd - 470, 442 - rd);
  var badgeCov = C.cov(badge) * 0.85;

  // lens rim (annulus) + glass interior
  var ld = C.dist(px, py, LX, LY);
  var rimSd = Math.abs(ld - LR) - RINGT / 2;
  var rimCov = C.cov(rimSd);
  var glassCov = C.cov(ld - (LR - RINGT / 2)) * 0.5; // soft glass fill inside the rim

  // handle (capsule)
  var hd = C.sdSeg(px, py, hx0, hy0, hx1, hy1) - HT;
  var handleCov = C.cov(hd);

  var out = null, cover = 0;
  if (badgeCov > 0) { out = AMBER; cover = badgeCov; }
  if (glassCov > 0) { out = out ? C.mix(out, GLASS, glassCov) : GLASS; cover = Math.max(cover, glassCov); }
  // metal (rim + handle) with a soft top light
  var metalCov = Math.max(rimCov, handleCov);
  if (metalCov > 0) {
    var sh = C.clamp((py - 240) / 540, 0, 1);
    var metal = C.mix(AMBER_LT, AMBER, sh);
    out = out ? C.mix(out, metal, metalCov) : metal;
    cover = Math.max(cover, metalCov);
  }
  if (out == null) return null;
  return { color: out, coverage: cover };
});

var file = cv.writePng(path.join(__dirname, '..', 'assets', 'icon.png'));
cv.writePng(path.join(__dirname, '..', 'assets', 'splash.png')); // splash = emblem on brand bg (resizeMode contain centres it)
console.log('Wrote ' + file + ' + splash.png (1024x1024).');
