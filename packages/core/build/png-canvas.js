/*
 * png-canvas.js — a tiny, dependency-free raster + PNG encoder shared by every game's icon
 * generator. No canvas/sharp/etc; just a Float buffer, SDF helpers for crisp antialiased shapes,
 * and a built-in zlib PNG writer. Each app's scripts/make-icon.js draws its emblem with these.
 */
'use strict';
var fs = require('fs');
var zlib = require('zlib');

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) { return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]; }
function dist(x, y, ax, ay) { return Math.hypot(x - ax, y - ay); }
// distance from point to a segment (capsule when offset by a thickness)
function sdSeg(px, py, ax, ay, bx, by) {
  var pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay;
  var denom = bax * bax + bay * bay;
  var h = denom > 0 ? clamp((pax * bax + pay * bay) / denom, 0, 1) : 0;
  return Math.hypot(pax - bax * h, pay - bay * h);
}
// signed distance to an axis-aligned rounded rectangle centred at (cx,cy)
function sdRoundRect(px, py, cx, cy, halfW, halfH, r) {
  var qx = Math.abs(px - cx) - (halfW - r), qy = Math.abs(py - cy) - (halfH - r);
  var ax = Math.max(qx, 0), ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r;
}
function ellipseVal(x, y, cx, cy, rx, ry) { var dx = (x - cx) / rx, dy = (y - cy) / ry; return Math.sqrt(dx * dx + dy * dy); }
// soft coverage from a signed distance (inside<0). edge ~1.6px for smooth AA.
function cov(sd, edge) { return clamp(0.5 - sd / (edge || 1.6), 0, 1); }

function create(W, H) {
  var buf = new Float64Array(W * H * 3);
  var api = {
    W: W, H: H,
    // fill with a flat colour or a radial gradient from centre->edge
    fill: function (c) { for (var i = 0; i < W * H; i++) { buf[i * 3] = c[0]; buf[i * 3 + 1] = c[1]; buf[i * 3 + 2] = c[2]; } return api; },
    fillRadial: function (cCenter, cEdge, cx, cy, radius) {
      cx = cx == null ? W / 2 : cx; cy = cy == null ? H / 2 : cy; radius = radius || (Math.max(W, H) * 0.72);
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var t = clamp(dist(x + 0.5, y + 0.5, cx, cy) / radius, 0, 1);
        var c = mix(cCenter, cEdge, t), o = (y * W + x) * 3;
        buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
      }
      return api;
    },
    // paint colour `c` with given coverage at (x,y)
    blend: function (x, y, c, coverage) {
      if (coverage <= 0) return; if (coverage > 1) coverage = 1;
      var o = (y * W + x) * 3;
      buf[o] = lerp(buf[o], c[0], coverage); buf[o + 1] = lerp(buf[o + 1], c[1], coverage); buf[o + 2] = lerp(buf[o + 2], c[2], coverage);
    },
    // run a per-pixel painter: fn(px,py) -> {color, coverage} | null
    paint: function (fn) {
      for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
        var r = fn(x + 0.5, y + 0.5, x, y);
        if (r && r.coverage > 0) api.blend(x, y, r.color, r.coverage);
      }
      return api;
    },
    writePng: function (file) { fs.writeFileSync(file, encodePng(buf, W, H)); return file; }
  };
  return api;
}

function encodePng(buf, W, H) {
  function crc32(b) {
    var c, table = crc32.t || (crc32.t = (function () { var t = []; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })());
    c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = table[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    var len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    var t = Buffer.from(type, 'ascii');
    var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  }
  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  var raw = Buffer.alloc(H * (1 + W * 4));
  for (var y = 0; y < H; y++) {
    var ro = y * (1 + W * 4); raw[ro] = 0;
    for (var x = 0; x < W; x++) {
      var bo = (y * W + x) * 3, po = ro + 1 + x * 4;
      raw[po] = Math.round(clamp(buf[bo], 0, 255));
      raw[po + 1] = Math.round(clamp(buf[bo + 1], 0, 255));
      raw[po + 2] = Math.round(clamp(buf[bo + 2], 0, 255));
      raw[po + 3] = 255;
    }
  }
  var idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { create: create, clamp: clamp, lerp: lerp, mix: mix, dist: dist, sdSeg: sdSeg, sdRoundRect: sdRoundRect, ellipseVal: ellipseVal, cov: cov };
