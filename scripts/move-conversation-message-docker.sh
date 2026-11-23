#!/bin/bash
# Move a chat message using the already running production app container.
# The container has node, pg and DATABASE_URL. The script is piped in, so the
# image does not need a rebuild.
#
# Run from the repository root on the server (where docker-compose.prod.yml and
# .env.prod are):
#
#   ./scripts/move-conversation-message-docker.sh \
#     --from 0cb02258-9664-4e18-8bc5-4adfc7f8e74f \
#     --message e3a53780-003b-411d-a109-d0bbb7b352a7 \
#     --to 7d19f96e-8c41-4754-8a10-97f9f51f1b3e
#
#   ./scripts/move-conversation-message-docker.sh ... --apply
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FROM_ID=""
TO_ID=""
MESSAGE_ID=""
APPLY="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from) FROM_ID="${2:-}"; shift 2 ;;
    --to) TO_ID="${2:-}"; shift 2 ;;
    --message) MESSAGE_ID="${2:-}"; shift 2 ;;
    --apply) APPLY="1"; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$FROM_ID" || -z "$TO_ID" || -z "$MESSAGE_ID" ]]; then
  echo "Usage: $0 --from <chat-uuid> --message <message-uuid> --to <chat-uuid> [--apply]" >&2
  exit 1
fi

exec docker compose -f docker-compose.prod.yml --env-file .env.prod exec -iT \
  -e "MOVE_FROM=${FROM_ID}" \
  -e "MOVE_TO=${TO_ID}" \
  -e "MOVE_MESSAGE=${MESSAGE_ID}" \
  -e "MOVE_APPLY=${APPLY}" \
  app node --input-type=module - < "${ROOT}/scripts/move-conversation-message.mjs"
