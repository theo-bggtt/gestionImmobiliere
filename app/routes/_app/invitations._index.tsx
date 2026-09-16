// app/routes/_app/invitations._index.tsx
// Les invitations : créer, lister, copier le lien, révoquer. Avec
// `partages._index.tsx`, la seule surface qui montre un jeton en clair.
//
// SEUL ÉCRAN AUTHENTIFIÉ QUI NE PARLE D'AUCUNE PROPRIÉTÉ, d'où son chemin —
// `/proprietes/invitations`, à côté de la liste des propriétés et non dedans.
// Il n'y a donc pas de `requireProprieteAccess` à appeler ici : une invitation
// pend à l'instance, pas à une maison, et rien de ce qu'elle porte n'est
// scopé par `proprieteId`.
import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { invitation, utilisateur } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import {
  JOURS_PAR_DEFAUT,
  creerInvitation,
  invitationActive,
  revoquerInvitation,
} from "../../lib/auth/invitations.server";
import { jourLisible } from "../../lib/dates";

const NOTE_MAX = 120;

/** Un jour au format `YYYY-MM-DD`, décalé de `jours` — pour l'`<input type="date">`. */
function jourDecale(jours: number, depuis = new Date()) {
  const d = new Date(depuis);
  d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUtilisateurId(request);

  const lignes = await db
    .select({ invitation, emailUtilise: utilisateur.email })
    .from(invitation)
    // Qui a fini par entrer. `left`, parce qu'une invitation non consommée
    // n'a personne derrière elle, et qu'un compte supprimé laisse la ligne
    // (`utilisee_par_id` est `ON DELETE set null`).
    .leftJoin(utilisateur, eq(utilisateur.id, invitation.utiliseeParId))
    .orderBy(desc(invitation.creeLe));

  const origine = new URL(request.url).origin;

  return {
    // Le jour d'aujourd'hui sert de plancher au sélecteur de date. Calculé
    // côté serveur comme le défaut : deux horloges donneraient deux minima.
    aujourdhui: jourDecale(0),
    defautExpiration: jourDecale(JOURS_PAR_DEFAUT),
    invitations: lignes.map(({ invitation: i, emailUtilise }) => ({
      id: i.id,
      note: i.note,
      lien: `${origine}/inscription?invitation=${i.jeton}`,
      expireLe: i.expireLe.toISOString().slice(0, 10),
      actif: invitationActive(i),
      etat: i.utiliseeLe !== null ? "utilisée" : i.revoqueLe !== null ? "révoquée" : invitationActive(i) ? "active" : "expirée",
      emailUtilise,
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const form = await request.formData();

  if (form.get("_action") === "revoquer") {
    // Révoqué, jamais supprimé : la trace de qui on a laissé entrer est le
    // point, même argument que pour un lien de partage.
    await revoquerInvitation(Number(form.get("invitationId")));
    return redirect("/proprietes/invitations");
  }

  const note = String(form.get("note") ?? "").trim().slice(0, NOTE_MAX);

  const expireLeBrut = String(form.get("expireLe") ?? "").trim();
  if (!expireLeBrut) return { erreur: "Une date d'expiration est obligatoire." };
  // À la fin du jour choisi, pas à minuit le matin — comme un lien de partage.
  const expireLe = new Date(`${expireLeBrut}T23:59:59`);
  if (Number.isNaN(expireLe.getTime())) return { erreur: "Date d'expiration invalide." };
  if (expireLe <= new Date()) return { erreur: "La date d'expiration doit être dans le futur." };

  await creerInvitation(utilisateurId, note || null, expireLe);
  return redirect("/proprietes/invitations");
}

export default function EcranInvitations() {
  const { invitations, aujourdhui, defautExpiration } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <main>
      <h1>Invitations</h1>
      <p className="resultats-vide">
        Un lien d'invitation permet à une personne de créer son compte, avec ses propres propriétés. Il ne donne aucun
        accès aux vôtres — pour montrer une maison, c'est un lien de partage qu'il faut.
      </p>

      <section className="bloc">
        <p className="cote">Invitations émises</p>
        {invitations.length === 0 ? (
          <p className="resultats-vide">Aucune invitation pour l'instant.</p>
        ) : (
          <ul className="filets partages-liste">
            {invitations.map((i) => (
              <li key={i.id} className={i.actif ? "partage-ligne" : "partage-ligne partage-ligne-inactif filet-tirete"}>
                <div className="partage-tete">
                  <span className="partage-nom">{i.note ?? "Sans note"}</span>
                  {/* Le tireté et l'étiquette « hors » disent la même chose que
                      pour un lien de partage révoqué : ça existe, mais plus
                      d'ici. L'épaisseur du trait porte l'information. */}
                  <span className={i.actif ? "etiquette etiquette-active" : "etiquette etiquette-hors"}>{i.etat}</span>
                </div>
                <p className="partage-detail">
                  {i.emailUtilise
                    ? `Compte créé : ${i.emailUtilise}`
                    : `Expire le ${jourLisible(i.expireLe)}`}
                </p>
                {i.actif && <input className="partage-lien" type="text" readOnly value={i.lien} />}
                {i.actif && (
                  <div className="partage-actions">
                    <Form method="post">
                      <input type="hidden" name="_action" value="revoquer" />
                      <input type="hidden" name="invitationId" value={i.id} />
                      <button type="submit" className="bouton-discret">
                        Révoquer
                      </button>
                    </Form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bloc">
        <p className="cote">Nouvelle invitation</p>
        <Form method="post" className="formulaire">
          <label>
            Note (pour vous seul)
            <input type="text" name="note" maxLength={NOTE_MAX} placeholder="Mon frère" />
          </label>
          <p className="champ-aide">La personne invitée ne la voit pas.</p>
          <label>
            Expiration
            <input type="date" name="expireLe" required min={aujourdhui} defaultValue={defautExpiration} />
          </label>
          {actionData?.erreur && (
            <p role="alert" className="message-erreur">
              {actionData.erreur}
            </p>
          )}
          <div className="formulaire-actions">
            <button type="submit">Créer l'invitation</button>
          </div>
        </Form>
      </section>
    </main>
  );
}
