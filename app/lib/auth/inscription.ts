// app/lib/auth/inscription.ts
// Neutre — aucun import serveur — parce que l'écran d'inscription rend ce
// message, et qu'un composant qui importe un module `.server` emporte ce
// module dans le bundle (même règle que `app/lib/forms/types.ts`).

/**
 * Le même message quel que soit le motif : une adresse déjà prise et une
 * porte fermée se répondent pareil, pour ne pas dire au visiteur si
 * l'adresse existe (même raisonnement que la règle #4 : ne jamais distinguer
 * « n'existe pas » de « pas à vous »).
 */
export const MESSAGE_INSCRIPTION_FERMEE = "Les inscriptions sont fermées.";
