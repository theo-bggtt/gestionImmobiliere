-- drizzle/0014_partage_intervenant.sql
--
-- Un lien de partage peut désormais nommer la personne à qui il a été donné.
-- Ça n'ouvre rien : `partage.intervenant_id` ne sort d'aucune requête de
-- `/p/:jeton` et n'entre dans aucune `Portee`. Ce que ça permet, c'est de
-- retrouver le lien du plombier depuis sa fiche du carnet, donc de le
-- MODIFIER plutôt que de le révoquer et d'en recréer un — c'est-à-dire de
-- garder le lien qu'il a déjà dans sa poche.
--
-- Nullable : un lien peut viser un voisin de passage, et le carnet n'a pas à
-- se remplir pour partager.
--
-- `ON DELETE SET NULL`, jamais CASCADE : retirer quelqu'un du carnet ne doit
-- pas effacer la trace de ce qui lui a été ouvert. Même raisonnement que
-- `revoque_le`, daté et jamais supprimé.

ALTER TABLE "partage" ADD COLUMN "intervenant_id" integer;--> statement-breakpoint
ALTER TABLE "partage" ADD CONSTRAINT "partage_intervenant_id_intervenant_id_fk" FOREIGN KEY ("intervenant_id") REFERENCES "public"."intervenant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_partage_intervenant" ON "partage" USING btree ("intervenant_id");
