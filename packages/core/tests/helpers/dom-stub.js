/*
 * dom-stub.js - a minimal DOM good enough to load ui-core.js and drive the real UI by
 * "clicking" elements, with NO dependencies. Shared by every game's ui smoke test.
 *
 * It parses the innerHTML string the UI assigns into lightweight node objects (cached per
 * render so the listeners the UI attaches are the same objects the test clicks).
 */
'use strict';

function parseNodes(html) {
  var nodes = [];
  var tagRe = /<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)\/?>/g;
  var m;
  while ((m = tagRe.exec(html))) {
    var attrs = {};
    var attrStr = m[2] || '';
    var aRe = /([\w-]+)(?:\s*=\s*"([^"]*)")?/g, am;
    while ((am = aRe.exec(attrStr))) {
      if (!am[1]) continue;
      attrs[am[1]] = am[2] === undefined ? '' : am[2];
    }
    nodes.push(makeNode(m[1], attrs));
  }
  return nodes;
}
function makeNode(tag, attrs) {
  var clickCb = null;
  return {
    tag: tag, _attrs: attrs, _class: attrs['class'] || '', disabled: ('disabled' in attrs),
    textContent: '',
    getAttribute: function (k) { return k in this._attrs ? this._attrs[k] : null; },
    addEventListener: function (ev, cb) { if (ev === 'click') clickCb = cb; },
    click: function () { if (clickCb) clickCb(); }
  };
}
function matches(node, sel) {
  if (sel[0] === '[') { var name = sel.slice(1, -1); return name in node._attrs; }
  if (sel[0] === '.') { var cls = sel.slice(1); return (' ' + node._class + ' ').indexOf(' ' + cls + ' ') !== -1; }
  return false;
}

function makeAppEl() {
  return {
    _html: '', _nodes: [],
    set innerHTML(v) { this._html = v; this._nodes = parseNodes(v); },
    get innerHTML() { return this._html; },
    querySelectorAll: function (sel) { return this._nodes.filter(function (n) { return matches(n, sel); }); },
    querySelector: function (sel) { var r = this._nodes.filter(function (n) { return matches(n, sel); }); return r[0] || null; }
  };
}

function install() {
  var app = makeAppEl();
  var els = { app: app };
  global.window = global;
  global.document = {
    getElementById: function (id) { return els[id]; },
    addEventListener: function () {},
    createElement: function () { return makeAppEl(); }
  };
  var store = {};
  global.localStorage = {
    getItem: function (k) { return k in store ? store[k] : null; },
    setItem: function (k, v) { store[k] = '' + v; },
    removeItem: function (k) { delete store[k]; }
  };
  global.alert = function (msg) { throw new Error('UI alert (engine rejected an action): ' + msg); };
  global.setInterval = function () { return 0; };
  global.clearInterval = function () {};
  global.setTimeout = function () { return 0; };
  global.scrollTo = function () {};
  if (!global.navigator) { try { global.navigator = { userAgent: 'node' }; } catch (e) {} }
  global.PartySound = { play: function () {}, resume: function () {}, setEnabled: function () {}, isEnabled: function () { return true; } };
  return app;
}

module.exports = { install: install, makeAppEl: makeAppEl };
