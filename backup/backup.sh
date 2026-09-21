#!/bin/sh
# Scheduled + on-demand MongoDB backups. Runs inside the mongo image (has mongodump).
set -u
DIR=/backups
INTERVAL_HOURS=${BACKUP_INTERVAL_HOURS:-24}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
URI="mongodb://${MONGO_USER}:${MONGO_PASSWORD}@hms-mongo:27017/${MONGO_DB}?authSource=admin"
mkdir -p "$DIR"

run_backup() {
  name="hms-$(date +%Y%m%d-%H%M%S).archive.gz"
  started=$(date -Iseconds)
  if mongodump --uri="$URI" --archive="$DIR/$name.tmp" --gzip --quiet; then
    mv "$DIR/$name.tmp" "$DIR/$name"
    printf '{"lastRun":"%s","status":"success","file":"%s","reason":"%s"}\n' "$started" "$name" "$1" > "$DIR/.status.json"
    echo "[backup] created $name ($1)"
  else
    rm -f "$DIR/$name.tmp"
    printf '{"lastRun":"%s","status":"failed","reason":"%s"}\n' "$started" "$1" > "$DIR/.status.json"
    echo "[backup] FAILED ($1)"
  fi
  find "$DIR" -name 'hms-*.archive.gz' -mtime +"$RETENTION_DAYS" -delete
}

sleep 20
last=0
while true; do
  now=$(date +%s)
  if [ -f "$DIR/.trigger" ]; then
    rm -f "$DIR/.trigger"
    run_backup manual
  elif [ $((now - last)) -ge $((INTERVAL_HOURS * 3600)) ]; then
    run_backup scheduled
    last=$now
  fi
  sleep 30
done
