#!/usr/bin/env bash
#
# backup-mkdd-data.sh — automated backup for MKDD's persisted data
# (mkdd-data/: workflow state, user accounts/sessions, avatars, push
# subscriptions). Nothing in this project backed up this data before -
# a lost or corrupted volume meant losing every project's workflow
# history, findings, reports, and every user's account entirely.
#
# Usage:
#   ./backup-mkdd-data.sh            # create a backup now
#   ./backup-mkdd-data.sh list       # list existing backups
#   ./backup-mkdd-data.sh restore <backup-file>   # restore a specific backup
#
# For AUTOMATIC daily backups, add this to crontab (crontab -e):
#   0 3 * * * /opt/openhands-mkdd/backup-mkdd-data.sh >> /var/log/mkdd-backup.log 2>&1
# (adjust the path to wherever this repo actually lives on your VM)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/mkdd-data"
# Deliberately OUTSIDE mkdd-data/ itself - backing up into the same
# directory being backed up would mean every subsequent backup also
# archives all the previous backup files, growing without bound.
BACKUP_DIR="${MKDD_BACKUP_DIR:-$SCRIPT_DIR/backups}"
# Keep this many most-recent backups; older ones are pruned
# automatically. 14 daily backups = two weeks of history by default.
RETENTION_COUNT="${MKDD_BACKUP_RETENTION:-14}"

create_backup() {
  if [ ! -d "$DATA_DIR" ]; then
    echo "Error: $DATA_DIR does not exist - nothing to back up." >&2
    exit 1
  fi

  mkdir -p "$BACKUP_DIR"
  local timestamp
  timestamp="$(date +%Y%m%d-%H%M%S)"
  local backup_file="$BACKUP_DIR/mkdd-data-backup-$timestamp.tar.gz"

  # -C so the archive's internal paths are relative (mkdd-data/...),
  # not absolute - makes restoring onto a different machine/path work
  # correctly.
  tar -czf "$backup_file" -C "$SCRIPT_DIR" mkdd-data

  local size
  size="$(du -h "$backup_file" | cut -f1)"
  echo "Backup created: $backup_file ($size)"

  prune_old_backups
}

prune_old_backups() {
  # List backups oldest-first, skip the N most recent (keep them),
  # delete the rest.
  local backups
  backups="$(ls -1t "$BACKUP_DIR"/mkdd-data-backup-*.tar.gz 2>/dev/null || true)"
  local count
  count="$(echo "$backups" | grep -c . || true)"

  if [ "$count" -le "$RETENTION_COUNT" ]; then
    return
  fi

  echo "$backups" | tail -n "+$((RETENTION_COUNT + 1))" | while read -r old_backup; do
    echo "Pruning old backup: $old_backup"
    rm -f "$old_backup"
  done
}

list_backups() {
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
    echo "No backups found in $BACKUP_DIR"
    return
  fi
  ls -lht "$BACKUP_DIR"/mkdd-data-backup-*.tar.gz
}

restore_backup() {
  local backup_file="$1"

  if [ -z "$backup_file" ]; then
    echo "Usage: $0 restore <backup-file>" >&2
    echo "Run '$0 list' to see available backups." >&2
    exit 1
  fi

  if [ ! -f "$backup_file" ]; then
    # Allow passing just the filename (not the full path) for
    # convenience.
    backup_file="$BACKUP_DIR/$backup_file"
  fi

  if [ ! -f "$backup_file" ]; then
    echo "Error: backup file not found: $backup_file" >&2
    exit 1
  fi

  echo "This will REPLACE the current contents of $DATA_DIR with the"
  echo "backup at: $backup_file"
  echo "The current data will be moved aside first (not deleted), but"
  echo "make sure the app is stopped before restoring."
  read -r -p "Type 'yes' to continue: " confirmation

  if [ "$confirmation" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
  fi

  if [ -d "$DATA_DIR" ]; then
    local moved_aside="$DATA_DIR.before-restore-$(date +%Y%m%d-%H%M%S)"
    mv "$DATA_DIR" "$moved_aside"
    echo "Current data moved aside to: $moved_aside"
  fi

  tar -xzf "$backup_file" -C "$SCRIPT_DIR"
  echo "Restored from: $backup_file"
  echo "Restart the mkdd-ui container for the restored data to take effect."
}

case "${1:-backup}" in
  backup) create_backup ;;
  list) list_backups ;;
  restore) restore_backup "${2:-}" ;;
  *)
    echo "Usage: $0 {backup|list|restore <backup-file>}"
    exit 1
    ;;
esac
