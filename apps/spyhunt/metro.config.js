// Metro config for an Expo app inside the npm-workspaces monorepo.
//  - watch the workspace root + resolve hoisted node_modules (monorepo)
//  - treat .html as a bundleable asset (App.js does require('./assets/app.html'))
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.assetExts.push('html');

module.exports = config;
