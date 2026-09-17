// app/routes/_app/coffre.tsx
// Le coffre de la propriété : le créer, changer sa phrase, le vider. Trois
// gestes, et pour deux d'entre eux tout le travail se fait DANS LE NAVIGATEUR
// (`app/lib/coffre/chiffrement.ts`) : la phrase et la clé de secours ne
// passent par aucun champ nommé, aucun `<form>` soumis, aucune requête. Ce qui
// part au serveur, c'est un sel, un nombre d'itérations et deux enveloppes —
// du bruit pour qui le lit.
//
// Le piège concret de cet écran : un `<input name="phrase">` dans un
// `<form method="post">` partirait au serveur le jour où le JavaScript échoue
// avant l'hydratation. D'où des champs SANS `name`, hors de tout formulaire,
// et un `fetcher.submit` construit à la main avec le seul résultat chiffré.
// `tests/coffre/etancheite.test.ts` vérifie le rendu serveur.
import { useEffect, useRef, useState } from "react";
import { Form, redirect, useActionData, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import {
  chargerCoffre,
  compterSecrets,
  creerCoffre,
  lireEnveloppe,
  lireSaisieCoffre,
  majCleParPhrase,
  viderCoffre,
} from "../../lib/coffre/coffre.server";
import { composerCoffre, reenvelopperParPhrase, type CoffreOuvrable } from "../../lib/coffre/chiffrement";
import { PHRASE_MIN } from "../../lib/coffre/types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const [coffre, nbSecrets] = await Promise.all([chargerCoffre(propriete.id), compterSecrets(propriete.id)]);
  // Ce qui descend : les paramètres de dérivation et les deux enveloppes,
  // tout ce qu'il faut pour ouvrir dans le navigateur — et rien qui ouvre.
  return { propriete, coffre, nbSecrets };
}

type ReponseAction = { ok: true; geste: "creer" | "changer-phrase" } | { erreur: string };

export async function action({ request, params }: ActionFunctionArgs): Promise<ReponseAction | Response> {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();
  const geste = form.get("_action");

  if (geste === "creer") {
    const saisie = lireSaisieCoffre(form);
    if (!saisie.ok) return { erreur: saisie.message };
    // La clé primaire ferme la course entre deux créations ; on lit le nombre
    // de lignes écrites plutôt que de vérifier avant.
    if (!(await creerCoffre(propriete.id, saisie.valeur))) return { erreur: "Cette propriété a déjà un coffre." };
    return { ok: true, geste: "creer" };
  }

  if (geste === "changer-phrase") {
    const enveloppe = lireEnveloppe(form.get("cleParPhrase"));
    if (!enveloppe) return { erreur: "La clé enveloppée n'a pas la forme attendue." };
    if (!(await majCleParPhrase(propriete.id, enveloppe))) return { erreur: "Cette propriété n'a pas de coffre." };
    return { ok: true, geste: "changer-phrase" };
  }

  if (geste === "vider") {
    // La case cochée est la confirmation : elle dit combien de secrets
    // disparaissent, et c'est le seul geste de cet écran qui passe par un
    // formulaire natif — il n'y a rien de sensible dedans.
    if (form.get("confirme") !== "oui") return { erreur: "Cochez la case pour confirmer." };
    await viderCoffre(propriete.id);
    return redirect(`/proprietes/${propriete.id}/coffre`);
  }

  return { erreur: "Geste inconnu." };
}

