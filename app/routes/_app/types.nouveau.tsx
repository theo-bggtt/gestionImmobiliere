// app/routes/_app/types.nouveau.tsx
import { Form, redirect, useActionData } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { db } from "../../db/client";
import { typeElement } from "../../db/schema/index";
import { requireUtilisateurId } from "../../lib/auth/session.server";
import { requireProprieteAccess } from "../../lib/db/proprieteAccess.server";
import { ChampEditor } from "../../components/ChampEditor";

const champDefinitionSchema = z
  .object({
    cle: z.string().min(1),
    label: z.string().min(1),
    genre: z.enum(["texte", "nombre", "date", "booleen", "choix", "fichier"]),
    unite: z.string().optional(),
    niveauMin: z.number().int().min(0).max(3),
    obligatoire: z.boolean(),
    options: z.array(z.string()).optional(),
  })
  .refine((c) => c.genre !== "choix" || (c.options && c.options.length > 0), {
    message: "Un champ de genre 'choix' doit définir au moins une option.",
  });

export async function action({ request, params }: ActionFunctionArgs) {
  const utilisateurId = await requireUtilisateurId(request);
  const propriete = await requireProprieteAccess(utilisateurId, params.proprieteId);
  const form = await request.formData();

  const nom = String(form.get("nom") ?? "").trim();
  const icone = String(form.get("icone") ?? "").trim() || null;
  const alias = String(form.get("alias") ?? "").split(",").map((a) => a.trim()).filter(Boolean);

  if (!nom) return { erreur: "Le nom est obligatoire." };

  let champsBruts: unknown;
  try {
    champsBruts = JSON.parse(String(form.get("champs") ?? "[]"));
  } catch {
    return { erreur: "Champs invalides." };
  }

  const resultat = z.array(champDefinitionSchema).safeParse(champsBruts);
  if (!resultat.success) {
    return { erreur: `Champs invalides : ${resultat.error.issues.map((i) => i.message).join(", ")}` };
  }

  const cles = resultat.data.map((c) => c.cle);
  if (new Set(cles).size !== cles.length) {
    return { erreur: "Deux champs ne peuvent pas partager la même clé." };
  }

  await db.insert(typeElement).values({
    proprieteId: propriete.id,
    nom,
    icone,
    origine: "perso",
    champs: resultat.data,
    alias,
  });

  return redirect(`/proprietes/${propriete.id}/elements/nouveau`);
}

export default function NouveauTypePerso() {
  const actionData = useActionData<typeof action>();
  return (
    <main>
      <h1>Créer un type personnalisé</h1>
      <Form method="post">
        <label>
          Nom
          <input type="text" name="nom" required placeholder="Adoucisseur d'eau..." />
        </label>
        <label>
          Icône (optionnel)
          <input type="text" name="icone" />
        </label>
        <label>
          Alias (séparés par des virgules)
          <input type="text" name="alias" placeholder="adoucisseur, filtre à eau" />
        </label>
        <ChampEditor />
        {actionData?.erreur && <p role="alert">{actionData.erreur}</p>}
        <button type="submit">Créer le type</button>
      </Form>
    </main>
  );
}
