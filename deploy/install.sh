#!/usr/bin/env bash
#
# install.sh — one-time setup for automatic deployment. Run this ONCE on
# the target VM (as a user with sudo access) to:
#   1. Create the dedicated deploy checkout at /opt/mkdd-live (separate
#      from any manual development checkout — see auto-deploy.sh header).
#   2. Install and enable a systemd timer that runs auto-deploy.sh every
#      minute.
#
# After this, any commit pushed to `main` on GitHub is automatically
# pulled, built, restarted, health-checked, and (if it fails) rolled back
# — usually within about a minute.
#
set -euo pipefail

REPO_URL="${MKDD_REPO_URL:-https://github.com/menokemo/openhands-mkdd.git}"
DEPLOY_DIR="${MKDD_DEPLOY_DIR:-/opt/mkdd-live}"

echo "==> Repo:       $REPO_URL"
echo "==> Deploy dir: $DEPLOY_DIR"
echo

if [ -d "$DEPLOY_DIR" ]; then
  echo "ERROR: $DEPLOY_DIR already exists." >&2
  echo "If this is intentional (re-running the installer), remove it first:" >&2
  echo "    sudo rm -rf $DEPLOY_DIR" >&2
  echo "WARNING: only do this if $DEPLOY_DIR has never been hand-edited." >&2
  exit 1
fi

echo "==> Cloning $REPO_URL into $DEPLOY_DIR ..."
sudo git clone "$REPO_URL" "$DEPLOY_DIR"
sudo git -C "$DEPLOY_DIR" checkout -B main origin/main
sudo chown -R "$(id -u):$(id -g)" "$DEPLOY_DIR"

# Every file this script needs after this point is read from inside the
# freshly-cloned $DEPLOY_DIR/deploy/ (not from wherever THIS script
# happens to be running from). install.sh is commonly copied out of its
# natural location before being run (e.g. to /tmp, to avoid a separate
# clone just to fetch it) - referencing $DEPLOY_DIR/deploy/ instead of
# this script's own location makes that safe, since $DEPLOY_DIR is
# guaranteed cloned by this point regardless of where install.sh itself
# came from. Found live: a copy-to-/tmp invocation failed with
# "cp: cannot stat '/tmp/.env.staging'" until this fix.
DEPLOY_SCRIPT_DIR="$DEPLOY_DIR/deploy"

echo "==> Installing staging .env (isolated ports/names/image/volume, never"
echo "    touches the production stack — see deploy/.env.staging comments)..."
cp "$DEPLOY_SCRIPT_DIR/.env.staging" "$DEPLOY_DIR/.env"
chmod +x "$DEPLOY_DIR/setup.sh" "$DEPLOY_DIR/deploy/auto-deploy.sh"

echo "==> Recording current commit as the initial 'last known good' baseline..."
git -C "$DEPLOY_DIR" rev-parse HEAD >"$DEPLOY_DIR/.last-good-commit"

echo "==> Running the initial build + start (auto-deploy.sh only reacts to"
echo "    NEW commits after this point, so the first deploy happens now)..."
(cd "$DEPLOY_DIR" && ./setup.sh up)

echo "==> Installing systemd units..."
sudo cp "$DEPLOY_SCRIPT_DIR/mkdd-auto-deploy.service" /etc/systemd/system/mkdd-auto-deploy.service
sudo cp "$DEPLOY_SCRIPT_DIR/mkdd-auto-deploy.timer" /etc/systemd/system/mkdd-auto-deploy.timer

echo "==> Reloading systemd and enabling the timer..."
sudo systemctl daemon-reload
sudo systemctl enable --now mkdd-auto-deploy.timer

cat <<EOF

==> Done.

Auto-deploy is now active: mkdd-auto-deploy.timer runs every minute and
will automatically pull, build, restart, and health-check any new commit
pushed to 'main'. On failure it rolls back to the last known good commit.

This staging stack is FULLY ISOLATED from any production instance running
on this VM (different ports, container names, image tag, volume, and
Docker Compose project — see deploy/README.md for the full table).

Staging MKDD UI: http://localhost:18787  (production, if running, stays on 8787)

Useful commands:
    systemctl status mkdd-auto-deploy.timer     # confirm the timer is active
    sudo journalctl -u mkdd-auto-deploy.service -f   # follow systemd logs
    tail -f /var/log/mkdd-auto-deploy.log            # follow deploy log
    sudo systemctl stop mkdd-auto-deploy.timer       # pause auto-deploy
    sudo systemctl disable mkdd-auto-deploy.timer    # disable permanently

Reminder: $DEPLOY_DIR is now a DEDICATED, hands-off checkout. Never
hand-edit files there — any local change will be wiped by the next
automatic 'git reset --hard'. Do manual development elsewhere and push
to GitHub when ready.
EOF
