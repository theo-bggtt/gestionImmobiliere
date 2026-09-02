-- Custom SQL migration file, put your code below! --

-- drizzle/0002_recherche_trigger.sql
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

  NEW.recherche := to_tsvector('french', concat_ws(' ',
    NEW.nom,
    array_to_string(NEW.alias, ' '),
    v_type_nom,
    v_type_alias,
    v_zone_nom,
    v_systeme_nom,
    v_details_texte
  ));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maj_recherche_element ON element;

CREATE TRIGGER trg_maj_recherche_element
  BEFORE INSERT OR UPDATE ON element
  FOR EACH ROW EXECUTE FUNCTION maj_recherche_element();
