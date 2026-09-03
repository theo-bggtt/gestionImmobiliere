// app/routes/_app/demarrer._index.tsx
// L'écran qui remplace le vide. Le propriétaire donne le minimum et repart
// avec une structure à corriger, plutôt qu'une page à remplir.
//
// Deux phases dans un seul écran : les questions, puis la proposition
// éditable. Rien n'entre en base avant le bouton du bas — la proposition vit
// dans l'état du composant, donc fermer l'onglet l'annule.
//
// Ce module n'exporte QUE des exports de route reconnus (`loader`, `action`,
// défaut) : un `composerSquelette` réexporté d'ici partirait dans le bundle
// client avec ce qu'il traîne (`tests/exports-routes.test.ts` le vérifie).
import { useState } from "react";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { ecrireSquelette, proprieteEstVierge } from "../../lib/demarrage/creation.server";
import { composerSquelette } from "../../lib/demarrage/squelette";
import {
  NIVEAUX_HABITABLES_MAX,
  NIVEAUX_HABITABLES_MIN,
  type ReponsesDemarrage,
  type SquelettePropose,
} from "../../lib/demarrage/types";
import { RechercheAdresse } from "../../components/demarrage/RechercheAdresse";
import { EditeurSquelette } from "../../components/demarrage/EditeurSquelette";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  // Même condition que la garde d'écriture : proposer une structure à une
  // propriété déjà meublée n'a pas de sens, et l'action refuserait de toute
  // façon. Autant ne pas afficher un écran qui ne peut pas aboutir.
  if (!(await proprieteEstVierge(propriete.id))) {
    return redirect(`/proprietes/${propriete.id}`);
  }

  // `propriete.nom` seul. Ni `adresse` ni `egid` n'entrent dans ce loader —
  // ce qui n'est pas chargé ne peut pas fuir.
  return { propriete: { id: propriete.id, nom: propriete.nom } };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);

  const form = await request.formData();
  let propose: unknown;
  try {
    propose = JSON.parse(String(form.get("squelette") ?? ""));
  } catch {
    return { erreur: "La structure envoyée est illisible." };
  }

  const resultat = await ecrireSquelette(propriete.id, propose);
  if (resultat.statut === "invalide") return { erreur: resultat.message };
  // Déjà structurée : le squelette a été écrit entre-temps (deuxième onglet,
  // double soumission). L'accueil montre le résultat, il n'y a pas d'erreur.
  return redirect(`/proprietes/${propriete.id}`);
}

const REPONSES_PAR_DEFAUT: ReponsesDemarrage = {
  forme: "maison",
  niveauxHabitables: 2,
  sousSol: true,
  combles: false,
  garage: false,
  exterieur: true,
};

