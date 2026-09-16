-- L'invitation à créer un compte. Elle remplace `AUTORISER_INSCRIPTION` et
-- son plafond dur (décision #130, issue #26) : ceux-là bornaient un mécanisme
-- sans état, d'où le plafond en code contre la variable oubliée dans `.env`.
-- Une invitation porte son propre état, donc elle se borne toute seule.
--
-- `UNIQUE(jeton)` fait plus que dédoublonner : c'est par lui que la
-- consommation est atomique. L'inscription marque la ligne par un
-- `UPDATE ... WHERE utilisee_le IS NULL AND revoque_le IS NULL AND
-- expire_le > now()` et lit le nombre de lignes touchées — deux inscriptions
-- simultanées sur le même jeton ne peuvent donc pas passer toutes les deux,
-- sans que rien n'ait à verrouiller la table.
--
-- Les trois horodatages sont datés et jamais supprimés, comme
-- `partage.revoque_le` : la trace de qui on a laissé entrer est le point.

CREATE TABLE "invitation" (
	"id" serial PRIMARY KEY NOT NULL,
	"jeton" text NOT NULL,
	"invite_par_id" integer NOT NULL,
	"note" text,
	"expire_le" timestamp with time zone NOT NULL,
	"utilisee_le" timestamp with time zone,
	"utilisee_par_id" integer,
	"revoque_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_jeton_unique" UNIQUE("jeton")
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invite_par_id_utilisateur_id_fk" FOREIGN KEY ("invite_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_utilisee_par_id_utilisateur_id_fk" FOREIGN KEY ("utilisee_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invitation_invite_par" ON "invitation" USING btree ("invite_par_id");
