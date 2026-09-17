-- drizzle/0015_coffre.sql
--
-- Le coffre : deux tables, et aucune des deux n'est lue par une requête de
-- partage ni par le trigger de recherche. Voir l'en-tête de
-- `app/db/schema/coffre.ts` pour la raison d'une table plutôt que d'un genre
-- de champ (le poids D de `maj_recherche_element` indexe tout `details`).
--
-- `coffre.propriete_id` est la clé primaire : un coffre par propriété. Les
-- deux colonnes `cle_par_*` portent la même clé de données enveloppée deux
-- fois, par la phrase et par la clé de secours ; le sel et les itérations
-- sont stockés pour pouvoir monter le coût de dérivation plus tard.
--
-- `secret.element_id` NOT NULL, ON DELETE CASCADE, et pas de `propriete_id` :
-- un secret rejoint la propriété par son objet, comme une garantie. La valeur
-- est un bloc chiffré par le navigateur (version, nonce, corps, en base64url),
-- en `text` — du bruit dans un dump, et rien que le serveur sache ouvrir.

CREATE TABLE "coffre" (
	"propriete_id" integer PRIMARY KEY NOT NULL,
	"sel" text NOT NULL,
	"iterations" integer NOT NULL,
	"cle_par_phrase" text NOT NULL,
	"cle_par_secours" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret" (
	"id" serial PRIMARY KEY NOT NULL,
	"element_id" integer NOT NULL,
	"libelle" text NOT NULL,
	"valeur" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"modifie_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coffre" ADD CONSTRAINT "coffre_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret" ADD CONSTRAINT "secret_element_id_element_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."element"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_secret_element" ON "secret" USING btree ("element_id");