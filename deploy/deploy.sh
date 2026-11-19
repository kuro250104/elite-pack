#!/bin/sh
# Déploiement d'une version sur le serveur, lancé par .github/workflows/cd.yml (ou à la main).
#   IMAGE=ghcr.io/kuro250104/elite-pack TAG=sha-0123456789ab ./deploy.sh
# 1. télécharge les images ; 2. applique les migrations (additives, compatibles avec la version en cours) ;
# 3. remplace l'application et attend que sa sonde /api/health soit saine ;
# 4. en cas d'échec, revient automatiquement à la version précédente.
set -eu
: "${IMAGE:?IMAGE manquante}"
: "${TAG:?TAG manquant}"
cd "$(dirname "$0")"
[ -f .env ] || { echo "Fichier .env absent : voir .env.production.example" >&2; exit 1; }

compose() { docker compose -f compose.prod.yaml "$@"; }
previous="$(cat .deployed-tag 2>/dev/null || true)"
export IMAGE TAG

echo "Déploiement de $IMAGE:$TAG (version précédente : ${previous:-aucune})"
compose pull migrate app
compose up -d --wait postgres
compose run --rm migrate

if compose up -d --no-deps --wait --wait-timeout 120 app; then
  compose up -d caddy
  echo "$TAG" > .deployed-tag
  docker image prune --force --filter "until=168h" > /dev/null
  echo "Version $TAG en service."
  exit 0
fi

echo "La nouvelle version n'est pas saine : journaux de l'application" >&2
compose logs --tail 50 app >&2 || true
if [ -n "$previous" ]; then
  echo "Retour à la version $previous" >&2
  TAG="$previous" compose up -d --no-deps --wait --wait-timeout 120 app
fi
exit 1
