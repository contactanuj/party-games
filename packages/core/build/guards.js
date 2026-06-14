/*
 * guards.js - build-time safety checks shared by every app's build.js.
 *  - guardNoScriptClose: a literal </script> in any inlined source would prematurely close
 *    the <script> tag and corrupt app.html.
 *  - assertThemeTokens: every theme.css must define the CSS custom properties base.css relies
 *    on, so a game can never ship half-themed.
 */
'use strict';

function guardNoScriptClose(src, label) {
  if (/<\/script>/i.test(src)) {
    throw new Error('Refusing to build: ' + label + ' contains a literal </script> (would break app.html).');
  }
}

var REQUIRED_THEME_TOKENS = ['--bg', '--panel', '--text', '--muted', '--accent', '--danger', '--good'];
function assertThemeTokens(themeCss, label) {
  var missing = REQUIRED_THEME_TOKENS.filter(function (t) {
    return themeCss.indexOf(t + ':') === -1 && themeCss.indexOf(t + ' :') === -1 && themeCss.indexOf(t + ' ') === -1 && themeCss.indexOf(t + ':') === -1;
  }).filter(function (t) { return themeCss.indexOf(t) === -1; });
  if (missing.length) {
    throw new Error('Refusing to build: ' + (label || 'theme.css') + ' is missing required theme tokens: ' + missing.join(', '));
  }
}

module.exports = { guardNoScriptClose, assertThemeTokens, REQUIRED_THEME_TOKENS };
