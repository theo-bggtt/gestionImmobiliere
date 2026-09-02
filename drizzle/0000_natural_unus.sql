CREATE TYPE "public"."batiment_type" AS ENUM('principal', 'annexe', 'garage', 'abri');--> statement-breakpoint
CREATE TYPE "public"."zone_type" AS ENUM('interieur', 'exterieur', 'annexe', 'technique');--> statement-breakpoint
CREATE TYPE "public"."type_element_origine" AS ENUM('systeme', 'perso');--> statement-breakpoint
CREATE TYPE "public"."fichier_lien_role" AS ENUM('avant', 'apres', 'plaque', 'general');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('etage', 'situation');--> statement-breakpoint
CREATE TYPE "public"."zone_geom_source" AS ENUM('trace', 'importe');--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"utilisateur_id" integer NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "utilisateur" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"mot_de_passe_hash" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utilisateur_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "batiment" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer NOT NULL,
	"nom" text NOT NULL,
	"type" "batiment_type" DEFAULT 'principal' NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "niveau" (
	"id" serial PRIMARY KEY NOT NULL,
	"batiment_id" integer NOT NULL,
	"nom" text NOT NULL,
	"ordinal" integer NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "propriete" (
	"id" serial PRIMARY KEY NOT NULL,
	"proprietaire_id" integer NOT NULL,
	"nom" text NOT NULL,
	"adresse" text,
	"egid" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "systeme" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer NOT NULL,
	"nom" text NOT NULL,
	"icone" text
);
--> statement-breakpoint
CREATE TABLE "zone" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer NOT NULL,
	"niveau_id" integer,
	"nom" text NOT NULL,
	"parent_id" integer,
	"type" "zone_type" NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "type_element" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer,
	"nom" text NOT NULL,
	"icone" text,
	"origine" "type_element_origine" NOT NULL,
	"champs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alias" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "type_element_origine_propriete_coherente" CHECK (("type_element"."origine" = 'systeme' AND "type_element"."propriete_id" IS NULL) OR ("type_element"."origine" = 'perso' AND "type_element"."propriete_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "element" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer NOT NULL,
	"nom" text NOT NULL,
	"type_id" integer NOT NULL,
	"zone_id" integer NOT NULL,
	"systeme_id" integer,
	"niveau" smallint DEFAULT 3 NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"alias" text[] DEFAULT '{}'::text[] NOT NULL,
	"recherche" "tsvector",
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "element_niveau_valide" CHECK ("element"."niveau" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "fichier" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer NOT NULL,
	"chemin" text NOT NULL,
	"type_mime" text NOT NULL,
	"taille" bigint NOT NULL,
	"date_prise" timestamp with time zone,
	"zone_id" integer,
	"niveau" smallint DEFAULT 3 NOT NULL,
	"legende" text,
	"exif_efface" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fichier_niveau_valide" CHECK ("fichier"."niveau" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "fichier_lien" (
	"id" serial PRIMARY KEY NOT NULL,
	"fichier_id" integer NOT NULL,
	"cible_type" text NOT NULL,
	"cible_id" integer NOT NULL,
	"role" "fichier_lien_role" DEFAULT 'general' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer NOT NULL,
	"type" "plan_type" NOT NULL,
	"niveau_id" integer,
	"nom" text NOT NULL,
	"image_fichier_id" integer,
	"echelle" double precision,
	"ordre" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point" (
	"id" serial PRIMARY KEY NOT NULL,
	"element_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"x" double precision NOT NULL,
	"y" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zone_geom" (
	"zone_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"polygone" jsonb NOT NULL,
	"source" "zone_geom_source" NOT NULL,
	CONSTRAINT "zone_geom_zone_id_plan_id_pk" PRIMARY KEY("zone_id","plan_id")
);
--> statement-breakpoint
CREATE TABLE "evenement" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer NOT NULL,
	"titre" text NOT NULL,
	"date_debut" date NOT NULL,
	"date_fin" date,
	"type" text,
	"niveau" smallint DEFAULT 3 NOT NULL,
	"description" text,
	"cout" numeric(10, 2),
	CONSTRAINT "evenement_niveau_valide" CHECK ("evenement"."niveau" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "evenement_element" (
	"evenement_id" integer NOT NULL,
	"element_id" integer NOT NULL,
	CONSTRAINT "evenement_element_evenement_id_element_id_pk" PRIMARY KEY("evenement_id","element_id")
);
--> statement-breakpoint
CREATE TABLE "evenement_intervenant" (
	"evenement_id" integer NOT NULL,
	"intervenant_id" integer NOT NULL,
	CONSTRAINT "evenement_intervenant_evenement_id_intervenant_id_pk" PRIMARY KEY("evenement_id","intervenant_id")
);
--> statement-breakpoint
CREATE TABLE "garantie" (
	"id" serial PRIMARY KEY NOT NULL,
	"element_id" integer NOT NULL,
	"evenement_id" integer,
	"debut" date NOT NULL,
	"fin" date,
	"reference" text,
	"fichier_id" integer
);
--> statement-breakpoint
CREATE TABLE "intervenant" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer NOT NULL,
	"nom" text NOT NULL,
	"metier" text,
	"tel" text,
	"email" text,
	"niveau" smallint DEFAULT 3 NOT NULL,
	"notes" text,
	CONSTRAINT "intervenant_niveau_valide" CHECK ("intervenant"."niveau" BETWEEN 0 AND 3)
);
--> statement-breakpoint
CREATE TABLE "partage" (
	"id" serial PRIMARY KEY NOT NULL,
	"propriete_id" integer NOT NULL,
	"nom" text NOT NULL,
	"jeton" text NOT NULL,
	"niveau_max" smallint NOT NULL,
	"portee_zones" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"portee_systemes" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"expire_le" timestamp with time zone,
	"revoque_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partage_jeton_unique" UNIQUE("jeton"),
	CONSTRAINT "partage_niveau_max_valide" CHECK ("partage"."niveau_max" BETWEEN 0 AND 3)
);
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_utilisateur_id_utilisateur_id_fk" FOREIGN KEY ("utilisateur_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batiment" ADD CONSTRAINT "batiment_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "niveau" ADD CONSTRAINT "niveau_batiment_id_batiment_id_fk" FOREIGN KEY ("batiment_id") REFERENCES "public"."batiment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propriete" ADD CONSTRAINT "propriete_proprietaire_id_utilisateur_id_fk" FOREIGN KEY ("proprietaire_id") REFERENCES "public"."utilisateur"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "systeme" ADD CONSTRAINT "systeme_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_niveau_id_niveau_id_fk" FOREIGN KEY ("niveau_id") REFERENCES "public"."niveau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "type_element" ADD CONSTRAINT "type_element_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element" ADD CONSTRAINT "element_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element" ADD CONSTRAINT "element_type_id_type_element_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."type_element"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element" ADD CONSTRAINT "element_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "element" ADD CONSTRAINT "element_systeme_id_systeme_id_fk" FOREIGN KEY ("systeme_id") REFERENCES "public"."systeme"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichier" ADD CONSTRAINT "fichier_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichier" ADD CONSTRAINT "fichier_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fichier_lien" ADD CONSTRAINT "fichier_lien_fichier_id_fichier_id_fk" FOREIGN KEY ("fichier_id") REFERENCES "public"."fichier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_niveau_id_niveau_id_fk" FOREIGN KEY ("niveau_id") REFERENCES "public"."niveau"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_image_fichier_id_fichier_id_fk" FOREIGN KEY ("image_fichier_id") REFERENCES "public"."fichier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point" ADD CONSTRAINT "point_element_id_element_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."element"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point" ADD CONSTRAINT "point_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_geom" ADD CONSTRAINT "zone_geom_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_geom" ADD CONSTRAINT "zone_geom_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement" ADD CONSTRAINT "evenement_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement_element" ADD CONSTRAINT "evenement_element_evenement_id_evenement_id_fk" FOREIGN KEY ("evenement_id") REFERENCES "public"."evenement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement_element" ADD CONSTRAINT "evenement_element_element_id_element_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."element"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement_intervenant" ADD CONSTRAINT "evenement_intervenant_evenement_id_evenement_id_fk" FOREIGN KEY ("evenement_id") REFERENCES "public"."evenement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement_intervenant" ADD CONSTRAINT "evenement_intervenant_intervenant_id_intervenant_id_fk" FOREIGN KEY ("intervenant_id") REFERENCES "public"."intervenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garantie" ADD CONSTRAINT "garantie_element_id_element_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."element"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garantie" ADD CONSTRAINT "garantie_evenement_id_evenement_id_fk" FOREIGN KEY ("evenement_id") REFERENCES "public"."evenement"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garantie" ADD CONSTRAINT "garantie_fichier_id_fichier_id_fk" FOREIGN KEY ("fichier_id") REFERENCES "public"."fichier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervenant" ADD CONSTRAINT "intervenant_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partage" ADD CONSTRAINT "partage_propriete_id_propriete_id_fk" FOREIGN KEY ("propriete_id") REFERENCES "public"."propriete"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_batiment_propriete" ON "batiment" USING btree ("propriete_id");--> statement-breakpoint
CREATE INDEX "idx_niveau_batiment" ON "niveau" USING btree ("batiment_id");--> statement-breakpoint
CREATE INDEX "idx_propriete_proprietaire" ON "propriete" USING btree ("proprietaire_id");--> statement-breakpoint
CREATE INDEX "idx_systeme_propriete" ON "systeme" USING btree ("propriete_id");--> statement-breakpoint
CREATE INDEX "idx_zone_propriete" ON "zone" USING btree ("propriete_id");--> statement-breakpoint
CREATE INDEX "idx_zone_niveau" ON "zone" USING btree ("niveau_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_type_element_nom_systeme_unique" ON "type_element" USING btree ("nom") WHERE "type_element"."origine" = 'systeme';--> statement-breakpoint
CREATE INDEX "idx_element_propriete" ON "element" USING btree ("propriete_id");--> statement-breakpoint
CREATE INDEX "idx_element_zone_id" ON "element" USING btree ("zone_id");--> statement-breakpoint
CREATE INDEX "idx_element_niveau" ON "element" USING btree ("niveau");--> statement-breakpoint
CREATE INDEX "idx_element_type" ON "element" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "idx_element_recherche" ON "element" USING gin ("recherche");--> statement-breakpoint
CREATE INDEX "idx_element_details" ON "element" USING gin ("details");