/* build.js (Daybreak) — composes assets/app.html from @partydeck/core + this app's src/*. */
'use strict';
var path = require('path');
function loadCompose() {
  try { return require('@partydeck/core/build/compose'); }
  catch (e) { return require(path.resolve(__dirname, '../../packages/core/build/compose.js')); }
}
var id = require('./identity.json');
var bytes = loadCompose().composeAppHtml({ appDir: __dirname, title: id.name, themeColor: id.bgColor });
console.log('Built assets/app.html (' + bytes + ' bytes) for ' + id.name + '.');
