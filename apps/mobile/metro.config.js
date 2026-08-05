const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// getSentryExpoConfig wraps getDefaultConfig — it wires the Sentry Metro
// serializer for source maps (needed once SENTRY_AUTH_TOKEN is configured;
// harmless no-op until then) while still returning a normal Expo config.
const config = getSentryExpoConfig(projectRoot, {
  autoWrapExpoRouterErrorBoundary: true,
});

// This app lives inside an npm workspaces monorepo (apps/mobile), so Metro
// needs to also watch/resolve modules hoisted to the repo root — otherwise
// it can't find @trafy-community/core or anything npm deduped upward.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
