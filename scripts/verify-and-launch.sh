#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Genesis Swarm — Pre-Flight Verification & Production Launch
# Usage: bash scripts/verify-and-launch.sh [--skip-build] [--dry-run]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UI_DIR="$REPO_ROOT/jarvis-ui"
LOG_FILE="$REPO_ROOT/scripts/.launch.log"
SKIP_BUILD=false
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --dry-run)    DRY_RUN=true ;;
  esac
done

# ── Colours ───────────────────────────────────────────────────────────────────
G="\033[0;32m"; R="\033[0;31m"; Y="\033[0;33m"; C="\033[0;36m"; B="\033[1m"; X="\033[0m"

ok()   { echo -e "  ${G}✓${X}  $1"; }
fail() { echo -e "  ${R}✗${X}  $1"; exit 1; }
warn() { echo -e "  ${Y}⚠${X}  $1"; }
hdr()  { echo -e "\n${C}${B}── $1 ──${X}"; }
log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >> "$LOG_FILE"; }

echo -e "${C}${B}"
echo "  ╔═══════════════════════════════════════════════╗"
echo "  ║  Genesis Swarm — Pre-Flight Verification      ║"
echo "  ║  $(date -u '+%Y-%m-%d %H:%M UTC')                       ║"
echo "  ╚═══════════════════════════════════════════════╝"
echo -e "${X}"

log "Launch sequence started. skip_build=$SKIP_BUILD dry_run=$DRY_RUN"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 1 — Required toolchain
# ─────────────────────────────────────────────────────────────────────────────
hdr "Toolchain"

for tool in node npm git; do
  if command -v "$tool" &>/dev/null; then
    version=$("$tool" --version 2>/dev/null | head -1)
    ok "$tool — $version"
  else
    fail "$tool not found. Install it and retry."
  fi
done

NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node.js ≥20 required (found v$(node --version | sed 's/v//')). Run: nvm use 20"
fi

if ! command -v vercel &>/dev/null; then
  warn "Vercel CLI not found. Installing globally..."
  npm install -g vercel@latest 2>&1 | tail -3 || fail "Failed to install Vercel CLI."
  ok "vercel CLI installed — $(vercel --version)"
else
  ok "vercel CLI — $(vercel --version)"
fi

log "Toolchain OK. Node $NODE_MAJOR."

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 2 — Git state
# ─────────────────────────────────────────────────────────────────────────────
hdr "Git State"

cd "$REPO_ROOT"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
ok "Branch: $BRANCH"

if [[ "$BRANCH" != "main" ]]; then
  warn "Not on main branch. Deploying from '$BRANCH' — confirm this is intentional."
fi

UNCOMMITTED=$(git status --porcelain | wc -l | tr -d ' ')
if [[ "$UNCOMMITTED" -gt 0 ]]; then
  warn "$UNCOMMITTED uncommitted file(s). Only committed code will deploy."
  git status --short
fi

COMMIT=$(git rev-parse --short HEAD)
ok "HEAD commit: $COMMIT"
log "Git: branch=$BRANCH commit=$COMMIT uncommitted=$UNCOMMITTED"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 3 — Critical file locations
# ─────────────────────────────────────────────────────────────────────────────
hdr "File Integrity"

# 3a. middleware.ts must be at the project root (not src/)
MIDDLEWARE_ROOT="$UI_DIR/middleware.ts"
MIDDLEWARE_SRC="$UI_DIR/src/middleware.ts"

if [[ -f "$MIDDLEWARE_ROOT" ]]; then
  ok "middleware.ts present at project root"
else
  fail "middleware.ts missing from $MIDDLEWARE_ROOT\n     Next.js ignores middleware in src/ when app/ is at root.\n     Run: cp $MIDDLEWARE_SRC $MIDDLEWARE_ROOT"
fi

if [[ -f "$MIDDLEWARE_SRC" ]]; then
  warn "Redundant src/middleware.ts still exists (ignored by Next.js). Consider removing it."
fi

# Verify middleware exports
if ! grep -q "export function middleware" "$MIDDLEWARE_ROOT"; then
  fail "middleware.ts does not export 'middleware' function. File may be corrupt."