export default function EcranCoffre() {
  const { propriete, coffre, nbSecrets } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ReponseAction>();

  // La clé de secours : générée ici, montrée UNE fois quand le serveur a
  // confirmé l'écriture, puis oubliée. Jamais dans un loader, jamais écrite.
  const [secours, setSecours] = useState<string | null>(null);
  const secoursEnAttente = useRef<string | null>(null);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || !("ok" in fetcher.data)) return;
    if (fetcher.data.geste === "creer" && secoursEnAttente.current) {
      setSecours(secoursEnAttente.current);
      secoursEnAttente.current = null;
    }
  }, [fetcher.state, fetcher.data]);

  const erreurServeur = fetcher.data && "erreur" in fetcher.data ? fetcher.data.erreur : null;
  // « Vider » passe par un formulaire natif : son erreur arrive par la
  // navigation, pas par le fetcher.
  const actionData = useActionData<typeof action>();
  const erreurVider = actionData && "erreur" in actionData ? actionData.erreur : null;

  return (
    <main>
      <h1>Coffre</h1>
      <p className="resultats-vide">
        Un code de portail, une combinaison, le mot de passe du routeur, l'endroit où est cachée une clé : des valeurs
        courtes, chiffrées par votre navigateur avec une phrase que le serveur ne reçoit jamais. Elles ne se cherchent
        pas et ne sortent d'aucun lien de partage.
      </p>
      <noscript>
        <p className="message-erreur">
          Le coffre a besoin de JavaScript : c'est votre navigateur qui chiffre et déchiffre, pas le serveur.
        </p>
      </noscript>

      {secours && <ClefDeSecours secours={secours} onFini={() => setSecours(null)} />}

      {coffre ? (
        <>
          <section className="bloc">
            <p className="cote">Le coffre</p>
            <p className="resultats-vide">
              {nbSecrets === 0
                ? "Aucun secret pour l'instant. Ils se posent depuis la fiche d'un objet — le portail, la centrale, la porte."
                : `${nbSecrets} ${nbSecrets === 1 ? "secret rangé" : "secrets rangés"}, chacun sur la fiche de son objet.`}
            </p>
          </section>
          <ChangerPhrase coffre={coffre} fetcher={fetcher} erreurServeur={erreurServeur} />
          <Vider nbSecrets={nbSecrets} erreurServeur={erreurVider} />
        </>
      ) : (
        <Creation
          fetcher={fetcher}
          erreurServeur={erreurServeur}
          onComposer={(cle) => {
            secoursEnAttente.current = cle;
          }}
        />
      )}

      <p className="bloc-suite">
        <a href={`/proprietes/${propriete.id}`}>Retour à l'accueil</a>
      </p>
    </main>
  );
}

type Fetcher = ReturnType<typeof useFetcher<ReponseAction>>;

