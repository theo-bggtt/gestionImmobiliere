// app/components/coffre/SectionCoffre.tsx
// La section « Coffre » d'une fiche : les secrets de l'objet, les révéler, en
// retirer, en ajouter. TOUT se passe dans le navigateur : la phrase
// désenveloppe la clé de données, la valeur est chiffrée ici, et ce qui part
// au serveur est un libellé et un bloc. La page servie contient le bloc,
// jamais le clair.
//
// Les champs sensibles — phrase, valeur en clair — n'ont pas d'attribut
// `name` et ne sont dans aucun `<form>` : un `<input name="phrase">` dans un
// formulaire natif partirait au serveur le jour où le JavaScript échoue avant
// l'hydratation. L'envoi est un `fetcher.submit` construit à la main.
//
// La phrase vit dans l'état du composant le temps du geste, et n'est écrite
// nulle part — ni `localStorage`, ni `sessionStorage`, ni cookie, ni boîte
// d'envoi. La garder pour la session est écarté (issue #73).
//
// Une seule instance par écran : deux sections ne partageraient pas leur
// état, et la phrase tapée dans l'une ne servirait pas l'autre.
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { chiffrer, dechiffrer, ouvrirCoffre, type CoffreOuvrable } from "../../lib/coffre/chiffrement";
import { LIBELLE_MAX, VALEUR_MAX, type SecretRendu } from "../../lib/coffre/types";

type ReponseSecret = { ok: true } | { erreur: string };

export function SectionCoffre({
  proprieteId,
  coffre,
  secrets,
}: {
  proprieteId: number;
  coffre: CoffreOuvrable | null;
  secrets: SecretRendu[];
}) {
  return (
    <section className="fiche-coffre bloc">
      <p className="sous-titre">
        <span>Coffre</span>
        {coffre && (
          <Link to={`/proprietes/${proprieteId}/coffre`} viewTransition>
            Le coffre
          </Link>
        )}
      </p>
      {coffre ? (
        <>
          <noscript>
            <p className="message-erreur">
              Le coffre a besoin de JavaScript : c'est votre navigateur qui chiffre et déchiffre, pas le serveur.
            </p>
          </noscript>
          {secrets.length === 0 ? (
            <p className="fiche-photos-vide">Aucun secret sur cet objet.</p>
          ) : (
            <ul className="filets fiche-coffre-liste">
              {secrets.map((s) => (
                <Secret key={s.id} secret={s} coffre={coffre} />
              ))}
            </ul>
          )}
          <Ajout coffre={coffre} />
        </>
      ) : (
        <p className="fiche-photos-vide">
          Un code, une combinaison, un mot de passe : chiffrés par votre navigateur, jamais cherchés, jamais partagés.{" "}
          <Link to={`/proprietes/${proprieteId}/coffre`} viewTransition>
            Créer le coffre de la propriété
          </Link>
          .
        </p>
      )}
    </section>
  );
}

function Secret({ secret, coffre }: { secret: SecretRendu; coffre: CoffreOuvrable }) {
  const fetcher = useFetcher<ReponseSecret>();
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [clair, setClair] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [travail, setTravail] = useState(false);

  async function reveler() {
    setErreur(null);
    setTravail(true);
    try {
      const cle = await ouvrirCoffre(coffre, saisie);
      setClair(await dechiffrer(cle, secret.valeur));
      setSaisie("");
      setOuvert(false);
    } catch {
      setErreur("Phrase ou clé de secours incorrecte.");
    } finally {
      setTravail(false);
    }
  }

  const erreurServeur = fetcher.data && "erreur" in fetcher.data ? fetcher.data.erreur : null;

  return (
    <li>
      <span className="nom">{secret.libelle}</span>
      {clair !== null ? (
        <span className="coffre-clair">
          <code>{clair}</code>
          <button type="button" className="bouton-discret" onClick={() => setClair(null)}>
            Masquer
          </button>
        </span>
      ) : ouvert ? (
        <span className="coffre-ouverture">
          {/* Sans `name`, hors formulaire : la phrase ne part nulle part. */}
          <input
            type="password"
            autoComplete="off"
            placeholder="Phrase ou clé de secours"
            aria-label="Phrase ou clé de secours"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && reveler()}
          />
          <button type="button" className="bouton-trait" onClick={reveler} disabled={travail}>
            {travail ? "…" : "Ouvrir"}
          </button>
          <button type="button" className="bouton-discret" onClick={() => setOuvert(false)}>
            Annuler
          </button>
        </span>
      ) : (
        <button type="button" className="bouton-discret" onClick={() => setOuvert(true)}>
          Révéler
        </button>
      )}
      {/* Retirer ne porte rien de sensible : un identifiant et un geste. */}
      <fetcher.Form method="post">
        <input type="hidden" name="_action" value="secret-supprimer" />
        <input type="hidden" name="secretId" value={secret.id} />
        <button type="submit" className="bouton-discret" disabled={fetcher.state !== "idle"}>
          Retirer
        </button>
      </fetcher.Form>
      {(erreur ?? erreurServeur) && (
        <p role="alert" className="message-erreur">
          {erreur ?? erreurServeur}
        </p>
      )}
    </li>
  );
}

function Ajout({ coffre }: { coffre: CoffreOuvrable }) {
  const fetcher = useFetcher<ReponseSecret>();
  const [libelle, setLibelle] = useState("");
  const [valeur, setValeur] = useState("");
  const [phrase, setPhrase] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [travail, setTravail] = useState(false);

  async function ranger() {
    setErreur(null);
    if (!libelle.trim()) return setErreur("Donnez un libellé au secret.");
    if (!valeur) return setErreur("Rien à ranger : la valeur est vide.");
    if (valeur.length > VALEUR_MAX) return setErreur("La valeur est trop longue pour le coffre.");
    setTravail(true);
    try {
      const cle = await ouvrirCoffre(coffre, phrase);
      const bloc = await chiffrer(cle, valeur);
      fetcher.submit({ _action: "secret-creer", libelle: libelle.trim(), valeur: bloc }, { method: "post" });
      setLibelle("");
      setValeur("");
      setPhrase("");
    } catch {
      setErreur("Phrase ou clé de secours incorrecte.");
    } finally {
      setTravail(false);
    }
  }

  const erreurServeur = fetcher.data && "erreur" in fetcher.data ? fetcher.data.erreur : null;

  return (
    <div className="formulaire">
      <p className="cote">Ranger un secret</p>
      {/* Aucun `name` sur aucun de ces champs, et pas de `<form>` autour :
          seul le bloc chiffré part, par `fetcher.submit`. */}
      <label>
        Libellé
        <input
          type="text"
          maxLength={LIBELLE_MAX}
          placeholder="Code du portail"
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
        />
      </label>
      <p className="champ-aide">Le libellé est en clair : il dit qu'un code existe, pas lequel.</p>
      <label>
        Valeur
        <input type="text" autoComplete="off" maxLength={VALEUR_MAX} value={valeur} onChange={(e) => setValeur(e.target.value)} />
      </label>
      <label>
        Phrase du coffre
        <input
          type="password"
          autoComplete="off"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ranger()}
        />
      </label>
      {(erreur ?? erreurServeur) && (
        <p role="alert" className="message-erreur">
          {erreur ?? erreurServeur}
        </p>
      )}
      <div className="formulaire-actions">
        <button type="button" className="bouton-trait" onClick={ranger} disabled={travail || fetcher.state !== "idle"}>
          {travail ? "Chiffrement…" : "Ranger dans le coffre"}
        </button>
      </div>
    </div>
  );
}
