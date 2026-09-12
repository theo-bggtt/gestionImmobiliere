-- Issue #34 : le catalogue suggère un niveau de visibilité par type.
--
-- `element.niveau` est ce que le plafond d'un partage compare, et aucun écran
-- ne le posait : toute propriété saisie à la main restait entièrement en 3
-- (privé), donc un lien « usage » n'y montrait rien. Le niveau se saisit
-- maintenant sur la fiche, et le type en propose un — c'est le type qui rend
-- un objet technique, pas la zone (la portée d'un partage filtre déjà par
-- zone, et un tableau électrique dans une cuisine doit rester masquable).
--
-- DEFAULT 3 et non 1 : le côté fermé. La colonne est ajoutée sur un catalogue
-- déjà chargé, et le re-seed écrit les 33 valeurs réelles (`seed-catalogue.ts`
-- rafraîchit `niveau_suggere` comme `alias` — du vocabulaire de catalogue,
-- que le propriétaire ne peut pas corriger sur un type système). Entre les
-- deux, une suggestion trop fermée ne fait que reproduire l'état d'avant.
--
-- Le CHECK va en base, comme tous les autres `niveau` (décision #8) : une
-- suggestion hors bornes serait recopiée telle quelle dans `element.niveau`
-- par la capture, qui ne demande rien et ne peut donc rien refuser à l'écran.

ALTER TABLE "type_element" ADD COLUMN "niveau_suggere" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "type_element" ADD CONSTRAINT "type_element_niveau_suggere_valide" CHECK ("type_element"."niveau_suggere" BETWEEN 0 AND 3);