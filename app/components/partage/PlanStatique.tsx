// app/components/partage/PlanStatique.tsx
// Le plan tel qu'un porteur de lien le voit : une image et des ancres
// positionnées en pourcentage. Pas de zoom, pas de regroupement, pas de
// survol — la page de partage ne charge aucun JavaScript (règle non
// négociable #7 de l'étape 3), et c'est le prix qu'on paie ici sans discuter.
//
// Ce composant ne filtre rien : il affiche ce que le loader lui donne, et le
// loader ne lui donne que ce qui passe la portée. Un objet masqué n'a ni
// point, ni pastille comptée, ni ligne dans une liste.
import type { PlanAffiche } from "../../lib/partage/contenu.server";
import type { PlanEtiquete } from "../../lib/plans/types";
import type { Liens } from "../recherche/liens";

export function PlanStatique({
  plan,
  plans,
  liens,
}: {
  plan: PlanAffiche;
  plans: PlanEtiquete[];
  liens: Liens;
}) {
  return (
    <section className="plan-bloc">
      <h2 className="plan-titre">Plan</h2>

      {/* Le sélecteur est une liste de liens : chaque plan a son URL, la page
          se recharge entière, et rien de tout ça ne demande de script. */}
      {plans.length > 1 && (
        <nav className="plan-niveaux" aria-label="Choisir un plan">
          {plans.map((p) => (
            <a
              key={p.id}
              href={liens.plan(p.id)}
              className={p.id === plan.id ? "plan-niveau plan-niveau-actif" : "plan-niveau"}
              aria-current={p.id === plan.id ? "page" : undefined}
            >
              {p.etiquette}
            </a>
          ))}
        </nav>
      )}

      {plan.imageFichierId === null ? (
        <p className="resultats-vide">Ce plan n'a pas encore d'image.</p>
      ) : (
        <div className="plan-cadre">
          <img className="plan-image" src={liens.image(plan.imageFichierId, "pleine")} alt={`Plan ${plan.etiquette}`} />

          {/* `zone_geom` n'est alimentée par aucun écran avant l'étape 6 : ce
              calque est vide aujourd'hui. Les polygones servis sont déjà
              filtrés — une zone hors portée n'a pas de contour. */}
          {plan.polygones.length > 0 && (
            <svg className="plan-geom" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {plan.polygones.map((g) => (
                <polygon key={g.zoneId} points={g.sommets.map((s) => `${s.x},${s.y}`).join(" ")} />
              ))}
            </svg>
          )}

          {/* Une pastille numérotée plutôt qu'une étiquette : sans script il
              n'y a ni regroupement ni survol, et deux noms posés au même
              endroit se recouvriraient sans qu'on puisse les départager. La
              légende sous le plan donne la correspondance, et elle reste
              lisible même quand deux points se touchent. */}
          {plan.points.map((pt, rang) => (
            <a
              key={pt.id}
              className="plan-numero"
              style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
              href={liens.fiche(pt.elementId)}
              aria-label={pt.nom}
            >
              {rang + 1}
            </a>
          ))}
        </div>
      )}

      {plan.points.length === 0 ? (
        plan.imageFichierId !== null && <p className="resultats-vide">Aucun objet repéré sur ce plan.</p>
      ) : (
        <ol className="plan-legende">
          {plan.points.map((pt) => (
            <li key={pt.id}>
              <a href={liens.fiche(pt.elementId)}>{pt.nom}</a>
              <span className="selecteur-secondaire"> · {pt.zoneNom}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
