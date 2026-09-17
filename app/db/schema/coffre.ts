// app/db/schema/coffre.ts
// Le coffre : des valeurs courtes (un code de portail, une combinaison, le mot
// de passe d'un routeur, l'emplacement d'une clé) chiffrées PAR LE NAVIGATEUR
// avec une phrase que le serveur ne reçoit jamais. Ce qui est stocké ici est
// du bruit pour nous, pour l'hébergeur et pour qui vole un dump. C'est ce qui
// permet à la règle #9 du plan de passer de « aucun secret dans l'app » à
// « aucun secret EN CLAIR » — voir `.decisions/note-2026-09-17-chiffrement.md`.
//
// POURQUOI UNE TABLE ET PAS UN GENRE DE CHAMP. La réponse facile aurait été un
// septième genre dans `CHAMP_GENRES`, « secret », et deux choses l'interdisent.
// La règle #6 d'abord : les genres sont une liste fermée de six, et le jour où
// elle enfle on n'écrit plus une app de maison. Et surtout le POIDS D du
// trigger `maj_recherche_element` (migration 0005), qui indexe TOUTES les
// valeurs de `details` dans `element.recherche` sans regarder `niveauMin` —
// c'est déjà la raison du `ts_filter` que subit un lien de partage
// (`porteeRestreinte`). Un secret rangé dans `details`, même chiffré,
// entrerait dans le vecteur de recherche : son bloc base64url y serait
// découpé en lexèmes, servi aux requêtes, et un jour un lecteur du vecteur ou
// une évolution du trigger en ferait quelque chose. Il n'a rien à y faire, et
// le seul moyen sûr qu'il n'y entre JAMAIS est qu'il ne soit pas dans
// `details`. D'où une table, hors de tout ce que le trigger lit, hors des
// facettes, hors de `champsVisibles`, et qu'aucune requête de partage ne joint
// (`tests/coffre/partage-statique.test.ts` l'interdit au texte).
import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { propriete } from "./core";
import { element } from "./elements";

export const coffre = pgTable("coffre", {
  // Un coffre par propriété, et c'est la clé primaire qui le dit.
  proprieteId: integer("propriete_id").primaryKey().references(() => propriete.id, { onDelete: "cascade" }),
  // Paramètres de dérivation (PBKDF2-SHA256), stockés et relus à l'ouverture :
  // le nombre d'itérations de production peut monter sans deviner lequel a
  // servi à un coffre existant. Le sel est en base64url, 16 octets.
  sel: text("sel").notNull(),
  iterations: integer("iterations").notNull(),
  // La MÊME clé de données (256 bits, aléatoire), enveloppée deux fois : par
  // la clé dérivée de la phrase, et par celle dérivée de la clé de secours
  // affichée une seule fois à la création. Changer la phrase réécrit la
  // première enveloppe et rien d'autre ; la phrase oubliée s'ouvre par la
  // seconde. Les deux perdues, le coffre se vide et se ressaisit — il n'y a
  // rien ici qui permette au serveur de rouvrir, et c'est le point.
  cleParPhrase: text("cle_par_phrase").notNull(),
  cleParSecours: text("cle_par_secours").notNull(),
  // Pas de bloc de vérification (une constante chiffrée pour dire « mauvaise
  // phrase ») : une mauvaise phrase échoue déjà au désenveloppement, sur
  // l'étiquette GCM, sans toucher à un secret. Un bloc de plus serait une
  // seconde façon de dire la même chose.
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
});

export const secret = pgTable("secret", {
  id: serial("id").primaryKey(),
  // NOT NULL et pas de `propriete_id` : comme `garantie`, un secret est la
  // propriété d'un objet (le portail, la centrale, la porte) et rejoint la
  // propriété par lui. C'est voulu — une seconde colonne d'appartenance
  // pourrait diverger de la première.
  elementId: integer("element_id").notNull().references(() => element.id, { onDelete: "cascade" }),
  // En clair : « Code du portail » dit qu'un code existe, et c'est l'écran du
  // propriétaire, servi à personne d'autre.
  libelle: text("libelle").notNull(),
  // Un bloc chiffré par la clé de données, produit dans le navigateur :
  // version, nonce, texte chiffré et étiquette, en base64url. Le format est
  // celui de `app/lib/coffre/chiffrement.ts`. Le serveur en vérifie la FORME
  // et ne peut rien vérifier d'autre.
  valeur: text("valeur").notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  modifieLe: timestamp("modifie_le", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Le sens de lecture est « les secrets de cet objet », depuis sa fiche.
  elementIdx: index("idx_secret_element").on(table.elementId),
}));
