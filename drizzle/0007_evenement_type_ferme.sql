-- Étape 5 : `evenement.type` passe du texte libre à une liste fermée.
--
-- Le schéma de l'étape 0 laissait cette colonne en `text`, faute de liste
-- fournie par la spécification. C'est `plan.nom` à nouveau : du texte libre
-- rendu sur une page de partage, où le propriétaire écrit ce qu'il veut, y
-- compris l'adresse. Fermer la liste supprime la fuite au lieu de la
-- documenter, et rend la chronologie groupable par la même occasion.
--
-- L'ORDRE DES ORDRES COMPTE, et la génération de drizzle ne le donne pas :
-- poser le défaut avant la conversion demande à PostgreSQL de coercer une
-- valeur d'énumération dans une colonne encore `text`, et poser NOT NULL sans
-- avoir comblé les nuls échoue dès qu'une ligne existe. La table est vide
-- aujourd'hui (aucun écran ne l'alimente avant cette étape), mais une
-- migration qui ne marche que sur une table vide est une mine.

CREATE TYPE "public"."evenement_type" AS ENUM('installation', 'reparation', 'entretien', 'controle', 'renovation', 'sinistre', 'autre');--> statement-breakpoint

-- Comble les nuls et tout ce qui ne tomberait pas dans la liste : la
-- conversion doit être totale, sinon elle échoue sur une seule ligne.
UPDATE "evenement"
SET "type" = 'autre'
WHERE "type" IS NULL
   OR "type" NOT IN ('installation', 'reparation', 'entretien', 'controle', 'renovation', 'sinistre', 'autre');--> statement-breakpoint

ALTER TABLE "evenement" ALTER COLUMN "type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "evenement" ALTER COLUMN "type" SET DATA TYPE "public"."evenement_type" USING "type"::"public"."evenement_type";--> statement-breakpoint
ALTER TABLE "evenement" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "evenement" ALTER COLUMN "type" SET DEFAULT 'autre';--> statement-breakpoint

CREATE INDEX "idx_evenement_propriete" ON "evenement" USING btree ("propriete_id");--> statement-breakpoint
CREATE INDEX "idx_evenement_chronologie" ON "evenement" USING btree ("propriete_id","date_debut");--> statement-breakpoint
CREATE INDEX "idx_evenement_element_element" ON "evenement_element" USING btree ("element_id");--> statement-breakpoint
CREATE INDEX "idx_evenement_intervenant_intervenant" ON "evenement_intervenant" USING btree ("intervenant_id");--> statement-breakpoint
CREATE INDEX "idx_intervenant_propriete" ON "intervenant" USING btree ("propriete_id");
