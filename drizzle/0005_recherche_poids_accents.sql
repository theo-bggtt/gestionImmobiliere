-- Custom SQL migration file, put your code below! --

-- drizzle/0005_recherche_poids_accents.sql
--
-- L'étape 2 (« retrouver ») a buté sur deux limites du déclencheur livré à
-- l'étape 0, mesurées avant d'écrire la moindre requête :
--
-- 1. La configuration `french` stemme les pluriels mais NE DÉPOUILLE PAS les
--    accents : to_tsvector('french','Éclairage') donne 'éclairag' quand
--    plainto_tsquery('french','eclairage') donne 'eclairag'. Taper sans
--    accent, ce que fait tout le monde sur un clavier de téléphone, ne
--    remontait donc rien. On copie `french` en y insérant le dictionnaire
--    `unaccent` en tête de chaîne.
--
-- 2. `element.recherche` concaténait nom, alias, type, zone, système et
--    détails dans un tsvector SANS POIDS. ts_rank ne pouvait alors pas
--    distinguer une correspondance sur le nom d'une correspondance sur les
--    détails : à fréquence égale, les deux rendaient exactement le même
--    rang. Les quatre poids de PostgreSQL portent désormais la hiérarchie :
--      A = nom de la fiche
--      B = alias de la fiche, nom et alias du type
--      C = nom de la zone, nom du système
--      D = valeurs des détails
--    ts_rank les pondère par défaut {D,C,B,A} = {0.1, 0.2, 0.4, 1.0}.
--
-- L'opérateur @@ ignore les poids, donc les requêtes existantes qui testent
-- seulement l'appartenance ne changent pas de résultat.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- CREATE TEXT SEARCH CONFIGURATION n'a pas de forme IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'french_sans_accent') THEN
    CREATE TEXT SEARCH CONFIGURATION french_sans_accent (COPY = french);
    ALTER TEXT SEARCH CONFIGURATION french_sans_accent
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION maj_recherche_element() RETURNS trigger AS $$
DECLARE
  v_type_nom text;
  v_type_alias text;
  v_zone_nom text;
  v_systeme_nom text;
  v_details_texte text;
BEGIN
  SELECT nom, array_to_string(alias, ' ') INTO v_type_nom, v_type_alias
    FROM type_element WHERE id = NEW.type_id;

  SELECT nom INTO v_zone_nom FROM zone WHERE id = NEW.zone_id;

  IF NEW.systeme_id IS NOT NULL THEN
    SELECT nom INTO v_systeme_nom FROM systeme WHERE id = NEW.systeme_id;
  END IF;

  SELECT string_agg(value, ' ') INTO v_details_texte
    FROM jsonb_each_text(NEW.details);

  NEW.recherche :=
       setweight(to_tsvector('french_sans_accent', coalesce(NEW.nom, '')), 'A')
    || setweight(to_tsvector('french_sans_accent', concat_ws(' ',
         array_to_string(NEW.alias, ' '), v_type_nom, v_type_alias)), 'B')
    || setweight(to_tsvector('french_sans_accent', concat_ws(' ',
         v_zone_nom, v_systeme_nom)), 'C')
    || setweight(to_tsvector('french_sans_accent', coalesce(v_details_texte, '')), 'D');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recalcul des lignes déjà en base : le no-op repasse chaque ligne par le
-- déclencheur BEFORE UPDATE, même mécanique qu'en 0003.
UPDATE element SET recherche = recherche;
