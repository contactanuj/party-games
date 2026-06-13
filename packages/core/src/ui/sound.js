/*
 * sound.js — tiny synthesized SFX via WebAudio. window.PartySound.play(name).
 * No assets, no network. Safe no-op if WebAudio is unavailable or muted.
 */
(function () {
  'use strict';
  var ctx = null, enabled = true;
  function ac() {
    if (ctx) return ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    return ctx;
  }
  function tone(freq, dur, type, gain, when) {
    var a = ac(); if (!a || !enabled) return;
    var t0 = a.currentTime + (when || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  var SOUNDS = {
    tap: function () { tone(420, 0.07, 'triangle', 0.08); },
    reveal: function () { tone(330, 0.18, 'sine', 0.12); tone(495, 0.22, 'sine', 0.10, 0.06); },
    pass: function () { tone(260, 0.10, 'sine', 0.08); },
    night: function () { tone(180, 0.5, 'sine', 0.09); tone(120, 0.6, 'sine', 0.07, 0.05); },
    day: function () { tone(523, 0.18, 'sine', 0.11); tone(659, 0.18, 'sine', 0.10, 0.09); tone(784, 0.3, 'sine', 0.10, 0.18); },
    vote: function () { tone(300, 0.12, 'square', 0.07); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.25, 'triangle', 0.11, i * 0.12); }); },
    tick: function () { tone(880, 0.04, 'square', 0.05); }
  };
  window.PartySound = {
    play: function (name) { try { var f = SOUNDS[name]; if (f) f(); } catch (e) {} },
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },
    resume: function () { var a = ac(); if (a && a.state === 'suspended') a.resume(); }
  };
})();
