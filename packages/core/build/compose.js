/*
 * compose.js - the shared inliner. Each app's build.js calls composeAppHtml({appDir, ...})
 * which reads the shared @partydeck/core sources + the app's own src/* and concatenates them
 * into a single self-contained assets/app.html (the WebView loads one HTML string, so nothing
 * can be an external file).
 *
 * Script load order MATTERS:
 *   core-engine.js  -> window.GameCore
 *   roles.js        -> window.PARTY_GAME (the game definition + presets + meta)
 *   sound.js        -> window.PartySound
 *   ui-core.js      -> reads GameCore + PARTY_GAME, renders the whole app
 *   ui-glue.js      -> optional per-game copy/overrides (window.PARTY_META)
 */
'use strict';
var fs = require('fs');
var path = require('path');
var guards = require('./guards');

// Resolve the core package root robustly regardless of npm hoist location (Windows-friendly).
function coreRoot() {
  try { return path.dirname(require.resolve('@partydeck/core/package.json')); }
  catch (e) { return path.resolve(__dirname, '..'); } // we ARE inside @partydeck/core/build
}

function composeAppHtml(opts) {
  var appDir = opts.appDir;
  var title = opts.title || 'Party Game';
  var themeColor = opts.themeColor || '#0f0d0b';
  var core = coreRoot();

  function readCore(rel) { return fs.readFileSync(path.join(core, 'src', rel), 'utf8'); }
  function readApp(rel) { return fs.readFileSync(path.join(appDir, rel), 'utf8'); }
  function readAppOptional(rel) {
    try { return readApp(rel); } catch (e) { return ''; }
  }

  var baseCss = readCore('css/base.css');
  var themeCss = readApp('src/theme.css');
  guards.assertThemeTokens(themeCss, 'src/theme.css');
  var css = baseCss + '\n' + themeCss;

  var scripts = [
    ['core-engine.js', readCore('engine/core-engine.js')],
    ['base-roles.js', readCore('roles/base-roles.js')], // shared role defs -> window.PARTY_BASE
    ['roles.js', readApp('src/roles.js')],
    ['sound.js', readCore('ui/sound.js')],
    ['ui-core.js', readCore('ui/ui-core.js')],
    ['ui-glue.js', readAppOptional('src/ui-glue.js')]
  ];
  scripts.forEach(function (pair) { guards.guardNoScriptClose(pair[1], pair[0]); });

  var html =
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="UTF-8" />\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />\n' +
    '  <meta name="theme-color" content="' + themeColor + '" />\n' +
    '  <meta name="apple-mobile-web-app-capable" content="yes" />\n' +
    '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />\n' +
    '  <title>' + title + '</title>\n' +
    '  <style>\n' + css + '\n  </style>\n' +
    '</head>\n<body>\n  <div id="app"></div>\n' +
    scripts.map(function (pair) { return pair[1] ? '  <script>\n' + pair[1] + '\n  </script>\n' : ''; }).join('') +
    '</body>\n</html>\n';

  var out = path.join(appDir, 'assets', 'app.html');
  fs.writeFileSync(out, html, 'utf8');

  // Also emit the HTML as a plain JS string module the app imports directly. This is what the
  // app actually loads - it sidesteps Metro asset-extension resolution (which is unreliable on
  // EAS for a non-standard .html asset) and needs no runtime file read. JSON.stringify produces
  // a safe, fully-escaped JS string literal.
  fs.writeFileSync(path.join(appDir, 'assets', 'app-html.js'), 'module.exports = ' + JSON.stringify(html) + ';\n', 'utf8');

  return html.length;
}

/*
 * composeWordAppHtml - the inliner for the word-deduction family (Imposter, Out of the Loop,
 * Spyfall). Script load order MATTERS:
 *   word-engine.js -> window.WordCore
 *   content.js     -> window.WORD_CONTENT (the app's pack library)
 *   game.js        -> window.WORD_GAME (the def + UI meta)
 *   sound.js       -> window.PartySound
 *   word-ui.js     -> reads WordCore + WORD_GAME + WORD_CONTENT and renders the whole app
 *   ui-glue.js     -> optional per-game window.WORD_META overrides
 */
function composeWordAppHtml(opts) {
  var appDir = opts.appDir;
  var title = opts.title || 'Party Game';
  var themeColor = opts.themeColor || '#0f0d0b';
  var core = coreRoot();
  function readCore(rel) { return fs.readFileSync(path.join(core, 'src', rel), 'utf8'); }
  function readApp(rel) { return fs.readFileSync(path.join(appDir, rel), 'utf8'); }
  function readAppOptional(rel) { try { return readApp(rel); } catch (e) { return ''; } }

  var baseCss = readCore('css/base.css');
  var themeCss = readApp('src/theme.css');
  guards.assertThemeTokens(themeCss, 'src/theme.css');
  var css = baseCss + '\n' + themeCss;

  var scripts = [
    ['word-engine.js', readCore('engine/word-engine.js')],
    ['content.js', readApp('src/content.js')],
    ['game.js', readApp('src/game.js')],
    ['sound.js', readCore('ui/sound.js')],
    ['word-ui.js', readCore('ui/word-ui.js')],
    ['ui-glue.js', readAppOptional('src/ui-glue.js')]
  ];
  scripts.forEach(function (pair) { guards.guardNoScriptClose(pair[1], pair[0]); });

  var html =
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="UTF-8" />\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />\n' +
    '  <meta name="theme-color" content="' + themeColor + '" />\n' +
    '  <meta name="apple-mobile-web-app-capable" content="yes" />\n' +
    '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />\n' +
    '  <title>' + title + '</title>\n' +
    '  <style>\n' + css + '\n  </style>\n' +
    '</head>\n<body>\n  <div id="app"></div>\n' +
    scripts.map(function (pair) { return pair[1] ? '  <script>\n' + pair[1] + '\n  </script>\n' : ''; }).join('') +
    '</body>\n</html>\n';

  var out = path.join(appDir, 'assets', 'app.html');
  fs.writeFileSync(out, html, 'utf8');

  // Also emit the HTML as a plain JS string module the app imports directly. This is what the
  // app actually loads - it sidesteps Metro asset-extension resolution (which is unreliable on
  // EAS for a non-standard .html asset) and needs no runtime file read. JSON.stringify produces
  // a safe, fully-escaped JS string literal.
  fs.writeFileSync(path.join(appDir, 'assets', 'app-html.js'), 'module.exports = ' + JSON.stringify(html) + ';\n', 'utf8');

  return html.length;
}

module.exports = { composeAppHtml: composeAppHtml, composeWordAppHtml: composeWordAppHtml };
