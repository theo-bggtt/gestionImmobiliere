// app/lib/partage/document.ts
// Ce qu'une page de partage change au document lui-même. Écrit une seule
// fois : trois routes servent le lien, et une seule d'entre elles qui
// oublierait l'en-tête suffirait à mettre le jeton dans un cache ou dans un
// index de moteur de recherche.

/**
 * Marqueur lu par `root.tsx`. Une route qui le porte est servie en HTML seul,
 * sans `<Scripts />` : un visiteur venu d'un lien ne télécharge pas
 * l'application, ne l'installe pas et ne met rien en cache (règle non
 * négociable #7 de l'étape 3). Corollaire assumé : sur ces pages, la
 * recherche est un formulaire GET et les facettes des liens.
 */
export const HANDLE_SANS_SCRIPTS = { sansScripts: true } as const;

export const documentSansScripts = (matches: Array<{ handle?: unknown }>) =>
  matches.some((m) => (m.handle as { sansScripts?: boolean } | undefined)?.sansScripts === true);

/**
 * Un lien de partage se révoque : rien ne doit survivre dans un cache
 * partagé. `no-referrer` empêche le jeton de partir dans l'en-tête `Referer`
 * si la page venait un jour à porter un lien sortant, et `noindex` qu'un lien
 * collé dans un espace public finisse dans un moteur de recherche.
 */
export const ENTETES_PARTAGE = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

export const META_PARTAGE = [{ name: "robots", content: "noindex, nofollow" }];
