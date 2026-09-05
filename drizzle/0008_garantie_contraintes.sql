-- Étape 5, PR 2 : la table `garantie` sort de son sommeil.
--
-- Elle existe depuis la migration 0000 et n'était utilisée nulle part. Deux
-- choses lui manquaient avant qu'un écran l'alimente :
--
-- L'INDEX suit le seul sens de lecture qui existe — « les garanties de cet
-- objet ». La fiche les demande, jamais l'inverse.
--
-- LE CHECK va en base et non dans le formulaire, même raisonnement que
-- `point_x_valide` : une garantie qui finit avant de commencer est une erreur
-- qu'aucune route ne doit pouvoir écrire. `fin` reste nullable, parce que
-- « sans terme connu » est le cas courant quand on reprend un classeur, et que
-- ce n'est pas la même chose qu'expirée.
--
-- La table est vide aujourd'hui, mais le CHECK est écrit pour ne pas dépendre
-- de ça : `fin IS NULL OR fin >= debut` accepte les lignes sans terme, donc il
-- passerait aussi sur une table déjà remplie.

CREATE INDEX "idx_garantie_element" ON "garantie" USING btree ("element_id");--> statement-breakpoint
ALTER TABLE "garantie" ADD CONSTRAINT "garantie_fin_apres_debut" CHECK ("garantie"."fin" IS NULL OR "garantie"."fin" >= "garantie"."debut");
