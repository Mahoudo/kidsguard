// Monorepo Metro config — watch workspace root so @kidsguard/* resolve.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// pnpm uses a symlinked (.pnpm) layout — let Metro walk symlinks to resolve
// transitive deps. Do NOT disable hierarchical lookup (breaks @expo/metro-runtime).

module.exports = config;
