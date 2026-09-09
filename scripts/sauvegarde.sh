#!/bin/sh
# scripts/sauvegarde.sh — une sauvegarde complète et horodatée : la base
# (pg_dump, format custom) ET le volume des fichiers (tar). L'une sans l'autre
# ne restaure rien d'utile : les chemins sont en base, les octets sur le
# disque, et seuls les deux ensemble font une maison.
#
#   ./scripts/sauvegarde.sh                  # sur le Pi, depuis la racine du dépôt
#   SANS_DOCKER=1 ./scripts/sauvegarde.sh    # avec pg_dump local, DATABASE_URL et STOCKAGE_RACINE
#
# Variables, lues dans .env si présent, toutes optionnelles :
#   SAUVEGARDES             dossier de destination        (défaut : ./sauvegardes)
#   RETENTION_JOURS         au-delà, effacé localement    (défaut : 14)
#   SAUVEGARDE_DESTINATION  cible rsync hors de la machine (ex. nas:/volume1/maison/)
#                           vide = rien ne quitte le Pi, et le README le dit.
#
# La restauration est `scripts/restauration.sh`. Une sauvegarde jamais
# restaurée n'est pas une sauvegarde : la procédure du README a été exécutée.
set -eu

# 0600 sur les fichiers, 0700 sur le dossier. Sans ça le dump sortait en 644 :
# il contient TOUTES les fiches, les `details` de niveau 3, les téléphones et
# e-mails des intervenants, les coûts, les JETONS DE PARTAGE EN CLAIR et le
# hash du mot de passe du propriétaire ; le tar contient toutes les photos.
# Lisible par n'importe quel utilisateur local du Pi, c'est-à-dire le modèle de
# permission entier annulé par un `chmod` qu'on n'a pas posé.
umask 077

cd "$(dirname "$0")/.."

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
RETENTION_JOURS="${RETENTION_JOURS:-14}"
HORODATAGE="$(date +%Y%m%d-%H%M%S)"
BASE="$DOSSIER/$HORODATAGE.base.dump"
FICHIERS="$DOSSIER/$HORODATAGE.fichiers.tgz"
mkdir -p "$DOSSIER"

# On écrit dans des fichiers temporaires et on renomme à la fin. La
# redirection `>` TRONQUE sa cible avant que la commande tourne : un pg_dump
# qui échoue à mi-course laissait donc un `.base.dump` partiel, portant
# l'horodatage du jour, à côté des bons — c'est-à-dire quelque chose qui a
# l'air d'une sauvegarde et n'en est pas. Le renommage est atomique : ce qui
# porte le nom final a été écrit en entier.
BASE_PARTIELLE="$BASE.partiel"
FICHIERS_PARTIELS="$FICHIERS.partiel"
trap 'rm -f "$BASE_PARTIELLE" "$FICHIERS_PARTIELS"' EXIT

if [ "${SANS_DOCKER:-0}" = "1" ]; then
  pg_dump --format=custom --dbname="$DATABASE_URL" > "$BASE_PARTIELLE"
  mkdir -p "$STOCKAGE_RACINE"
  tar -czf "$FICHIERS_PARTIELS" -C "$STOCKAGE_RACINE" .
else
  # Les identifiants viennent de l'environnement DU conteneur : rien à
  # recopier ici, et le mot de passe ne passe par aucune ligne de commande.
  docker compose exec -T postgres sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$BASE_PARTIELLE"
  docker compose exec -T app sh -c 'mkdir -p /donnees/fichiers && tar -czf - -C /donnees/fichiers .' > "$FICHIERS_PARTIELS"
fi

mv "$BASE_PARTIELLE" "$BASE"
mv "$FICHIERS_PARTIELS" "$FICHIERS"

# Rétention locale. La copie distante, elle, n'est jamais élaguée d'ici :
# une machine compromise ne doit pas pouvoir effacer ce qui la sauve.
find "$DOSSIER" -maxdepth 1 -type f \( -name '*.base.dump' -o -name '*.fichiers.tgz' \) -mtime +"$RETENTION_JOURS" -delete

if [ -n "${SAUVEGARDE_DESTINATION:-}" ]; then
  # Sans `--delete`, délibérément : une machine compromise ne doit pas pouvoir
  # effacer ce qui la sauve. Corollaire assumé, à savoir avant de choisir la
  # cible : LA DESTINATION DISTANTE GROSSIT SANS FIN. `RETENTION_JOURS` n'y
  # touche pas, il faut une rétention là-bas.
  rsync -a "$DOSSIER/" "$SAUVEGARDE_DESTINATION"
fi

echo "sauvegarde $HORODATAGE : base $(du -h "$BASE" | cut -f1), fichiers $(du -h "$FICHIERS" | cut -f1), dans $DOSSIER${SAUVEGARDE_DESTINATION:+ puis $SAUVEGARDE_DESTINATION}"
