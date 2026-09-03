// app/routes/_app/plans.nouveau.tsx
// Téléverser un plan : un par niveau, plus un plan de situation pour la
// parcelle. Le nom est libre et reste privé — il ne part jamais dans un lien
// de partage, qui étiquette ses plans depuis le niveau.
import { useState } from "react";
import { Link, redirect, useFetcher, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { batiment, niveau, plan } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { niveauAppartientALaPropriete } from "../../lib/zoneTree";
import { creerPlan, lireGeometrie } from "../../lib/plans/plans.server";
import { EditeurImagePlan, type Preparation } from "../../components/plan/EditeurImagePlan";

// Un plan rastérisé depuis un PDF A0 pèse plus lourd qu'une photo d'objet.
const TAILLE_MAX = 25 * 1024 * 1024;
const NOM_MAX = 120;

// Surtout pas exportée : un export non reconnu d'un module de route n'est pas
// retiré du bundle client, et celui-ci emporterait drizzle et le schéma.
async function chargerNiveaux(proprieteId: number) {
  return db
    .select({
      id: niveau.id,
      nom: niveau.nom,
      ordinal: niveau.ordinal,
      batimentNom: batiment.nom,
    })
    .from(niveau)
    .innerJoin(batiment, eq(batiment.id, niveau.batimentId))
    .where(eq(batiment.proprieteId, proprieteId))
    // L'ordinal est la donnée, le nom n'est qu'une étiquette (règle #11).
    .orderBy(asc(batiment.ordre), asc(niveau.ordinal));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  return { propriete, niveaux: await chargerNiveaux(propriete.id) };
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  const nom = String(form.get("nom") ?? "").trim().slice(0, NOM_MAX);
  if (!nom) return { erreur: "Le nom est obligatoire." };

  const type = form.get("type") === "situation" ? "situation" : "etage";
  let niveauId: number | null = null;
  if (type === "etage") {
    niveauId = Number(form.get("niveauId"));
    if (!niveauId || !(await niveauAppartientALaPropriete(propriete.id, niveauId))) {
      return { erreur: "Niveau invalide." };
    }
  }

  const image = form.get("image");
  if (!(image instanceof File) || image.size === 0) return { erreur: "Image absente." };
  if (image.size > TAILLE_MAX) return { erreur: "Image trop volumineuse." };

  // Plusieurs plans par niveau sont prévus (celui de l'architecte et le relevé
  // de l'électricien) : le nouveau se range après les existants.
  const [{ nombre }] = await db
    .select({ nombre: sql<number>`count(*)::int` })
    .from(plan)
    .where(
      niveauId === null
        ? sql`${plan.proprieteId} = ${propriete.id} AND ${plan.niveauId} IS NULL`
        : sql`${plan.proprieteId} = ${propriete.id} AND ${plan.niveauId} = ${niveauId}`,
    );

  const planId = await creerPlan({
    proprieteId: propriete.id,
    type,
    niveauId,
    nom,
    ordre: nombre,
    image: Buffer.from(await image.arrayBuffer()),
    geometrie: lireGeometrie(form),
  });

  return redirect(`/proprietes/${propriete.id}/plans?plan=${planId}`);
}

export default function NouveauPlan() {
  const { propriete, niveaux } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ erreur?: string }>();
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [type, setType] = useState<"etage" | "situation">("etage");

  // L'envoi passe par un `fetcher` et non par un `<Form>` : un PDF est
  // rastérisé dans le navigateur, donc ce ne sont pas les octets du champ
  // fichier qui partent, mais l'image produite.
  function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!preparation) return;
    const champs = new FormData(e.currentTarget);
    champs.set("image", preparation.fichier, preparation.nomFichier);
    champs.set("rotation", String(preparation.rotation));
    champs.set("recadrage", JSON.stringify(preparation.recadrage));
    fetcher.submit(champs, { method: "post", encType: "multipart/form-data" });
  }

  return (
    <main>
      <h1>Ajouter un plan</h1>

      <form method="post" encType="multipart/form-data" onSubmit={envoyer}>
        <label>
          Nom (pour vous seul)
          <input type="text" name="nom" required maxLength={NOM_MAX} placeholder="Rez — plan de l'architecte" />
        </label>

        <label>
          Ce plan couvre
          <select name="type" value={type} onChange={(e) => setType(e.target.value as "etage" | "situation")}>
            <option value="etage">un niveau du bâtiment</option>
            <option value="situation">la parcelle (plan de situation)</option>
          </select>
        </label>

        {type === "etage" &&
          (niveaux.length === 0 ? (
            <p className="resultats-vide">
              Aucun niveau. <Link to={`/proprietes/${propriete.id}/batiments`}>Créez-en un</Link> avant d'ajouter un
              plan d'étage.
            </p>
          ) : (
            <label>
              Niveau
              <select name="niveauId" required>
                {niveaux.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.batimentNom} · {n.nom}
                  </option>
                ))}
              </select>
            </label>
          ))}

        <EditeurImagePlan onChange={setPreparation} />

        {/* Règle non négociable #7 : rien ne peut filtrer ce qui est écrit
            DANS l'image. C'est la seule fuite d'adresse que le code ne sait
            pas fermer, elle se dit donc à l'endroit où elle se décide. */}
        <p className="editeur-note" role="note">
          Un extrait cadastral porte souvent l'adresse et le numéro de parcelle imprimés dessus. L'image est servie
          telle quelle aux destinataires de vos liens : recadrez le bandeau si vous ne voulez pas le partager.
        </p>

        {fetcher.data?.erreur && <p role="alert">{fetcher.data.erreur}</p>}
        <button type="submit" disabled={!preparation || fetcher.state !== "idle"}>
          {fetcher.state === "idle" ? "Enregistrer le plan" : "Envoi…"}
        </button>
      </form>

      <p>
        <Link to={`/proprietes/${propriete.id}/plans`}>Revenir aux plans</Link>
      </p>
    </main>
  );
}
