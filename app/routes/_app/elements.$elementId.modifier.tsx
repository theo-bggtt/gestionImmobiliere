// app/routes/_app/elements.$elementId.modifier.tsx
import { useState } from "react";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { element, typeElement, systeme, fichier, fichierLien } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { chargerRessourceOu404 } from "../../lib/db/scopedResource.server";
import { zoneAppartientALaPropriete, systemeAppartientALaPropriete } from "../../lib/db/elementRefs.server";
import { chargerArbreZones, type ZoneAvecEnfants } from "../../lib/zoneTree";
import { chargerPlans, chargerPlansDeLElement } from "../../lib/plans/plans.server";
import { chargerEvenementsDeLElement } from "../../lib/historique/historique.server";
import {
  chargerGarantiesProprietaire,
  creerGarantie,
  lireSaisieGarantie,
  supprimerGarantie,
} from "../../lib/historique/garanties.server";
import {
  chargerCoffre,
  chargerSecretsDeLElement,
  creerSecret,
  lireSaisieSecret,
  supprimerSecret,
} from "../../lib/coffre/coffre.server";
import { SectionCoffre } from "../../components/coffre/SectionCoffre";
import { Chronologie } from "../../components/historique/Chronologie";
import { liensPropriete } from "../../components/recherche/liens";
import { validerDetails } from "../../lib/forms/champSchema";
import { extraireDetails } from "../../lib/forms/extraireDetails";
import { ZoneSelector } from "../../components/ZoneSelector";
import { ChoixNiveau } from "../../components/ChoixNiveau";
import { Echelle } from "../../components/Echelle";
import { DynamicElementFields } from "../../components/DynamicElementFields";
import { Capture } from "../../components/capture/Capture";
import { LIBELLES_NIVEAU, lireNiveauSaisi } from "../../lib/partage/niveaux";
import { jourLisible } from "../../lib/dates";

async function chargerTypesDisponibles(proprieteId: number) {
  return db.select().from(typeElement).where(or(isNull(typeElement.proprieteId), eq(typeElement.proprieteId, proprieteId)));
}

async function chargerElement(proprieteId: number, elementId: string | undefined) {
  return chargerRessourceOu404(
    element,
    and(eq(element.id, Number(elementId)), eq(element.proprieteId, proprieteId)),
    "Élément introuvable",
  );
}

// La plus récente en premier : sur une fiche d'entretien, c'est la photo
// qu'on vient de prendre qu'on veut voir, pas celle de l'installation.
async function chargerPhotos(proprieteId: number, elementId: number) {
  return db
    .select({ id: fichier.id, datePrise: fichier.datePrise })
    .from(fichierLien)
    .innerJoin(fichier, eq(fichierLien.fichierId, fichier.id))
    .where(
      and(
        eq(fichierLien.cibleType, "element"),
        eq(fichierLien.cibleId, elementId),
        eq(fichier.proprieteId, proprieteId),
      ),
    )
    .orderBy(sql`${fichier.datePrise} DESC NULLS LAST`, desc(fichier.id));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const [e, types, arbre, systemes, photos, plans, poses, evenements] = await Promise.all([
    chargerElement(propriete.id, params.elementId),
    chargerTypesDisponibles(propriete.id),
    chargerArbreZones(propriete.id),
    db.select().from(systeme).where(eq(systeme.proprieteId, propriete.id)),
    chargerPhotos(propriete.id, Number(params.elementId)),
    chargerPlans(propriete.id),
    chargerPlansDeLElement(propriete.id, Number(params.elementId)),
    chargerEvenementsDeLElement(propriete.id, Number(params.elementId)),
  ]);
  const [garanties, coffre, secrets] = await Promise.all([
    chargerGarantiesProprietaire(propriete.id, Number(params.elementId)),
    chargerCoffre(propriete.id),
    // Les blocs chiffrés, jamais le clair : c'est le navigateur qui ouvre.
    chargerSecretsDeLElement(propriete.id, Number(params.elementId)),
  ]);
  // Un objet déjà placé reste plaçable ailleurs : l'écran le montre (« déjà
  // sur Sous-sol ») plutôt que de l'interdire.
  const posesParPlan = new Set(poses.map((p) => p.planId));
  return {
    propriete,
    element: e,
    types,
    arbre,
    systemes,
    photos,
    plans: plans.map((p) => ({ id: p.id, nom: p.nom, pose: posesParPlan.has(p.id) })),
    evenements,
    garanties,
    coffre,
    secrets,
  };
}