fi
if ! grep -q "export const config" "$MIDDLEWARE_ROOT"; then
  fail "middleware.ts missing 'export const config' — matcher not configured."
fi
ok "middleware.ts exports: middleware() + config"

# 3b. vercel.json sanity checks
VERCEL_JSON="$UI_DIR/vercel.json"
if [[ ! -f "$VERCEL_JSON" ]]; then
  fail "vercel.json not found at $VERCEL_JSON"
fi
if grep -q '"regions"' "$VERCEL_JSON"; then
  fail "vercel.json contains 'regions' field (Pro-only). Remove it for Hobby plan deploys."
fi
if ! grep -q '"buildCommand"' "$VERCEL_JSON"; then
  fail "vercel.json missing 'buildCommand'. Check camelCase keys."
fi
if ! grep -q '"installCommand"' "$VERCEL_JSON"; then
  fail "vercel.json missing 'installCommand'. Check camelCase keys."
fi
ok "vercel.json — camelCase keys valid, no Pro-only fields"

# 3c. package.json version checks
PKG="$UI_DIR/package.json"
NEXT_VERSION=$(node -pe "require('$PKG').dependencies.next" 2>/dev/null)
REACT_VERSION=$(node -pe "require('$PKG').dependencies.react" 2>/dev/null)
FM_VERSION=$(node -pe "require('$PKG').dependencies['framer-motion']" 2>/dev/null)

ok "next: $NEXT_VERSION"
ok "react: $REACT_VERSION"
ok "framer-motion: $FM_VERSION"

# Reject known-bad versions
if echo "$NEXT_VERSION" | grep -qE '^\^?16'; then
  fail "next@$NEXT_VERSION detected — Next.js 16 is unreleased. Pin to 15.1.0."
fi
if echo "$FM_VERSION" | grep -qE '11\.1[2-9]\.|12\.'; then
  fail "framer-motion@$FM_VERSION may not exist on npm. Use 11.11.17."
fi

log "File integrity OK. next=$NEXT_VERSION react=$REACT_VERSION framer=$FM_VERSION"

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 4 — Node modules
# ─────────────────────────────────────────────────────────────────────────────
hdr "Dependencies"

cd "$UI_DIR"

if [[ ! -d "node_modules" ]]; then
  warn "node_modules missing. Running install..."
  npm install --legacy-peer-deps 2>&1 | tail -5
  ok "Dependencies installed"
else
  INSTALLED_FM=$(node -pe "require('./node_modules/framer-motion/package.json').version" 2>/dev/null || echo "NOT FOUND")
  if [[ "$INSTALLED_FM" == "NOT FOUND" ]]; then
    warn "framer-motion not installed. Running npm install..."
    npm install --legacy-peer-deps 2>&1 | tail -5
  else
    ok "framer-motion installed: $INSTALLED_FM"
  fi
fi

log "Dependencies OK."

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 5 — TypeScript compile
# ─────────────────────────────────────────────────────────────────────────────
hdr "TypeScript"

cd "$UI_DIR"
TS_OUTPUT=$(npx tsc --noEmit 2>&1 || true)
TS_ERRORS=$(echo "$TS_OUTPUT" | grep -c "error TS" || true)

if [[ "$TS_ERRORS" -gt 0 ]]; then
  echo "$TS_OUTPUT" | grep "error TS" | head -20
  fail "$TS_ERRORS TypeScript error(s) detected. Fix before deploying."
else
  ok "TypeScript — 0 errors"
fi

log "TypeScript OK."

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 6 — Next.js production build
# ─────────────────────────────────────────────────────────────────────────────
hdr "Next.js Build"

cd "$UI_DIR"

if [[ "$SKIP_BUILD" == true ]]; then
  warn "--skip-build flag set. Skipping next build (use only if build was verified separately)."
