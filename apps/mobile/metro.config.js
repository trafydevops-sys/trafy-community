const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// This app lives inside an npm workspaces monorepo (apps/mobile), so Metro
// needs to also watch/resolve modules hoisted to the repo root — otherwise
// it can't find @trafy-community/core or anything npm deduped upward.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
