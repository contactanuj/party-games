/*
 * make-app-json.js — generate an app's app.json from its identity.json + the shared template,
 * so the four apps never drift on the common Expo config. Run via `npm run gen:config`.
 *
 * identity.json (per app): { name, slug, package, bgColor, accent, version }
 */
'use strict';
var fs = require('fs');
var path = require('path');

function coreRoot() {
  try { return path.dirname(require.resolve('@partydeck/core/package.json')); }
  catch (e) { return path.resolve(__dirname, '..'); }
}

function generate(appDir) {
  appDir = appDir || process.cwd();
  var id = JSON.parse(fs.readFileSync(path.join(appDir, 'identity.json'), 'utf8'));
  var tmpl = JSON.parse(fs.readFileSync(path.join(coreRoot(), 'templates', 'app.base.json'), 'utf8'));
  var bg = id.bgColor || '#0f0d0b';
  var expo = tmpl.expo;
  expo.name = id.name;
  expo.slug = id.slug;
  expo.version = id.version || '1.0.0';
  expo.backgroundColor = bg;
  expo.splash = expo.splash || {};
  expo.splash.backgroundColor = bg;
  expo.splash.image = './assets/splash.png';
  expo.splash.resizeMode = 'contain';
  expo.icon = './assets/icon.png';
  expo.android = expo.android || {};
  expo.android.package = id.package;
  expo.android.adaptiveIcon = { foregroundImage: './assets/icon.png', backgroundColor: bg };
  // Opaque (non-translucent) status bar so Android reserves its space and content never sits
  // under it. iOS notch is handled in CSS via env(safe-area-inset-top).
  expo.androidStatusBar = { translucent: false, backgroundColor: bg, barStyle: 'light-content' };
  expo.androidNavigationBar = { backgroundColor: bg, barStyle: 'light-content' };
  expo.ios = expo.ios || {};
  expo.ios.bundleIdentifier = id.package;

  var out = path.join(appDir, 'app.json');
  fs.writeFileSync(out, JSON.stringify(tmpl, null, 2) + '\n', 'utf8');
  return out;
}

if (require.main === module) {
  var out = generate(process.cwd());
  console.log('Wrote ' + out);
}
module.exports = { generate: generate };
