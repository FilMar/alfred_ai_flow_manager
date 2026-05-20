#!/usr/bin/env bash
set -euo pipefail

VOLUME="${1:-qdrant_storage}"
BACKUP_DIR="${2:-.}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTFILE="${BACKUP_DIR}/qdrant_backup_${TIMESTAMP}.tar.gz"

# Rileva runtime: podman o docker
if command -v podman &>/dev/null; then
  RUNTIME="podman"
elif command -v docker &>/dev/null; then
  RUNTIME="docker"
else
  echo "Errore: né podman né docker trovati nel PATH." >&2
  exit 1
fi

echo "Runtime: ${RUNTIME}"
echo "Volume:  ${VOLUME}"
echo "Output:  ${OUTFILE}"

# Verifica che il volume esista
if ! ${RUNTIME} volume inspect "${VOLUME}" &>/dev/null; then
  echo "Errore: volume '${VOLUME}' non trovato." >&2
  exit 1
fi

# Crea la directory di output se non esiste
mkdir -p "${BACKUP_DIR}"

# Backup
if [[ "${RUNTIME}" == "podman" ]]; then
  ${RUNTIME} volume export "${VOLUME}" | gzip > "${OUTFILE}"
else
  ${RUNTIME} run --rm \
    -v "${VOLUME}:/data:ro" \
    -v "$(realpath "${BACKUP_DIR}"):/backup" \
    alpine tar czf "/backup/$(basename "${OUTFILE}")" -C /data .
fi

echo "Fatto: ${OUTFILE} ($(du -h "${OUTFILE}" | cut -f1))"
