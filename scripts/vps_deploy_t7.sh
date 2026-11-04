#!/bin/bash
set -e

echo "=== STEP 1: BACKUP DATABASE ==="
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/root/backup_ztreel7_${TIMESTAMP}.sql"
if docker ps --format '{{.Names}}' | grep -q '^ztreel7_postgres_prod$'; then
  docker exec ztreel7_postgres_prod pg_dump -U user_t7 ztreel_t7 > "${BACKUP_FILE}" 2>/dev/null || true
  if [ -s "${BACKUP_FILE}" ]; then
    echo "Database backed up to: ${BACKUP_FILE}"
  else
    rm -f "${BACKUP_FILE}"
  fi
fi

echo "=== STEP 2: GIT PULL ==="
cd /root/ztreel-t7
git pull origin main
echo "Current commit: $(git rev-parse --short HEAD)"

echo "=== STEP 3: REBUILD AND START API & WEB ==="
docker compose -f docker-compose.t7.yml build api web
docker compose -f docker-compose.t7.yml up -d --no-deps api web

echo "=== STEP 4: RUN DB MIGRATIONS ==="
sleep 3
docker exec ztreel7_api_prod npx prisma db push || true

echo "=== STEP 5: VERIFY CONTAINERS ==="
docker ps --filter "name=ztreel7" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

