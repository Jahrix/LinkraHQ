#!/usr/bin/env bash

# This script is executed by Cloudflare Pages to build the LinkraHQ monorepo.
# Vite handles TypeScript transpilation natively via esbuild, so we don't
# need to pre-build @linkra/shared. Vite resolves workspace packages from source.

# 1. We must be at the root of the repository
cd "$(dirname "$0")"

# 2. Install all dependencies (workspaces included)
npm ci

# 3. Build the web app — Vite resolves @linkra/shared directly from packages/shared/src
npm run build --workspace apps/web
