#!/bin/sh
# scripts/sauvegarde.sh — une sauvegarde complète et horodatée : la base
# (pg_dump, format custom) ET le volume des fichiers (tar). L'une sans l'autre
# ne restaure rien d'utile : les chemins sont en base, les octets sur le
# disque, et seuls les deux ensemble font une maison.
#
#   ./scripts/sauvegarde.sh                  # sur le VPS, depuis la racine du dépôt
#   SANS_DOCKER=1 ./scripts/sauvegarde.sh    # avec pg_dump local, DATABASE_URL et STOCKAGE_RACINE
#
# Variables, lues dans .env si présent, toutes optionnelles :
#   SAUVEGARDES             dossier de destination        (défaut : ./sauvegardes)
#   RETENTION_JOURS         au-delà, effacé localement    (défaut : 14)
#   SAUVEGARDE_DESTINATION  cible rsync hors de la machine (ex. nas:/volume1/maison/)
#                           vide = rien ne quitte la machine, et ce script
#                           l'écrit alors sur la sortie d'erreur : sur un VPS,
#                           une sauvegarde qui reste sur la VM ne survit pas à
#                           la perte de la VM.
#
# La restauration est `scripts/restauration.sh`. Une sauvegarde jamais
# restaurée n'est pas une sauvegarde : la procédure du README a été exécutée.
set -eu

# 0600 sur les fichiers, 0700 sur le dossier. Sans ça le dump sortait en 644 :
# il contient TOUTES les fiches, les `details` de niveau 3, les téléphones et
# e-mails des intervenants, les coûts, les JETONS DE PARTAGE EN CLAIR et le
# hash du mot de passe du propriétaire ; le tar contient toutes les photos.
# Lisible par n'importe quel utilisateur local de la machine, c'est-à-dire le
# modèle de permission entier annulé par un `chmod` qu'on n'a pas posé.
umask 077

cd "$(dirname "$0")/.."

# `.env` ne fournit que ce que l'environnement ne dit pas déjà, et SEULEMENT
# les variables listées ici : ce script démarre des conteneurs, et tout ce
# qu'il exporte remplace pour eux ce que compose aurait lu. `POSTGRES_USER` et
# `POSTGRES_DB` n'y sont pas — ils ne sont lus que DANS le conteneur, par le
# `sh -c` en quotes simples plus bas. Voir `scripts/lire-env.sh`, issue #35.
. ./scripts/lire-env.sh
lire_env "SAUVEGARDES RETENTION_JOURS SAUVEGARDE_DESTINATION DATABASE_URL STOCKAGE_RACINE"

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

# Rétention locale. La copie distante, elle, n'est jamais élaguée d'ici : une
# purge d'ici ne doit pas se propager là-bas. Ça ne protège PAS d'une machine
# compromise — voir le commentaire de `rsync` plus bas.
find "$DOSSIER" -maxdepth 1 -type f \( -name '*.base.dump' -o -name '*.fichiers.tgz' \) -mtime +"$RETENTION_JOURS" -delete

if [ -n "${SAUVEGARDE_DESTINATION:-}" ]; then
  # Sans `--delete`, délibérément : une purge locale — bug d'ici, rétention
  # trop courte — ne doit pas se propager à ce qui nous sauve. Ce que ça ne
  # protège PAS, et la décision #131 l'affirmait à tort : une machine
  # compromise. La clé qui écrit là-bas ÉCRIT, `--delete` ou pas, et peut donc
  # écraser chaque fichier de la destination. Fermer ce cas demanderait une
  # destination en ajout seul, ou une sauvegarde TIRÉE depuis une autre
  # machine — rien de tout ça ici. Corollaire assumé, à savoir avant de
  # choisir la cible : LA DESTINATION DISTANTE GROSSIT SANS FIN.
  # `RETENTION_JOURS` n'y touche pas, il faut une rétention là-bas.
  rsync -a "$DOSSIER/" "$SAUVEGARDE_DESTINATION"
else
  # Pas une erreur : la sauvegarde locale a réussi, et un code de sortie non
  # nul dirait le contraire. Mais sur un VPS, une sauvegarde qui reste sur la
  # VM ne survit ni à la perte de la VM, ni à un compte suspendu, ni à un
  # incident chez l'hébergeur — et le silence laissait croire le contraire.
  # Sur la sortie d'erreur, pour que la ligne de compte rendu ci-dessous reste
  # analysable et que l'avertissement ressorte quand même dans le journal.
  echo "AVERTISSEMENT : SAUVEGARDE_DESTINATION est vide — cette sauvegarde ne quitte pas la machine et ne survivra pas à sa perte. Voir README, « Sauvegarde »." >&2
fi

echo "sauvegarde $HORODATAGE : base $(du -h "$BASE" | cut -f1), fichiers $(du -h "$FICHIERS" | cut -f1), dans $DOSSIER${SAUVEGARDE_DESTINATION:+ puis $SAUVEGARDE_DESTINATION}"
