#!/usr/bin/env bash
# Ship the source to the VM and (re)build the stack there.
# Usage: ./deploy.sh            -> sync + build + restart
# Env: GCP_INSTANCE, GCP_ZONE, GCP_USER, REMOTE_DIR can override defaults.
set -euo pipefail
INSTANCE=${GCP_INSTANCE:-gcp-vm}
ZONE=${GCP_ZONE:-asia-south1-a}
USER_NAME=${GCP_USER:-devuser}
REMOTE_DIR=${REMOTE_DIR:-/home/devuser/hms-yashgoyal}
cd "$(dirname "$0")"

tar --no-xattrs -czf - \
  --exclude='./.git' --exclude='*/node_modules' --exclude='./frontend/dist' --exclude='./.env' \
  --exclude='.DS_Store' . \
| gcloud compute ssh "${USER_NAME}@${INSTANCE}" --zone "$ZONE" --quiet --command "
  set -e
  mkdir -p ${REMOTE_DIR} && cd ${REMOTE_DIR}
  tar -xzf - 2>/dev/null
  test -f .env || { echo 'Missing .env in ${REMOTE_DIR}'; exit 1; }
  sudo docker compose up -d --build --remove-orphans
  sudo docker image prune -f >/dev/null
  sudo docker compose ps
"