else
  echo "  Running: next build (this may take 60–120s)..."
  BUILD_LOG=$(mktemp)

  if npm run build > "$BUILD_LOG" 2>&1; then
    BUILD_STATUS=0
  else
    BUILD_STATUS=$?
  fi

  # Extract and display key build output
  grep -E "✓|○|ƒ|Route|First Load|Middleware|error|warning|warn" "$BUILD_LOG" \
    | grep -v "^$" \
    | while IFS= read -r line; do echo "    $line"; done

  if [[ $BUILD_STATUS -ne 0 ]]; then
    echo ""
    echo "  Full build log:"
    cat "$BUILD_LOG"
    rm -f "$BUILD_LOG"
    fail "next build failed (exit $BUILD_STATUS). Fix errors above before deploying."
  fi

  # Check for active middleware in build output
  if grep -q "Middleware" "$BUILD_LOG"; then
    MIDDLEWARE_SIZE=$(grep "Middleware" "$BUILD_LOG" | awk '{print $NF, $(NF-1)}')
    ok "Middleware compiled and active — $MIDDLEWARE_SIZE"
  else
    warn "No middleware detected in build output. Verify middleware.ts location."
  fi

  rm -f "$BUILD_LOG"
  ok "next build — PASSED"
  log "Next.js build OK."
fi

# ─────────────────────────────────────────────────────────────────────────────
# CHECK 7 — Vercel authentication
# ─────────────────────────────────────────────────────────────────────────────
hdr "Vercel Auth"

cd "$UI_DIR"

VERCEL_WHOAMI=$(vercel whoami 2>&1 || true)
if echo "$VERCEL_WHOAMI" | grep -q "Error\|not logged in\|401"; then
  fail "Not logged in to Vercel. Run: vercel login"
fi
ok "Vercel authenticated as: $(echo "$VERCEL_WHOAMI" | tail -1)"

# Check project is linked
if [[ ! -f ".vercel/project.json" ]]; then
  warn "Project not linked to Vercel. Running: vercel link..."
  if [[ "$DRY_RUN" == true ]]; then
    warn "[DRY RUN] Would run: vercel link"
  else
    vercel link --yes 2>&1 | tail -5 || fail "Failed to link Vercel project. Run 'vercel link' manually."
    ok "Project linked to Vercel"
  fi
else
  PROJECT_ID=$(node -pe "require('./.vercel/project.json').projectId" 2>/dev/null)
  ok "Vercel project linked — ID: $PROJECT_ID"
fi

log "Vercel auth OK."

# ─────────────────────────────────────────────────────────────────────────────
# LAUNCH — Production deployment
# ─────────────────────────────────────────────────────────────────────────────
hdr "Production Deployment"

cd "$UI_DIR"

echo ""
echo -e "  ${B}Summary before push:${X}"
echo -e "  • Commit:      $COMMIT ($BRANCH)"
echo -e "  • Next.js:     $NEXT_VERSION"
echo -e "  • React:       $REACT_VERSION"
echo -e "  • framer:      $FM_VERSION"
echo -e "  • Middleware:  active at project root"
echo ""

if [[ "$DRY_RUN" == true ]]; then
  warn "[DRY RUN] Would execute: vercel --prod --yes"
  warn "[DRY RUN] No deployment triggered."
  log "Dry run complete. No deployment."
  echo -e "\n${G}${B}Pre-flight PASSED (dry run). Remove --dry-run to deploy.${X}\n"
  exit 0
fi

echo -e "  Triggering production deployment...\n"

DEPLOY_OUTPUT=$(vercel --prod --yes 2>&1)
DEPLOY_EXIT=$?

echo "$DEPLOY_OUTPUT" | while IFS= read -r line; do echo "    $line"; done

if [[ $DEPLOY_EXIT -ne 0 ]]; then
  log "Deployment FAILED. exit=$DEPLOY_EXIT"
  fail "Vercel deployment failed (exit $DEPLOY_EXIT). See output above."
fi

DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -E "https://" | tail -1 | tr -d ' ')
log "Deployment succeeded. url=$DEPLOY_URL"

echo ""
ok "Production deployment complete"
echo -e "  ${G}${B}→ $DEPLOY_URL${X}"
echo ""
echo -e "${G}${B}  ✓ All checks passed. Genesis Swarm is live.${X}"
echo ""
