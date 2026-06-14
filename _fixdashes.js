'use strict';
var cp = require('child_process'), fs = require('fs');
var files = cp.execSync('git ls-files', { encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
var exts = /\.(js|jsx|ts|md|css|html|yml|yaml|json|txt)$/;
var skip = /(^|\/)(gen-icons\.js|package-lock\.json|_fixdashes\.js)$/;
var ch = 0, tot = 0;
files.forEach(function (f) {
  if (!exts.test(f) || skip.test(f)) return;
  var s = fs.readFileSync(f, 'utf8'), b = s;
  var n = (s.match(/[—–]/g) || []).length; if (!n) return;
  s = s.replace(/ ?— ?/g, ' - ').replace(/ ?– ?/g, ' - ').replace(/[—–]/g, '-');
  if (s !== b) { fs.writeFileSync(f, s); ch++; tot += n; console.log('fixed ' + f + ' (' + n + ')'); }
});
console.log('files changed: ' + ch + ', dashes replaced: ' + tot);