/**
 * Exécute une écriture demandée par un fetcher et RENVOIE ses 404 au lieu de
 * les relancer : lancée, une `Response` remonte à la frontière d'erreur et
 * remplace la page (voir `plans.contours.tsx`). Le code reste 404 et le
 * message ne dépend pas du motif — règle #4.
 */
async function rendreLes404<T>(travail: () => Promise<T>): Promise<{ resultat: T } | { refus: Response }> {
  try {
    return { resultat: await travail() };
  } catch (e) {
    if (!(e instanceof Response)) throw e;
    return { refus: Response.json({ erreur: "Introuvable." }, { status: e.status }) };
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  await chargerElement(propriete.id, params.elementId);
  const form = await request.formData();

  if (form.get("_action") === "supprimer") {
    await db.delete(element).where(eq(element.id, Number(params.elementId)));
    return redirect(`/proprietes/${propriete.id}/elements`);
  }

  // Les garanties se saisissent depuis la fiche de leur objet, parce que
  // `garantie.element_id` est NOT NULL : elles n'ont pas d'existence hors de
  // lui, et un écran « nouvelle garantie » demanderait de rechoisir l'objet
  // qu'on a déjà sous les yeux.
  if (form.get("_action") === "garantie-creer") {
    const saisie = lireSaisieGarantie(form);
    if (!saisie.ok) return { erreur: saisie.message };
    await creerGarantie(propriete.id, Number(params.elementId), saisie.valeur);
    return redirect(`/proprietes/${propriete.id}/elements/${params.elementId}/modifier`);
  }

  if (form.get("_action") === "garantie-supprimer") {
    await supprimerGarantie(propriete.id, Number(form.get("garantieId")));
    return redirect(`/proprietes/${propriete.id}/elements/${params.elementId}/modifier`);
  }

  // Le coffre. Ce qui arrive ici est un libellé et un BLOC chiffré par le
  // navigateur : le serveur en vérifie la forme et l'écrit, il ne l'ouvre
  // jamais. Les deux gestes viennent d'un fetcher, d'où les 404 rendus.
  if (form.get("_action") === "secret-creer") {
    const saisie = lireSaisieSecret(form);
    if (!saisie.ok) return { erreur: saisie.message };
    const ecriture = await rendreLes404(() => creerSecret(propriete.id, Number(params.elementId), saisie.valeur));
    if ("refus" in ecriture) return ecriture.refus;
    return ecriture.resultat.ok ? { ok: true } : { erreur: ecriture.resultat.message };
  }

  if (form.get("_action") === "secret-supprimer") {
    const ecriture = await rendreLes404(() => supprimerSecret(propriete.id, Number(form.get("secretId"))));
    if ("refus" in ecriture) return ecriture.refus;
    return { ok: true };
  }

  const nom = String(form.get("nom") ?? "").trim();
  const typeIdBrut = String(form.get("typeId") ?? "").trim();
  const zoneId = Number(form.get("zoneId"));
  const systemeIdBrut = String(form.get("systemeId") ?? "");

  // Refusé et non replié sur 0, comme à la création : un formulaire amputé de
  // ce champ publierait la fiche au cran le plus ouvert.
  const niveau = lireNiveauSaisi(form.get("niveau"));

  if (!nom) return { erreur: "Le nom est obligatoire." };
  if (niveau === null) return { erreur: "Le niveau de visibilité est obligatoire." };
  if (!zoneId) return { erreur: "La zone est obligatoire." };
  if (!(await zoneAppartientALaPropriete(propriete.id, zoneId))) return { erreur: "Zone invalide." };

  let systemeId: number | null = null;
  if (systemeIdBrut) {
    systemeId = Number(systemeIdBrut);
    if (!(await systemeAppartientALaPropriete(propriete.id, systemeId))) return { erreur: "Système invalide." };
  }

  let type: Awaited<ReturnType<typeof chargerTypesDisponibles>>[number] | undefined;
  if (typeIdBrut) {
    const typesDisponibles = await chargerTypesDisponibles(propriete.id);
    type = typesDisponibles.find((t) => t.id === Number(typeIdBrut));
    if (!type) return { erreur: "Type invalide." };
  }

  let details: Record<string, unknown> | undefined;
  if (type) {
    const resultat = validerDetails(type.champs, extraireDetails(form, type.champs));
    if (!resultat.success) {
      return { erreur: `Détails invalides : ${resultat.error.issues.map((i) => i.message).join(", ")}` };
    }
    details = resultat.data;
  }

  await db.update(element).set({
    nom,
    typeId: type?.id ?? null,
    zoneId,
    systemeId,
    niveau,
    // `details` est laissé INTACT quand le type est retiré, et non vidé : c'est
    // la règle #5, celle d'un champ supprimé d'un type — on masque, on n'efface
    // jamais. Reposer le même type plus tard rend ses valeurs telles quelles.
    // Le formulaire n'affiche alors aucun champ, donc il n'en renvoie aucun :
    // écrire `{}` ici effacerait la saisie d'un simple passage par « sans type ».
    ...(details === undefined ? {} : { details }),
    majLe: new Date(),
  }).where(eq(element.id, Number(params.elementId)));

  return redirect(`/proprietes/${propriete.id}/elements`);
}

/** Le nom de la zone de l'objet, retrouvé dans l'arbre déjà chargé pour le
 *  sélecteur : pas de requête de plus pour un fil d'Ariane. */
function nomDeZone(arbre: Awaited<ReturnType<typeof chargerArbreZones>>, zoneId: number): string | undefined {
  const parcourir = (zones: ZoneAvecEnfants[]): string | undefined => {
    for (const z of zones) {
      if (z.id === zoneId) return z.nom;
      const dedans = parcourir(z.enfants);
      if (dedans) return dedans;
    }
    return undefined;
  };
  return parcourir([...arbre.arbre.flatMap((b) => b.niveaux.flatMap((n) => n.zones)), ...arbre.zonesExterieures]);
}

export default function ModifierElement() {
  const { propriete, element, types, arbre, systemes, photos, plans, evenements, garanties, coffre, secrets } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [typeId, setTypeId] = useState<number | null>(element.typeId);
  const typeChoisi = types.find((t) => t.id === typeId);

  const liens = liensPropriete(propriete.id);
  const nomZone = nomDeZone(arbre, element.zoneId);
  const nomSysteme = systemes.find((s) => s.id === element.systemeId)?.nom;

  return (
    <main>
      <p className="fiche-fil">
        <Link to={liens.zone(element.zoneId)} viewTransition>
          {nomZone ?? "Zone"}
        </Link>
      </p>
      <h1>{element.nom}</h1>
      <p className="fiche-type">
        <Echelle plafond={(element.niveau + 1) as 1 | 2 | 3 | 4} />
        <span>{[LIBELLES_NIVEAU[element.niveau], typeChoisi?.nom, nomSysteme].filter(Boolean).join(" · ")}</span>
      </p>

      <section className="fiche-photos">
        <p className="sous-titre">
          <span>Photos</span>
        </p>
        <ul className="galerie">
          {photos.map((photo) => (
            <li key={photo.id}>
              <a href={`/proprietes/${propriete.id}/fichiers/${photo.id}`}>
                <img src={`/proprietes/${propriete.id}/fichiers/${photo.id}?taille=vignette`} alt="" loading="lazy" />
              </a>
            </li>
          ))}
          <li>
            <Capture
              proprieteId={propriete.id}
              mode={{ elementId: element.id, elementNom: element.nom }}
              className="capture-declencheur galerie-ajout"
            >
              {photos.length === 0 ? "Ajouter une photo" : "+ photo"}
            </Capture>
          </li>
        </ul>
      </section>

      <section className="fiche-plans">
        <p className="sous-titre">
          <span>Sur le plan</span>
          {plans.length === 0 && (
            <Link to={`/proprietes/${propriete.id}/plans/nouveau`} viewTransition>
              Ajouter un plan
            </Link>
          )}
        </p>
        {plans.length === 0 ? (
          <p className="fiche-photos-vide">Aucun plan.</p>
        ) : (
          <ul className="filets fiche-plans-liste">
            {plans.map((p) => (
              <li key={p.id}>
                <span className="nom">{p.nom}</span>
                {p.pose && <span className="lieu">déjà posé</span>}
                <Link
                  to={`/proprietes/${propriete.id}/plans?plan=${p.id}&element=${element.id}`}
                  className="bouton-discret"
                  viewTransition
                >
                  {p.pose ? "Déplacer" : "Placer"}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="cote">La fiche</p>
      <Form method="post" className="formulaire">
        <label>
          Nom
          <input type="text" name="nom" defaultValue={element.nom} required />
        </label>
        <div className="formulaire-ligne">
          <label>
            Type
            <select
              name="typeId"
              value={typeId ?? ""}
              onChange={(e) => setTypeId(Number(e.target.value) || null)}
            >
              <option value="">— sans type —</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nom}
                  {t.origine === "perso" ? " (perso)" : ""}
                </option>
              ))}
            </select>
          </label>
          <ZoneSelector arbre={arbre} name="zoneId" defaultValue={element.zoneId} />
        </div>
        {/* Non contrôlé : ici la valeur est réelle, pas une suggestion —
            changer le type d'un objet déjà posé n'a pas à défaire le niveau
            qu'on lui a choisi. */}
        <ChoixNiveau
          valeur={element.niveau}
          aide="Comparé au plafond d'un lien de partage : un lien « usage » montre les objets de niveau public et usage, jamais ceux au-dessus."
        />
        <label>
          Système (optionnel)
          <select name="systemeId" defaultValue={element.systemeId ?? ""}>
            <option value="">—</option>
            {systemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nom}
              </option>
            ))}
          </select>
        </label>

        {typeChoisi && (
          <>
            <p className="cote">Champs du type</p>
            <DynamicElementFields champs={typeChoisi.champs} valeurs={element.details as Record<string, unknown>} />
          </>
        )}

        {actionData?.erreur && (
          <p role="alert" className="message-erreur">
            {actionData.erreur}
          </p>
        )}
        <div className="formulaire-actions">
          <button type="submit">Enregistrer</button>
        </div>
      </Form>

      <section className="bloc">
        <p className="sous-titre">
          <span>Historique</span>
          <Link to={`/proprietes/${propriete.id}/evenements/nouveau`} viewTransition>
            Ajouter un événement
          </Link>
        </p>
        <Chronologie evenements={evenements} liens={liens} vide="Rien n'est consigné sur cet objet." />
      </section>

      <section className="fiche-garanties bloc">
        <p className="sous-titre">
          <span>Garanties</span>
        </p>
        {garanties.length === 0 ? (
          <p className="fiche-photos-vide">Aucune garantie consignée.</p>
        ) : (
          <ul className="filets fiche-garanties-liste">
            {garanties.map((g) => (
              <li key={g.id} className={g.expiree ? "garantie-expiree" : undefined}>
                <Link to={`/proprietes/${propriete.id}/garanties/${g.id}/modifier`} className="nom" viewTransition>
                  {g.fin ? `Jusqu'au ${jourLisible(g.fin)}` : "Sans terme connu"}
                  {/* Un fait, pas un jugement : une garantie expirée reste
                      affichée, savoir qu'elle l'est est justement l'intérêt. */}
                  {g.expiree ? " · expirée" : ""}
                </Link>
                <span className="lieu">
                  depuis le {jourLisible(g.debut)}
                  {g.reference ? ` · ${g.reference}` : ""}
                </span>
                <Form method="post">
                  <input type="hidden" name="_action" value="garantie-supprimer" />
                  <input type="hidden" name="garantieId" value={g.id} />
                  <button type="submit" className="bouton-discret">
                    Retirer
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}

        <Form method="post" className="formulaire">
          <input type="hidden" name="_action" value="garantie-creer" />
          <div className="formulaire-ligne">
            <label>
              Début
              <input type="date" name="debut" required />
            </label>
            <label>
              Fin (optionnelle)
              <input type="date" name="fin" />
            </label>
          </div>
          <label>
            Référence (optionnelle)
            <input type="text" name="reference" />
            {/* La référence ne sort d'aucun lien de partage : c'est du texte
                libre, même famille de fuite que le nom d'un plan. */}
            <span className="champ-aide">Un lien de partage voit la date de fin, jamais la référence.</span>
          </label>
          <div className="formulaire-actions">
            <button type="submit" className="bouton-trait">
              Ajouter la garantie
            </button>
          </div>
        </Form>
      </section>

      {/* Une seule section par écran : deux instances ne partageraient pas
          leur état, et la phrase tapée dans l'une ne servirait pas l'autre. */}
      <SectionCoffre proprieteId={propriete.id} coffre={coffre} secrets={secrets} />

      <div className="formulaire-danger">
        <Form method="post">
          <input type="hidden" name="_action" value="supprimer" />
          <button type="submit" className="bouton-discret">
            Supprimer l'élément
          </button>
        </Form>
      </div>
    </main>
  );
}
