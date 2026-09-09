// server/limiteur.js
// Limite de débit à fenêtre fixe, en mémoire, sans dépendance. Une fonction
// pure du temps qu'on lui injecte, testée sans HTTP — sur le modèle de
// `regroupement.ts` et `geometrie.ts` : la seule partie de la protection qui
// décide quelque chose vit ici, le middleware Express ne fait que traduire
// son verdict en 429.
//
// Pourquoi pas `express-rate-limit` : il ferait exactement ceci (un Map en
// mémoire par défaut) pour une dépendance de plus, et son magasin mémoire
// n'est pas plus juste qu'un compteur par fenêtre. Ce qui compte pour un
// Raspberry Pi exposé n'est pas la finesse du lissage, c'est qu'un client ne
// puisse pas le tenir occupé, et qu'un processus unique n'ait pas besoin
// d'un magasin partagé.

/**
 * @typedef {object} Verdict
 * @property {boolean} autorise   la requête passe
 * @property {number}  restant    ce qui reste dans la fenêtre courante
 * @property {number}  reessaiDansMs  temps avant que la fenêtre se rouvre
 */

/**
 * @param {object} options
 * @param {number} options.fenetreMs  durée d'une fenêtre
 * @param {number} options.maximum    requêtes autorisées par clé et par fenêtre
 * @param {number} [options.clesMax]  borne du nombre de clés gardées en mémoire
 * @param {() => number} [options.maintenant]  horloge injectable (tests)
 */
export function creerLimiteur({ fenetreMs, maximum, clesMax = 10_000, maintenant = Date.now }) {
  if (!(fenetreMs > 0) || !(maximum > 0)) throw new Error("fenetreMs et maximum doivent être positifs.");

  /** @type {Map<string, { debut: number, nombre: number }>} */
  const compteurs = new Map();
  let dernierePurge = 0;

  // Les fenêtres closes ne servent plus à rien : on les balaye une fois par
  // fenêtre, pas à chaque requête, pour que le coût reste constant.
  function purger(t) {
    for (const [cle, c] of compteurs) {
      if (t - c.debut >= fenetreMs) compteurs.delete(cle);
    }
  }

  return {
    /** @param {string} cle @returns {Verdict} */
    consommer(cle) {
      const t = maintenant();
      if (t - dernierePurge >= fenetreMs) {
        purger(t);
        dernierePurge = t;
      }

      let c = compteurs.get(cle);
      if (!c || t - c.debut >= fenetreMs) {
        // Supprimer puis réinsérer place la clé en fin de Map : l'ordre
        // d'insertion devient l'ordre des fenêtres, et c'est ce que la borne
        // ci-dessous exploite pour éliminer les plus anciennes d'abord.
        compteurs.delete(cle);
        c = { debut: t, nombre: 0 };
        compteurs.set(cle, c);
      }
      c.nombre += 1;

      // Un balayage depuis des milliers d'adresses ne doit pas remplir la
      // mémoire du Pi : au-delà de la borne, les fenêtres les plus anciennes
      // partent. Elles se rouvrent si leur adresse revient — c'est une perte
      // de mémoire du limiteur, pas une ouverture : la fenêtre repart à zéro
      // pour un client qui n'avait de toute façon plus de compteur récent.
      while (compteurs.size > clesMax) {
        const plusAncienne = compteurs.keys().next().value;
        if (plusAncienne === cle) break;
        compteurs.delete(plusAncienne);
      }

      return {
        autorise: c.nombre <= maximum,
        restant: Math.max(0, maximum - c.nombre),
        reessaiDansMs: c.debut + fenetreMs - t,
      };
    },

    /** Nombre de clés en mémoire — pour les tests de la borne. */
    taille() {
      return compteurs.size;
    },
  };
}
