/*
 * run-tests.js — dependency-free test runner for CI and local use. Walks packages/* and apps/*
 * for files matching tests/**\/*.test.js and runs each with `node`, then prints a summary and
 * exits non-zero if any file fails. The tests themselves need no npm install (pure Node + relative
 * requires), so CI can run this straight after checkout.
 *
 * Usage: node scripts/run-tests.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var SEARCH = ['packages', 'apps'];

function walk(dir, out) {
  var entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  entries.forEach(function (e) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.expo') return;
    var full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.test\.js$/.test(e.name) && /(^|[\\/])tests([\\/])/.test(full)) out.push(full);
  });
  return out;
}

var files = [];
SEARCH.forEach(function (d) { walk(path.join(ROOT, d), files); });
files.sort();

if (!files.length) { console.error('No test files found.'); process.exit(1); }

var failed = [];
files.forEach(function (f) {
  var rel = path.relative(ROOT, f);
  var r = cp.spawnSync(process.execPath, [f], { encoding: 'utf8' });
  var out = (r.stdout || '') + (r.stderr || '');
  var last = out.trim().split('\n').pop();
  var okRun = r.status === 0;
  if (!okRun) { failed.push(rel); console.log('FAIL  ' + rel + '  ::  ' + (last || ('exit ' + r.status))); if (out) console.log(out); }
  else console.log('ok    ' + rel + '  ::  ' + last);
});

console.log('\n' + files.length + ' test file(s), ' + (files.length - failed.length) + ' passed, ' + failed.length + ' failed.');
process.exit(failed.length ? 1 : 0);
