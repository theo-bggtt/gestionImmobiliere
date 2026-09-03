ALTER TABLE "fichier" ADD COLUMN "capture_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_fichier_capture_id" ON "fichier" USING btree ("capture_id");--> statement-breakpoint
CREATE INDEX "idx_fichier_lien_cible" ON "fichier_lien" USING btree ("cible_type","cible_id");