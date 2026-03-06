#!/usr/bin/env bash

# This script is executed by Cloudflare Pages to guarantee all Monorepo packages 
# are correctly symlinked before invoking the Vite build.

# 1. We must be in the root of the repository
cd "$(dirname "$0")"

# 2. Run a clean install that respects workspaces
npm ci

# 3. Build the shared package first so TypeScript finds the compiled types
npm run build --workspace packages/shared

# 4. Build the web workspace
npm run build --workspace apps/web
