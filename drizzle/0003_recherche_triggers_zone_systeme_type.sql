-- Custom SQL migration file, put your code below! --

-- drizzle/0003_recherche_triggers_zone_systeme_type.sql
--
-- maj_recherche_element (Task 3) recalcule element.recherche à partir du nom
-- de zone/système et de l'alias du type au moment de l'INSERT/UPDATE de
-- l'élément lui-même. Mais renommer une zone/un système, ou changer les
-- alias d'un type_element, ne touche pas la ligne element : recherche reste
-- périmée jusqu'à la prochaine modification de l'élément. Ces trois
-- déclencheurs AFTER UPDATE recalculent recherche pour les éléments
-- concernés en forçant un UPDATE no-op (SET recherche = recherche), qui
-- refait passer chaque ligne par maj_recherche_element sans dupliquer sa
-- logique de concaténation.

CREATE OR REPLACE FUNCTION maj_recherche_par_zone() RETURNS trigger AS $$
BEGIN
  UPDATE element SET recherche = recherche WHERE zone_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maj_recherche_par_zone ON zone;

CREATE TRIGGER trg_maj_recherche_par_zone
  AFTER UPDATE ON zone
  FOR EACH ROW
  WHEN (OLD.nom IS DISTINCT FROM NEW.nom)
  EXECUTE FUNCTION maj_recherche_par_zone();

CREATE OR REPLACE FUNCTION maj_recherche_par_systeme() RETURNS trigger AS $$
BEGIN
  UPDATE element SET recherche = recherche WHERE systeme_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maj_recherche_par_systeme ON systeme;

CREATE TRIGGER trg_maj_recherche_par_systeme
  AFTER UPDATE ON systeme
  FOR EACH ROW
  WHEN (OLD.nom IS DISTINCT FROM NEW.nom)
  EXECUTE FUNCTION maj_recherche_par_systeme();

CREATE OR REPLACE FUNCTION maj_recherche_par_type() RETURNS trigger AS $$
BEGIN
  UPDATE element SET recherche = recherche WHERE type_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maj_recherche_par_type ON type_element;

CREATE TRIGGER trg_maj_recherche_par_type
  AFTER UPDATE ON type_element
  FOR EACH ROW
  WHEN (OLD.nom IS DISTINCT FROM NEW.nom OR OLD.alias IS DISTINCT FROM NEW.alias)
  EXECUTE FUNCTION maj_recherche_par_type();