#!/bin/sh
# scripts/lire-env.sh — à sourcer par `sauvegarde.sh` et `restauration.sh`.
#
#   . ./scripts/lire-env.sh
#   lire_env "SAUVEGARDES RETENTION_JOURS"      # et rien d'autre de .env
#
# Pourquoi une liste blanche, et pas un `tr -d '\r'` sur la boucle d'avant.
#
# Les deux scripts démarrent des conteneurs (`docker compose up`). Or
# l'environnement gagne sur `.env` pour l'interpolation de compose : tout ce
# qu'un script exporte remplace, pour ces conteneurs-là, ce que compose aurait
# lu lui-même. La boucle d'avant exportait TOUT `.env` tel quel, guillemets et
# `\r` compris, et les deux analyseurs ne lisent pas pareil — compose retire
# les deux, `read` les garde. Un conteneur démarré par un script était donc
# configuré autrement qu'un `docker compose up` ordinaire.
#
# Mesuré le 12 septembre (issue #35) : `SESSION_SECRET` à 65 caractères côté
# script contre 64 côté compose, donc toutes les sessions rejetées par une
# restauration alors que la table `session` était bien restaurée. La variante
# grave n'a pas été tirée : `restauration.sh` initialise `postgres` sur un
# volume VIDE, donc un `POSTGRES_PASSWORD` divergent aurait fixé le mot de
# passe du rôle sur une valeur qu'aucun `docker compose up` ultérieur n'aurait
# présentée — l'instance restaurée ne pouvant plus se connecter à sa base.
#
# La liste blanche règle ça à la racine plutôt qu'au symptôme : ni
# `SESSION_SECRET` ni `POSTGRES_PASSWORD` ne transitent plus par
# l'environnement du script, donc ils ne PEUVENT plus diverger de ce que
# compose lit. Retirer le `\r` n'aurait fermé qu'une des deux divergences, et
# seulement pour les valeurs qui passent encore par ici.
#
# Ce qui reste vrai et doit le rester : l'environnement gagne sur `.env`. C'est
# ce qui permet de restaurer vers une AUTRE base en passant `DATABASE_URL` sur
# la ligne de commande, et c'est écrit dans `CLAUDE.md`.
#
# Ce n'est PAS une réimplémentation de l'analyseur de compose : pas
# d'interpolation `${...}`, pas d'échappements, pas de `export ` en préfixe.
# Seulement le `\r` final et une paire de guillemets encadrants, les deux
# divergences constatées. C'est assez précisément parce que la liste blanche
# ne contient aucun secret : ce qui reste est un chemin, un entier et une cible
# rsync, où une divergence se voit tout de suite au lieu de se taire.

# lire_env <noms séparés par des espaces> [fichier]
lire_env() {
  _lire_env_noms=" $1 "
  _lire_env_fichier="${2:-.env}"
  [ -f "$_lire_env_fichier" ] || return 0
  _lire_env_cr="$(printf '\r')"

  while IFS= read -r _lire_env_ligne || [ -n "$_lire_env_ligne" ]; do
    _lire_env_ligne="${_lire_env_ligne%"$_lire_env_cr"}"
    case "$_lire_env_ligne" in ''|'#'*) continue ;; esac

    _lire_env_nom="${_lire_env_ligne%%=*}"
    # Ligne sans `=` : il n'y a pas d'affectation à lire.
    [ "$_lire_env_nom" != "$_lire_env_ligne" ] || continue

    # La liste blanche est consultée AVANT le moindre `eval`, et c'est ce qui
    # rend l'`eval` d'en bas inoffensif : le nom qu'il voit vient d'ici, pas
    # du fichier. `$_lire_env_nom` est entre guillemets dans le motif, donc
    # comparé littéralement — une ligne `*=…` ne peut pas se faire passer
    # pour toute la liste.
    case "$_lire_env_noms" in *" $_lire_env_nom "*) ;; *) continue ;; esac

    # L'environnement gagne : déjà définie, même à vide, on ne touche pas.
    eval "[ -z \"\${$_lire_env_nom+x}\" ]" || continue

    _lire_env_valeur="${_lire_env_ligne#*=}"
    case "$_lire_env_valeur" in
      '"'*'"') _lire_env_valeur="${_lire_env_valeur#\"}"; _lire_env_valeur="${_lire_env_valeur%\"}" ;;
      "'"*"'") _lire_env_valeur="${_lire_env_valeur#\'}"; _lire_env_valeur="${_lire_env_valeur%\'}" ;;
    esac

    eval "$_lire_env_nom=\$_lire_env_valeur"
    export "$_lire_env_nom"
  done < "$_lire_env_fichier"

  unset _lire_env_noms _lire_env_fichier _lire_env_cr _lire_env_ligne \
        _lire_env_nom _lire_env_valeur
}
