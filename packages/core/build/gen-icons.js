/*
 * gen-icons.js - dependency-free app-icon generator. Renders clean, flat, anti-aliased PNGs
 * (1024 icon with a gradient background + emblem, and a transparent-background splash emblem)
 * using only Node's built-in zlib. Each app's identity.json carries an `icon` spec:
 *   "icon": { "emblem": "moon|sun|drop|saucer", "bg": ["#hi","#lo"], "fg": "#emblem", "accent": "#ring" }
 * Run: node ../../packages/core/build/gen-icons.js   (from an app dir)
 */
'use strict';
var zlib = require('zlib');
var fs = require('fs');
var path = require('path');

// ---- PNG encode (truecolor + alpha) ----
var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { var c = 0xffffffff; for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  var len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  var t = Buffer.from(type, 'ascii');
  var body = Buffer.concat([t, data]);
  var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  var stride = w * 4;
  var raw = Buffer.alloc((stride + 1) * h);
  for (var y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgba.copy ? rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride) : null; }
  if (!rgba.copy) { for (y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; for (var x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = rgba[y * stride + x]; } }
  var idat = zlib.deflateSync(raw, { level: 9 });
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  var sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- tiny canvas (straight-alpha source-over) ----
function hex(c) { c = c.replace('#', ''); return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
function Canvas(w) { this.w = w; this.h = w; this.b = Buffer.alloc(w * w * 4); }
Canvas.prototype.over = function (x, y, r, g, b, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  var i = (y * this.w + x) * 4, db = this.b;
  var da = db[i + 3] / 255, oa = a + da * (1 - a);
  if (oa <= 0) { db[i] = db[i + 1] = db[i + 2] = db[i + 3] = 0; return; }
  db[i] = (r * a + db[i] * da * (1 - a)) / oa;
  db[i + 1] = (g * a + db[i + 1] * da * (1 - a)) / oa;
  db[i + 2] = (b * a + db[i + 2] * da * (1 - a)) / oa;
  db[i + 3] = oa * 255;
};
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function cov(d) { return clamp01(0.5 - d); } // 1px anti-aliased coverage from a signed distance

function disc(cx, cy, r) { return function (x, y) { return Math.hypot(x - cx, y - cy) - r; }; }
function ellipse(cx, cy, rx, ry) { return function (x, y) { var dx = (x - cx) / rx, dy = (y - cy) / ry; return (Math.hypot(dx, dy) - 1) * Math.min(rx, ry); }; }

function fillSDF(cv, sdf, col, alpha) {
  alpha = alpha == null ? 1 : alpha;
  for (var y = 0; y < cv.h; y++) for (var x = 0; x < cv.w; x++) {
    var c = cov(sdf(x + 0.5, y + 0.5)); if (c > 0) cv.over(x, y, col[0], col[1], col[2], c * alpha);
  }
}
function fillSDFsub(cv, sdfA, sdfB, col) { // A minus B (crescent)
  for (var y = 0; y < cv.h; y++) for (var x = 0; x < cv.w; x++) {
    var a = cov(sdfA(x + 0.5, y + 0.5)), b = cov(sdfB(x + 0.5, y + 0.5));
    var c = Math.max(0, a - b); if (c > 0) cv.over(x, y, col[0], col[1], col[2], c);
  }
}
function background(cv, hi, lo) {
  var fx = cv.w * 0.5, fy = cv.h * 0.34, maxd = cv.w * 0.92;
  for (var y = 0; y < cv.h; y++) for (var x = 0; x < cv.w; x++) {
    var t = clamp01(Math.hypot(x - fx, y - fy) / maxd);
    var r = hi[0] + (lo[0] - hi[0]) * t, g = hi[1] + (lo[1] - hi[1]) * t, b = hi[2] + (lo[2] - hi[2]) * t;
    var i = (y * cv.w + x) * 4; cv.b[i] = r; cv.b[i + 1] = g; cv.b[i + 2] = b; cv.b[i + 3] = 255;
  }
}
function stars(cv, col) {
  // kept clear of the center-left crescent (right side + top-right only)
  var pts = [[0.78, 0.20, 0.013], [0.86, 0.34, 0.009], [0.72, 0.50, 0.008], [0.83, 0.68, 0.011], [0.66, 0.30, 0.007]];
  pts.forEach(function (p) { fillSDF(cv, disc(p[0] * cv.w, p[1] * cv.w, p[2] * cv.w), col, 0.85); });
}

// ---- emblems ----
function emblemMoon(cv, fg) {
  var W = cv.w;
  fillSDFsub(cv, disc(W * 0.50, W * 0.52, W * 0.30), disc(W * 0.62, W * 0.44, W * 0.27), fg);
}
function emblemSun(cv, fg) {
  var W = cv.w, cx = W * 0.5, cy = W * 0.52, r = W * 0.20;
  for (var a = 0; a < 12; a++) {
    var ang = a / 12 * Math.PI * 2, rr = r * 1.55;
    fillSDF(cv, disc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr, W * 0.028), fg);
  }
  fillSDF(cv, disc(cx, cy, r), fg);
}
function emblemDrop(cv, fg) {
  var W = cv.w, cx = W * 0.5, cy = W * 0.58, r = W * 0.20;
  fillSDF(cv, disc(cx, cy, r), fg);
  var tipY = W * 0.26;
  fillSDF(cv, function (x, y) { // triangle tip
    var t = (y - tipY) / (cy - tipY); if (t < 0 || t > 1) return 1;
    var halfw = (r * 0.98) * t; return Math.abs(x - cx) - halfw;
  }, fg);
}
function emblemSaucer(cv, fg, accent) {
  var W = cv.w, cx = W * 0.5, cy = W * 0.56;
  fillSDF(cv, ellipse(cx, cy, W * 0.30, W * 0.10), fg);          // body
  fillSDF(cv, ellipse(cx, cy - W * 0.06, W * 0.16, W * 0.11), fg); // dome
  for (var i = -1; i <= 1; i++) fillSDF(cv, disc(cx + i * W * 0.14, cy + W * 0.02, W * 0.018), accent || [20, 24, 32]); // lights
}

var EMBLEMS = { moon: emblemMoon, sun: emblemSun, drop: emblemDrop, saucer: emblemSaucer };

function defaultSpec(id) {
  var slug = id.slug || '';
  var map = {
    werewolf: { emblem: 'moon', bg: ['#22314f', '#0a0e16'], fg: '#ecd9a0' },
    daybreak: { emblem: 'sun', bg: ['#ffb24d', '#7a2e12'], fg: '#fff2cf' },
    vampire: { emblem: 'drop', bg: ['#3a0d12', '#100406'], fg: '#d23b3b' },
    alien: { emblem: 'saucer', bg: ['#10324a', '#04121a'], fg: '#7CFFB2' }
  };
  return map[slug] || { emblem: 'moon', bg: [id.bgColor || '#1b2433', '#0a0e16'], fg: id.accent || '#ecd9a0' };
}

function generate(appDir) {
  appDir = appDir || process.cwd();
  var id = JSON.parse(fs.readFileSync(path.join(appDir, 'identity.json'), 'utf8'));

  // Guard: apps with a hand-authored (custom) icon opt out of generation so a stray
  // `gen:icons` run can't overwrite real branding. Set "customIcon": true in identity.json
  // (any emblem spec below is preserved, so generation can be re-enabled by flipping the flag).
  if (id.customIcon === true || id.icon === 'custom') {
    console.log('Skipped icon generation for ' + (id.name || id.slug || appDir) + ' (custom icon).');
    return { skipped: true };
  }

  var spec = id.icon || defaultSpec(id);
  var emblem = EMBLEMS[spec.emblem] || emblemMoon;
  var bgHi = hex(spec.bg ? spec.bg[0] : '#1b2433'), bgLo = hex(spec.bg ? spec.bg[1] : '#0a0e16');
  var fg = hex(spec.fg || '#ecd9a0'), accent = hex(spec.accent || spec.bg ? spec.bg[1] : '#0a0e16');
  var W = 1024;

  // icon.png: gradient bg + emblem (+ stars for the night theme)
  var icon = new Canvas(W);
  background(icon, bgHi, bgLo);
  if (spec.emblem === 'moon') stars(icon, fg);
  emblem(icon, fg, accent);
  fs.writeFileSync(path.join(appDir, 'assets', 'icon.png'), encodePng(W, W, icon.b));

  // splash.png: emblem only, transparent background (shown over splash bg color)
  var splash = new Canvas(W);
  emblem(splash, fg, fg);
  fs.writeFileSync(path.join(appDir, 'assets', 'splash.png'), encodePng(W, W, splash.b));

  return { icon: path.join(appDir, 'assets', 'icon.png') };
}

if (require.main === module) { var r = generate(process.cwd()); console.log('Wrote ' + r.icon + ' and splash.png'); }
module.exports = { generate: generate };
