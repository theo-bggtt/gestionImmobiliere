CREATE INDEX "idx_plan_propriete" ON "plan" USING btree ("propriete_id");--> statement-breakpoint
CREATE INDEX "idx_plan_niveau" ON "plan" USING btree ("niveau_id");--> statement-breakpoint
CREATE INDEX "idx_point_plan" ON "point" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "idx_point_element" ON "point" USING btree ("element_id");--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_type_niveau_coherent" CHECK (("plan"."type" = 'etage' AND "plan"."niveau_id" IS NOT NULL)
      OR ("plan"."type" = 'situation' AND "plan"."niveau_id" IS NULL));--> statement-breakpoint
ALTER TABLE "point" ADD CONSTRAINT "point_x_valide" CHECK ("point"."x" BETWEEN 0 AND 100);--> statement-breakpoint
ALTER TABLE "point" ADD CONSTRAINT "point_y_valide" CHECK ("point"."y" BETWEEN 0 AND 100);