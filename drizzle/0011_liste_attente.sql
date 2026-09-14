-- Liste d'attente de la vitrine. Une adresse, une date, rien d'autre :
-- pas d'IP, pas de `User-Agent`, pas de champ libre, pas de provenance.
--
-- `UNIQUE(email)` est ce qui rend l'insertion idempotente sans qu'on ait
-- jamais à DIRE si la ligne existait : un `ON CONFLICT DO NOTHING` suffit, et
-- l'application n'en lit pas le résultat. « Vous êtes déjà inscrit » serait un
-- oracle sur l'appartenance à cette liste, même famille que « filtré = 404,
-- jamais 403 ».
--
-- Première table du schéma qui porte des données de gens qui ne sont pas le
-- propriétaire : un `pg_dump` en contient désormais.
CREATE TABLE "interesse" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interesse_email_unique" UNIQUE("email")
);
