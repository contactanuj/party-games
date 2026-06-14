/*
 * dom-node-stub.js - a minimal NODE-based DOM (createElement/appendChild/onclick/textContent)
 * good enough to load word-ui.js and drive the real UI by walking the tree and clicking. Shared
 * by the word-deduction games' ui smoke tests. No dependencies.
 *
 * Unlike dom-stub.js (which parses innerHTML strings for ui-core.js), this models a real node
 * tree because word-ui.js builds the DOM with createElement/appendChild.
 */
'use strict';

function makeNode(tag) {
  var node = {
    tag: tag, className: '', _text: '', children: [], parentNode: null, _attrs: {}, style: {},
    // input-ish props the UI sets directly
    value: '', type: '', maxLength: 0, placeholder: '', selected: false, disabled: false,
    onclick: null, oninput: null, onchange: null,
    setAttribute: function (k, v) { this._attrs[k] = v; },
    getAttribute: function (k) { return k in this._attrs ? this._attrs[k] : null; },
    addEventListener: function (ev, cb) { if (ev === 'click') this.onclick = cb; },
    appendChild: function (c) { c.parentNode = this; this.children.push(c); return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    click: function () { if (this.onclick) this.onclick({}); },
    querySelector: function (sel) { return qsa(this, sel)[0] || null; },
    querySelectorAll: function (sel) { return qsa(this, sel); }
  };
  Object.defineProperty(node, 'firstChild', { get: function () { return this.children[0] || null; } });
  Object.defineProperty(node, 'textContent', {
    get: function () {
      if (!this.children.length) return this._text;
      // Join with a separator so distinct elements' text never glues together (distinct DOM
      // elements render visually separated; this keeps word-boundary leak checks faithful).
      var parts = []; if (this._text) parts.push(this._text);
      for (var i = 0; i < this.children.length; i++) parts.push(this.children[i].textContent);
      return parts.join('\n');
    },
    set: function (v) { this._text = v == null ? '' : String(v); this.children = []; }
  });
  return node;
}

function hasClass(node, cls) { return (' ' + (node.className || '') + ' ').indexOf(' ' + cls + ' ') !== -1; }
function matches(node, sel) {
  if (sel[0] === '.') return hasClass(node, sel.slice(1));
  if (sel[0] === '[') { var n = sel.slice(1, -1); return n in node._attrs; }
  return node.tag === sel;
}
function qsa(root, sel) {
  var out = [];
  (function walk(n) { for (var i = 0; i < n.children.length; i++) { var c = n.children[i]; if (matches(c, sel)) out.push(c); walk(c); } })(root);
  return out;
}

function install() {
  var app = makeNode('div'); app.id = 'app';
  var els = { app: app };
  global.window = global;
  global.document = {
    getElementById: function (id) { return els[id]; },
    addEventListener: function () {},
    createElement: function (tag) { return makeNode(tag); }
  };
  var store = {};
  global.localStorage = {
    getItem: function (k) { return k in store ? store[k] : null; },
    setItem: function (k, v) { store[k] = '' + v; },
    removeItem: function (k) { delete store[k]; }
  };
  global.setInterval = function () { return 0; };
  global.clearInterval = function () {};
  global.setTimeout = function (fn) { return 0; };
  global.scrollTo = function () {};
  if (!global.navigator) { try { global.navigator = { userAgent: 'node' }; } catch (e) {} }
  global.PartySound = { play: function () {}, resume: function () {}, setEnabled: function () {}, isEnabled: function () { return true; } };
  return app;
}

// ---- driving helpers (walk the live tree the UI just built) ----
function buttons(app) { return qsa(app, 'button'); }
function buttonByText(app, sub) {
  var bs = buttons(app);
  for (var i = 0; i < bs.length; i++) if (bs[i].textContent.toLowerCase().indexOf(sub.toLowerCase()) !== -1) return bs[i];
  return null;
}
function clickText(app, sub) { var b = buttonByText(app, sub); if (!b) throw new Error('No button matching "' + sub + '". Buttons: ' + buttons(app).map(function (x) { return JSON.stringify(x.textContent); }).join(', ')); b.click(); }
function choices(app) { return qsa(app, '.choice'); }
function inputs(app) { return qsa(app, 'input'); }
function allText(app) { return app.textContent; }

module.exports = { install: install, makeNode: makeNode, qsa: qsa, buttons: buttons, buttonByText: buttonByText, clickText: clickText, choices: choices, inputs: inputs, allText: allText };
