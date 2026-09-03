// app/components/partage/PagePartage.tsx
// LE composant de la page de partage. La route `/p/:jeton` le rend, et
// l'écran de prévisualisation du propriétaire rend le même, à partir des
// mêmes données produites par le même loader. Une maquette séparée dériverait
// du vrai rendu et mentirait le jour où ça compte.
//
// Aucune interaction ne suppose JavaScript : la recherche est un formulaire
// GET, les facettes sont des liens. La page doit s'ouvrir depuis WhatsApp,
// sur un réseau qu'on ne choisit pas, sans rien installer.
import type { DonneesPartage } from "../../lib/partage/contenu.server";
import { GrilleZones } from "../recherche/GrilleZones";
import { ListeResultats } from "../recherche/ListeResultats";
import { liensPartage } from "../recherche/liens";
import { FacettesLiens } from "./FacettesLiens";
import { PlanStatique } from "./PlanStatique";

export function PagePartage({ donnees, jeton }: { donnees: DonneesPartage; jeton: string }) {
  const base = `/p/${jeton}`;
  const liens = liensPartage(jeton);
  const { facettes } = donnees;

  return (
    <div className="page-partage">
      <h1 className="accueil-titre">{donnees.proprieteNom}</h1>

      {/* Formulaire GET : l'URL porte la recherche, donc la page se recharge
          entière et se partage telle quelle. Les facettes cochées voyagent en
          champs cachés, sinon taper un mot les effacerait. */}
      <form method="get" action={base} className="recherche-epingle partage-recherche">
        <div className="recherche-barre">
          <input
            type="search"
            name="q"
            className="recherche-champ"
            defaultValue={donnees.q}
            placeholder="Chercher un objet"
            aria-label="Chercher un objet"
            autoComplete="off"
          />
        </div>
        {facettes.zones.map((id) => <input key={`z${id}`} type="hidden" name="zone" value={id} />)}
        {facettes.systemes.map((id) => <input key={`s${id}`} type="hidden" name="systeme" value={id} />)}
        {facettes.types.map((id) => <input key={`t${id}`} type="hidden" name="type" value={id} />)}
        <button type="submit" className="bouton-discret partage-chercher">Chercher</button>
      </form>

      <FacettesLiens base={base} q={donnees.q} disponibles={donnees.facettesDisponibles} actives={facettes} />

      {donnees.liste ? (
        <>
          <ListeResultats liens={liens} donnees={donnees.recherche} enCours={false} />
          <p className="accueil-lien-filtres">
            <a href={base}>Revenir aux zones</a>
          </p>
        </>
      ) : donnees.zones.length === 0 && donnees.plan === null ? (
        <p className="resultats-vide">Rien à afficher pour ce lien.</p>
      ) : (
        <>
          {/* Le plan répond « c'est où » sans qu'on ait à savoir comment
              l'objet s'appelle : il vient donc avant la grille. Absent quand
              aucun plan n'est visible pour ce lien — pas de titre orphelin. */}
          {donnees.plan && <PlanStatique plan={donnees.plan} plans={donnees.plans} liens={liens} />}
          {donnees.zones.length > 0 && <GrilleZones zones={donnees.zones} liens={liens} />}
        </>
      )}
    </div>
  );
}

/** Jeton connu, mais expiré ou révoqué : une page neutre, sans rien du bien. */
export function PartageInactif() {
  return (
    <div className="page-partage">
      <h1>Ce lien n'est plus actif</h1>
      <p className="resultats-vide">
        Demandez-en un nouveau à la personne qui vous l'a envoyé.
      </p>
    </div>
  );
}
