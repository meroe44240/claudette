#!/usr/bin/env bash
# Daily backup: every Postgres database + Mattermost files, kept BACKUP_KEEP_DAYS days,
# optional off-site copy with rclone. Run by hand:  docker compose exec backup backup.sh
set -euo pipefail

day=$(date +%Y-%m-%d)
dir="/backups/$day"
mkdir -p "$dir"

for db in $(psql -d postgres -Atc "select datname from pg_database where not datistemplate and datname <> 'postgres'"); do
  pg_dump -Fc -d "$db" -f "$dir/$db.dump"
  echo "[backup] $db -> $dir/$db.dump ($(du -h "$dir/$db.dump" | cut -f1))"
done

tar -czf "$dir/mattermost-files.tar.gz" -C /mattermost-data .
echo "[backup] files -> $dir/mattermost-files.tar.gz ($(du -h "$dir/mattermost-files.tar.gz" | cut -f1))"

find /backups -mindepth 1 -maxdepth 1 -type d -mtime +"${BACKUP_KEEP_DAYS:-14}" -exec rm -rf {} +

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  rclone copy "$dir" "$RCLONE_REMOTE/$day" --config /config/rclone/rclone.conf
  rclone delete "$RCLONE_REMOTE" --min-age "${BACKUP_KEEP_DAYS:-14}d" --config /config/rclone/rclone.conf || true
  echo "[backup] copied off-site to $RCLONE_REMOTE/$day"
fi
echo "[backup] done $day"
