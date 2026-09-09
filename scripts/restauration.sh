#!/bin/sh
# scripts/restauration.sh — restaure une sauvegarde de `sauvegarde.sh` dans
# une base VIDE et dans le volume des fichiers. Refuse une base qui contient
# déjà des tables : restaurer par-dessus mélangerait deux maisons, et une
# base à demi restaurée est pire qu'une base absente.
#
#   ./scripts/restauration.sh 20260909-030000                # sur le Pi
#   SANS_DOCKER=1 ./scripts/restauration.sh 20260909-030000  # pg_restore local
#
# Sur le Pi, la base vide s'obtient en repartant du volume :
#   docker compose down && docker volume rm <projet>_postgres_data
# puis ce script démarre postgres, restaure, démarre l'application (ses
# migrations trouvent la table de suivi restaurée et ne font rien) et
# décompresse les fichiers dans le volume.
set -eu
cd "$(dirname "$0")/.."

[ $# -eq 1 ] || { echo "usage : $0 <horodatage>  (ex. 20260909-030000)" >&2; exit 2; }

# .env ne fournit que ce que l'environnement ne dit pas déjà : la même
# priorité que docker compose, et ce qui permet de restaurer dans une AUTRE
# base en passant DATABASE_URL sur la ligne de commande.
if [ -f .env ]; then
  while IFS= read -r ligne || [ -n "$ligne" ]; do
    case "$ligne" in ''|'#'*) continue ;; esac
    nom="${ligne%%=*}"
    if eval "[ -z \"\${$nom+x}\" ]"; then export "$ligne"; fi
  done < .env
fi

DOSSIER="${SAUVEGARDES:-./sauvegardes}"
BASE="$DOSSIER/$1.base.dump"
FICHIERS="$DOSSIER/$1.fichiers.tgz"
[ -f "$BASE" ] && [ -f "$FICHIERS" ] || { echo "sauvegarde $1 introuvable dans $DOSSIER (il faut $1.base.dump ET $1.fichiers.tgz)" >&2; exit 1; }

# Tout schéma utilisateur compte, `drizzle` compris : une base où seules les
# migrations ont tourné n'est déjà plus vide.
REQUETE="SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')"

if [ "${SANS_DOCKER:-0}" = "1" ]; then
  TABLES="$(psql "$DATABASE_URL" -tAc "$REQUETE")"
  [ "$TABLES" = "0" ] || { echo "la base n'est pas vide ($TABLES tables) : on ne restaure que dans une base vide" >&2; exit 1; }
  pg_restore --no-owner --no-privileges --exit-on-error --dbname="$DATABASE_URL" "$BASE"
  mkdir -p "$STOCKAGE_RACINE"
  tar -xzf "$FICHIERS" -C "$STOCKAGE_RACINE"
else
  docker compose up -d --wait postgres
  TABLES="$(docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"$REQUETE\"")"
  [ "$TABLES" = "0" ] || { echo "la base n'est pas vide ($TABLES tables) : arrêter, supprimer le volume postgres_data, recommencer" >&2; exit 1; }
  docker compose exec -T postgres sh -c 'pg_restore --no-owner --no-privileges --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$BASE"
  docker compose up -d --wait app
  docker compose exec -T app sh -c 'mkdir -p /donnees/fichiers && tar -xzf - -C /donnees/fichiers' < "$FICHIERS"
  docker compose up -d
fi

echo "restauration $1 terminée"