export default function Demarrer() {
  const { propriete } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const [reponses, setReponses] = useState<ReponsesDemarrage>(REPONSES_PAR_DEFAUT);
  const [squelette, setSquelette] = useState<SquelettePropose | null>(null);

  const nomsVides =
    squelette !== null &&
    [
      ...squelette.batiments.map((b) => b.nom),
      ...squelette.batiments.flatMap((b) => b.niveaux.map((n) => n.nom)),
      ...squelette.batiments.flatMap((b) => b.niveaux.flatMap((n) => n.zones.map((z) => z.nom))),
      ...squelette.zonesExterieures.map((z) => z.nom),
    ].some((nom) => nom.trim().length === 0);

  const vide =
    squelette !== null &&
    squelette.batiments.every((b) => b.niveaux.length === 0) &&
    squelette.zonesExterieures.length === 0;

  if (squelette === null) {
    return (
      <main className="demarrage">
        <h1>Composer la structure de « {propriete.nom} »</h1>
        <p className="demarrage-intro">
          Quelques questions, et vous repartez avec des niveaux et des zones à corriger plutôt qu'une
          page vide. Rien n'est enregistré avant votre confirmation.
        </p>

        <RechercheAdresse
          proprieteId={propriete.id}
          onChoisir={(pre) => setReponses((r) => ({ ...r, ...pre }))}
        />

        <Questions reponses={reponses} onChanger={setReponses} />

        <div className="demarrage-actions">
          <button type="button" onClick={() => setSquelette(composerSquelette(reponses))}>
            Proposer une structure
          </button>
          <Link to={`/proprietes/${propriete.id}`} className="demarrage-passer">
            Passer, je pars de zéro
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="demarrage">
      <h1>Votre structure, à corriger</h1>
      <p className="demarrage-intro">
        Renommez, retirez, ajoutez. Rien n'est enregistré tant que vous n'avez pas confirmé, et tout
        reste modifiable ensuite.
      </p>

      <EditeurSquelette squelette={squelette} onChanger={setSquelette} />

      <Form method="post" className="demarrage-actions">
        <input type="hidden" name="squelette" value={JSON.stringify(squelette)} />
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        {nomsVides && <p role="alert">Donnez un nom à chaque bâtiment, niveau et zone, ou retirez-les.</p>}
        {vide && <p role="alert">Il ne reste rien à créer.</p>}
        <button type="submit" disabled={nomsVides || vide || navigation.state !== "idle"}>
          {navigation.state === "idle" ? "Créer cette structure" : "Création…"}
        </button>
        <button type="button" onClick={() => setSquelette(null)} className="demarrage-passer">
          Revenir aux questions
        </button>
      </Form>
    </main>
  );
}

function Questions({
  reponses,
  onChanger,
}: {
  reponses: ReponsesDemarrage;
  onChanger: (r: ReponsesDemarrage) => void;
}) {
  const logement = reponses.forme === "appartement";

  return (
    <section className="demarrage-questions">
      <fieldset>
        <legend>De quoi s'agit-il ?</legend>
        <label>
          <input
            type="radio"
            name="forme"
            checked={!logement}
            onChange={() => onChanger({ ...reponses, forme: "maison" })}
          />
          Une maison
        </label>
        <label>
          <input
            type="radio"
            name="forme"
            checked={logement}
            onChange={() => onChanger({ ...reponses, forme: "appartement" })}
          />
          Un logement dans un immeuble
        </label>
      </fieldset>

      {!logement && (
        <label className="demarrage-champ">
          Niveaux habitables, rez-de-chaussée compris
          <input
            type="number"
            min={NIVEAUX_HABITABLES_MIN}
            max={NIVEAUX_HABITABLES_MAX}
            value={reponses.niveauxHabitables}
            onChange={(e) => onChanger({ ...reponses, niveauxHabitables: Number(e.target.value) })}
          />
        </label>
      )}

      <label className="demarrage-case">
        <input
          type="checkbox"
          checked={reponses.sousSol}
          onChange={(e) => onChanger({ ...reponses, sousSol: e.target.checked })}
        />
        {/* Demandé, jamais déduit : `gastw` ne compte pas les caves. */}
        Il y a un sous-sol ou une cave
      </label>

      {!logement && (
        <>
          <label className="demarrage-case">
            <input
              type="checkbox"
              checked={reponses.combles}
              onChange={(e) => onChanger({ ...reponses, combles: e.target.checked })}
            />
            Il y a des combles
          </label>
          <label className="demarrage-case">
            <input
              type="checkbox"
              checked={reponses.garage}
              onChange={(e) => onChanger({ ...reponses, garage: e.target.checked })}
            />
            Il y a un garage séparé
          </label>
        </>
      )}

      <label className="demarrage-case">
        <input
          type="checkbox"
          checked={reponses.exterieur}
          onChange={(e) => onChanger({ ...reponses, exterieur: e.target.checked })}
        />
        {logement ? "Il y a un balcon ou une terrasse" : "Il y a un jardin ou une terrasse"}
      </label>
    </section>
  );
}
