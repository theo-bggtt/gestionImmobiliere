-- Étape 6 : `zone_geom` sort de son sommeil.
--
-- Elle existe depuis la migration 0000 et n'était alimentée par aucun écran.
-- Deux choses lui manquaient avant qu'un éditeur de tracé l'écrive.
--
-- L'INDEX suit le seul sens de lecture qui existe — « les contours de ce
-- plan » (`chargerPolygonesDuPlan`). La clé primaire `(zone_id, plan_id)` ne
-- le sert pas : `zone_id` en est la colonne de tête.
--
-- LE CHECK va en base et non dans le formulaire, même raisonnement que
-- `point_x_valide` : une route qui oublierait de valider écrirait sinon un
-- contour hors de l'image. Et il pèse plus lourd ici que sur un point — un
-- contour hors bornes n'est pas seulement invisible, il sert à DÉDUIRE la zone
-- d'un objet, donc à proposer d'écrire `element.zone_id`, la colonne qui
-- décide de ce qu'un lien de partage montre (règle non négociable #1).
--
-- Il passe par une FONCTION IMMUTABLE parce que valider les éléments d'un
-- tableau jsonb demande une sous-requête, que PostgreSQL interdit dans un
-- CHECK : la contrainte devient alors un simple appel de fonction, ce que
-- CHECK autorise. Même forme exactement que `champs_valides` (migration 0001).
--
-- `jsonb_path_exists` plutôt qu'un cast `(s->>'x')::numeric` : sur une valeur
-- textuelle le cast LÈVE, et l'ordre d'évaluation des `AND` d'un `WHERE` n'est
-- pas garanti — un garde placé avant ne protégerait donc pas du cast placé
-- après.
--
-- Les chemins sont en mode `strict`, et ce mot est LA correction qui compte.
-- Le mode `lax`, celui par défaut, DÉROULE les tableaux avant d'appliquer le
-- filtre : `{"x": [5, 700]}` y passait, parce que 5 satisfait le prédicat et
-- suffit à faire exister un résultat — 700 étant hors de [0,100], et `x`
-- n'étant même pas un nombre. `strict` refuse de dérouler, donc `@.type()`
-- voit bien un tableau et rend faux. Les deux modes ont été comparés en base
-- sur la famille tableau ; les sommets légitimes passent à l'identique.
--
-- La table est vide aujourd'hui, mais rien ici n'en dépend : la contrainte est
-- validée à l'ajout et passerait aussi bien sur une table déjà remplie.

CREATE INDEX "idx_zone_geom_plan" ON "zone_geom" USING btree ("plan_id");--> statement-breakpoint
CREATE FUNCTION contour_valide(polygone jsonb) RETURNS boolean AS $$
  -- `jsonb_typeof` garde `jsonb_array_length`, qui lève sur un scalaire. Ce
  -- n'est pas en contradiction avec le commentaire ci-dessus : ce qui n'est
  -- pas garanti, c'est l'ordre des `AND` d'un `WHERE` entre plusieurs lignes
  -- lues ; à l'intérieur d'une expression booléenne unique, PostgreSQL évalue
  -- de gauche à droite et court-circuite.
  SELECT jsonb_typeof(polygone) = 'array'
     AND jsonb_array_length(polygone) BETWEEN 3 AND 40
     -- Compter les sommets valides et exiger l'égalité : un seul sommet
     -- fautif change le compte, sans qu'aucune expression n'ait à être niée.
     AND jsonb_array_length(polygone) = (
           SELECT count(*)
           FROM jsonb_array_elements(polygone) AS s
           WHERE jsonb_path_exists(s, 'strict $.x ? (@.type() == "number" && @ >= 0 && @ <= 100)')
             AND jsonb_path_exists(s, 'strict $.y ? (@.type() == "number" && @ >= 0 && @ <= 100)')
         );
$$ LANGUAGE sql IMMUTABLE;--> statement-breakpoint
ALTER TABLE "zone_geom"
  ADD CONSTRAINT "zone_geom_contour_valide" CHECK (contour_valide("zone_geom"."polygone"));