function Creation({
  fetcher,
  erreurServeur,
  onComposer,
}: {
  fetcher: Fetcher;
  erreurServeur: string | null;
  onComposer: (secours: string) => void;
}) {
  const [phrase, setPhrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [travail, setTravail] = useState(false);

  async function creer() {
    setErreur(null);
    if (phrase.length < PHRASE_MIN) return setErreur(`La phrase doit faire au moins ${PHRASE_MIN} caractères.`);
    if (phrase !== confirmation) return setErreur("Les deux phrases ne sont pas identiques.");
    setTravail(true);
    try {
      const { coffre, secours } = await composerCoffre(phrase);
      onComposer(secours);
      fetcher.submit({ _action: "creer", ...coffre, iterations: String(coffre.iterations) }, { method: "post" });
      setPhrase("");
      setConfirmation("");
    } finally {
      setTravail(false);
    }
  }

  return (
    <section className="bloc">
      <p className="cote">Créer le coffre</p>
      {/* Aucun `name`, aucun `<form>` : ces deux champs ne partent nulle part. */}
      <div className="formulaire">
        <label>
          Phrase du coffre
          <input
            type="password"
            autoComplete="new-password"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && creer()}
          />
        </label>
        <p className="champ-aide">
          Distincte du mot de passe du compte, et jamais envoyée : elle ne quitte pas votre navigateur. Une phrase
          longue vaut mieux qu'un mot compliqué.
        </p>
        <label>
          La même phrase, une seconde fois
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && creer()}
          />
        </label>
        <p className="champ-aide">
          À la création, une clé de secours vous sera montrée une seule fois. Elle rouvre le coffre si la phrase est
          oubliée. Les deux perdues, les codes sont perdus : il ne reste qu'à vider le coffre et à les ressaisir —
          personne, ni nous ni l'hébergeur, ne peut les retrouver.
        </p>
        {(erreur ?? erreurServeur) && (
          <p role="alert" className="message-erreur">
            {erreur ?? erreurServeur}
          </p>
        )}
        <div className="formulaire-actions">
          <button type="button" onClick={creer} disabled={travail || fetcher.state !== "idle"}>
            {travail ? "Dérivation en cours…" : "Créer le coffre"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ClefDeSecours({ secours, onFini }: { secours: string; onFini: () => void }) {
  return (
    <section className="bloc coffre-secours" role="status">
      <p className="cote">Votre clé de secours</p>
      <p className="coffre-cle">
        <code>{secours}</code>
      </p>
      <p>
        Notez-la ou imprimez-la, et rangez-la avec les papiers de la maison. Elle n'est affichée qu'une fois : elle
        n'est enregistrée nulle part, et nous ne pouvons pas vous la redonner.
      </p>
      <p>
        Si la phrase est oubliée, cette clé rouvre le coffre et permet d'en choisir une nouvelle. Si les deux sont
        perdues, le coffre ne peut plus être ouvert par personne.
      </p>
      <div className="formulaire-actions">
        <button type="button" onClick={onFini}>
          J'ai rangé la clé
        </button>
      </div>
    </section>
  );
}

function ChangerPhrase({
  coffre,
  fetcher,
  erreurServeur,
}: {
  coffre: CoffreOuvrable;
  fetcher: Fetcher;
  erreurServeur: string | null;
}) {
  const [actuelle, setActuelle] = useState("");
  const [nouvelle, setNouvelle] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [travail, setTravail] = useState(false);

  const changee = fetcher.state === "idle" && fetcher.data && "ok" in fetcher.data && fetcher.data.geste === "changer-phrase";

  async function changer() {
    setErreur(null);
    if (nouvelle.length < PHRASE_MIN) return setErreur(`La nouvelle phrase doit faire au moins ${PHRASE_MIN} caractères.`);
    if (nouvelle !== confirmation) return setErreur("Les deux nouvelles phrases ne sont pas identiques.");
    setTravail(true);
    try {
      // Ouvre par la phrase actuelle OU par la clé de secours : c'est le
      // recours quand la phrase est oubliée.
      const cleParPhrase = await reenvelopperParPhrase(coffre, actuelle, nouvelle);
      fetcher.submit({ _action: "changer-phrase", cleParPhrase }, { method: "post" });
      setActuelle("");
      setNouvelle("");
      setConfirmation("");
    } catch {
      setErreur("Phrase ou clé de secours incorrecte.");
    } finally {
      setTravail(false);
    }
  }

  return (
    <section className="bloc">
      <p className="cote">Changer la phrase</p>
      <div className="formulaire">
        <label>
          Phrase actuelle, ou clé de secours
          <input type="password" autoComplete="off" value={actuelle} onChange={(e) => setActuelle(e.target.value)} />
        </label>
        <p className="champ-aide">
          Les secrets déjà rangés ne sont pas rechiffrés : changer la phrase ne touche qu'à la façon de l'ouvrir. La
          clé de secours reste valable.
        </p>
        <label>
          Nouvelle phrase
          <input type="password" autoComplete="new-password" value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} />
        </label>
        <label>
          La même, une seconde fois
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && changer()}
          />
        </label>
        {(erreur ?? erreurServeur) && (
          <p role="alert" className="message-erreur">
            {erreur ?? erreurServeur}
          </p>
        )}
        {changee && !erreur && (
          <p role="status" className="champ-aide">
            Phrase changée.
          </p>
        )}
        <div className="formulaire-actions">
          <button type="button" className="bouton-trait" onClick={changer} disabled={travail || fetcher.state !== "idle"}>
            {travail ? "Dérivation en cours…" : "Changer la phrase"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Vider({ nbSecrets, erreurServeur }: { nbSecrets: number; erreurServeur: string | null }) {
  return (
    <div className="formulaire-danger">
      <p className="cote">Vider le coffre</p>
      <p className="champ-aide">
        Le seul recours quand la phrase et la clé de secours sont toutes deux perdues. Le coffre et{" "}
        {nbSecrets === 0 ? "ses secrets" : nbSecrets === 1 ? "son unique secret" : `ses ${nbSecrets} secrets`} sont
        supprimés ; les codes se ressaisissent ensuite, après avoir reprogrammé ce qui doit l'être.
      </p>
      {/* Formulaire natif : il ne porte rien de sensible. */}
      <Form method="post" className="formulaire">
        <input type="hidden" name="_action" value="vider" />
        <label className="champ-case">
          <input type="checkbox" name="confirme" value="oui" required />
          {nbSecrets === 0
            ? "Je comprends que le coffre sera supprimé."
            : `Je comprends que ${nbSecrets === 1 ? "le secret" : `les ${nbSecrets} secrets`} du coffre ${nbSecrets === 1 ? "sera supprimé" : "seront supprimés"} et ne ${nbSecrets === 1 ? "pourra" : "pourront"} pas être ${nbSecrets === 1 ? "récupéré" : "récupérés"}.`}
        </label>
        {erreurServeur && (
          <p role="alert" className="message-erreur">
            {erreurServeur}
          </p>
        )}
        <div className="formulaire-actions">
          <button type="submit" className="bouton-discret">
            Vider le coffre
          </button>
        </div>
      </Form>
    </div>
  );
}
