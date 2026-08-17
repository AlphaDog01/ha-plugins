#!/usr/bin/env bash
#
# install.sh — Hades HA Plugins installer
#
# Downloads AlphaDog01/ha-plugins from GitHub and deploys the selected
# plugins onto this HA box.
#
# This script does NOT fetch its own GitHub token or hold any secrets —
# it expects GITHUB_TOKEN to already be set in the environment. Two ways
# to get that:
#
#   1. Recommended: run it via bootstrap.sh, which fetches a fresh token
#      from Hades Vault and passes it in for you. See the repo README.
#   2. Manual/debug: export GITHUB_TOKEN=ghp_... yourself before running.
#
# Usage:
#   ./install.sh                 # install everything (household + cards)
#   ./install.sh household       # only ha-household
#   ./install.sh cards           # only ha-cards
#   ./install.sh household cards # both, explicitly
#
set -euo pipefail

: "${GITHUB_TOKEN:?GITHUB_TOKEN not set — run via bootstrap.sh, or export it yourself for a manual run}"

GITHUB_REPO="AlphaDog01/ha-plugins"
GITHUB_BRANCH="main"

CONFIG_DIR="/config"
COMPONENTS_DIR="$CONFIG_DIR/custom_components"
WWW_DIR="$CONFIG_DIR/www"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

for bin in curl tar; do
  command -v "$bin" >/dev/null 2>&1 || { echo "Missing dependency: $bin" >&2; exit 1; }
done

# ── Which plugins? Default to everything if no args given. ──────────────────
PLUGINS=("$@")
if [[ ${#PLUGINS[@]} -eq 0 ]]; then
  PLUGINS=("household" "cards")
fi

echo "[install] Downloading $GITHUB_REPO@$GITHUB_BRANCH ..."
if ! curl -sSfL \
  --header "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$GITHUB_REPO/tarball/$GITHUB_BRANCH" \
  -o "$WORK_DIR/repo.tar.gz"; then
  echo "[install] ERROR: failed to download the repo tarball. Check GITHUB_TOKEN is valid and has read access to $GITHUB_REPO." >&2
  exit 1
fi

mkdir -p "$WORK_DIR/repo"
tar -xzf "$WORK_DIR/repo.tar.gz" -C "$WORK_DIR/repo" --strip-components=1

install_household() {
  if [[ ! -d "$WORK_DIR/repo/ha-household" ]]; then
    echo "[install] ERROR: ha-household/ not found in downloaded repo — aborting this plugin." >&2
    return 1
  fi
  echo "[install] Installing ha-household -> $COMPONENTS_DIR/hades_household/"
  mkdir -p "$COMPONENTS_DIR"
  rm -rf "$COMPONENTS_DIR/hades_household"
  cp -r "$WORK_DIR/repo/ha-household" "$COMPONENTS_DIR/hades_household"
}

install_cards() {
  if [[ ! -d "$WORK_DIR/repo/ha-cards" ]]; then
    echo "[install] ERROR: ha-cards/ not found in downloaded repo — aborting this plugin." >&2
    return 1
  fi
  echo "[install] Installing ha-cards -> $WWW_DIR/"
  mkdir -p "$WWW_DIR"
  cp -r "$WORK_DIR/repo/ha-cards/"*.js "$WWW_DIR/"
}

RESTART_NEEDED=0
CARDS_UPDATED=0

for plugin in "${PLUGINS[@]}"; do
  case "$plugin" in
    household)
      install_household && RESTART_NEEDED=1
      ;;
    cards)
      install_cards && CARDS_UPDATED=1
      ;;
    auth)
      echo "[install] 'auth' has been retired and removed from this repo — skipping." >&2
      ;;
    *)
      echo "[install] Unknown plugin '$plugin' — skipping. Valid: household, cards" >&2
      ;;
  esac
done

echo "[install] Done."
if [[ "$RESTART_NEEDED" -eq 1 ]]; then
  echo "[install] household was updated — restart HA: Settings -> System -> Restart"
  echo "[install]   (a plain integration Reload isn't always enough for new/changed Python files)"
fi
if [[ "$CARDS_UPDATED" -eq 1 ]]; then
  echo "[install] cards were updated — bump the resource URL (?v=N) in"
  echo "[install]   Settings -> Dashboards -> Resources and hard-refresh the browser"
fi
