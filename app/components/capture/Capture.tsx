// app/components/capture/Capture.tsx
// Le flux de capture entier : déclencheur → viseur → feuille de confirmation.
// Aucune navigation entre les deux : un changement de route perdrait le File
// et coûterait un aller-retour serveur qu'on n'a pas à la cave.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { ajouterEnFile, type CibleCapture } from "../../lib/capture/file";
import { compresser, type PhotoCompressee } from "../../lib/capture/image";
import { chargerInstantane, instantaneEnMemoire } from "../../lib/capture/instantane";
import { envoyerFile, souscrire } from "../../lib/capture/synchro";
import type { InstantaneCapture } from "../../lib/capture/types";
import { Selecteur, type OptionSelecteur } from "./Selecteur";

export type ModeCapture = "nouveau" | "existant" | { elementId: number; elementNom: string };

type Panneau = null | "zone" | "type" | "element";
type EtatCompression = { etat: "encours" } | { etat: "ok"; octets: number } | { etat: "erreur"; message: string };

function identifiant(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const octets = crypto.getRandomValues(new Uint8Array(16));
  return [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
}

function typeSuggere(instantane: InstantaneCapture, zoneId: number | null): number | null {
  const connus = new Set(instantane.types.map((t) => t.id));
  const dansLaZone = zoneId === null ? [] : (instantane.typesParZone[String(zoneId)] ?? []);
  return (
    dansLaZone.find((id) => connus.has(id)) ??
    instantane.typesRecents.find((id) => connus.has(id)) ??
    instantane.types[0]?.id ??
    null
  );
}

export function Capture({
  proprieteId,
  mode,
  className,
  children,
}: {
  proprieteId: number;
  mode: ModeCapture;
  className?: string;
  children: React.ReactNode;
}) {
  const idInput = useId();
  const cibleFixe = typeof mode === "object" ? mode : null;

  const [instantane, setInstantane] = useState<InstantaneCapture | null>(() => instantaneEnMemoire(proprieteId) ?? null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [compression, setCompression] = useState<EtatCompression>({ etat: "encours" });
  const compressionRef = useRef<Promise<PhotoCompressee> | null>(null);

  const [zoneId, setZoneId] = useState<number | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [typeManuel, setTypeManuel] = useState(false);
  const [elementId, setElementId] = useState<number | null>(cibleFixe?.elementId ?? null);
  const [nomEdite, setNomEdite] = useState<string | null>(null);
  const [panneau, setPanneau] = useState<Panneau>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const [confirmation, setConfirmation] = useState<{ captureId: string; nom: string } | null>(null);
  const [elementConfirme, setElementConfirme] = useState<number | null>(null);

  useEffect(() => {
    void chargerInstantane(proprieteId).then((i) => i && setInstantane(i));
  }, [proprieteId]);

  // Le lien « compléter » ne peut pointer sur une fiche qu'une fois le
  // serveur passé : hors ligne il annonce l'attente au lieu de mentir.
  useEffect(() => {
    if (!confirmation) return;
    return souscrire((e) => {
      const id = e.resolus[confirmation.captureId];
      if (id) setElementConfirme(id);
    });
  }, [confirmation]);

  useEffect(() => {
    if (!confirmation) return;
    const minuteur = setTimeout(() => setConfirmation(null), 8000);
    return () => clearTimeout(minuteur);
  }, [confirmation]);

  const zone = instantane?.zones.find((z) => z.id === zoneId) ?? null;
  const type = instantane?.types.find((t) => t.id === typeId) ?? null;
  const elementNom = cibleFixe?.elementNom ?? instantane?.elements.find((e) => e.id === elementId)?.nom ?? null;
  const nomPropose = type && zone ? `${type.nom} — ${zone.nom}` : "";
  const nom = nomEdite ?? nomPropose;

  function fermer() {
    if (apercu) URL.revokeObjectURL(apercu);
    setPhoto(null);
    setApercu(null);
    setPanneau(null);
    setNomEdite(null);
    setTypeManuel(false);
    setEnregistrement(false);
    compressionRef.current = null;
  }

  async function auChoixPhoto(evenement: React.ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0];
    // Réarmer l'input : sans ça, reprendre la même photo ne redéclenche rien.
    evenement.target.value = "";
    if (!fichier) return;

    setPhoto(fichier);
    setApercu(URL.createObjectURL(fichier));
    setCompression({ etat: "encours" });

    // La compression tourne pendant que l'utilisateur confirme : elle ne doit
    // jamais être sur le chemin critique des 30 secondes.
    const travail = compresser(fichier);
    compressionRef.current = travail;
    travail.then(
      (r) => setCompression({ etat: "ok", octets: r.blob.size }),
      (e) => setCompression({ etat: "erreur", message: e instanceof Error ? e.message : String(e) }),
    );

    const inst = instantane ?? (await chargerInstantane(proprieteId)) ?? null;
    if (inst) setInstantane(inst);

    if (mode === "existant") {
      setPanneau("element");
      return;
    }
    if (cibleFixe || !inst) return;

    const connues = new Set(inst.zones.map((z) => z.id));
    const memorisee = Number(localStorage.getItem(`derniereZone:${proprieteId}`));
    const zoneDefaut =
      (connues.has(memorisee) ? memorisee : undefined) ??
      inst.zonesRecentes.find((id) => connues.has(id)) ??
      inst.zones[0]?.id ??
      null;
    setZoneId(zoneDefaut);
    setTypeId(typeSuggere(inst, zoneDefaut));
  }

  async function enregistrer() {
    if (!photo || !compressionRef.current || enregistrement) return;
    setEnregistrement(true);
    try {
      const compressee = await compressionRef.current;
      const cible: CibleCapture =
        mode === "nouveau"
          ? { genre: "nouveau" }
          : { genre: "element", elementId: elementId!, elementNom: elementNom ?? "" };

      const captureId = identifiant();
      await ajouterEnFile({
        id: captureId,
        proprieteId,
        cible,
        zoneId: mode === "nouveau" ? zoneId : null,
        typeId: mode === "nouveau" ? typeId : null,
        nom,
        photo: compressee.blob,
        octets: compressee.blob.size,
        datePrise: photo.lastModified,
        creeLe: Date.now(),
        tentatives: 0,
        echec: null,
      });

      if (mode === "nouveau" && zoneId !== null) {
        localStorage.setItem(`derniereZone:${proprieteId}`, String(zoneId));
      }

      const libelle = mode === "nouveau" ? nom : `Photo — ${elementNom ?? "objet"}`;
      fermer();
      setElementConfirme(mode === "nouveau" ? null : (elementId ?? null));
      setConfirmation({ captureId, nom: libelle });
      void envoyerFile();
    } catch (e) {
      setCompression({ etat: "erreur", message: e instanceof Error ? e.message : String(e) });
      setEnregistrement(false);
    }
  }

  const pretAEnregistrer =
    compression.etat !== "erreur" &&
    (mode === "nouveau" ? zoneId !== null && typeId !== null : elementId !== null);

  // Les listes remontent le récent en premier ; le tri de tableau étant
  // stable, tout ce qui n'a jamais servi garde son ordre d'arborescence.
  const rangeur = (ordre: number[]) => (id: number) => {
    const i = ordre.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  const optionsZones: OptionSelecteur[] = instantane
    ? [...instantane.zones]
        .sort((a, b) => rangeur(instantane.zonesRecentes)(a.id) - rangeur(instantane.zonesRecentes)(b.id))
        .map((z) => ({ id: z.id, principal: z.nom, secondaire: z.chemin }))
    : [];

  const optionsTypes: OptionSelecteur[] = instantane
    ? (() => {
        const position = rangeur([...(instantane.typesParZone[String(zoneId)] ?? []), ...instantane.typesRecents]);
        return [...instantane.types]
          .sort((a, b) => position(a.id) - position(b.id))
          .map((t) => ({ id: t.id, principal: t.nom, secondaire: t.alias.join(" · "), motsCles: t.alias }));
      })()
    : [];

  const optionsElements: OptionSelecteur[] = instantane
    ? instantane.elements.map((e) => ({ id: e.id, principal: e.nom, secondaire: e.zoneNom }))
    : [];

  return (
    <>
      {/* Le viseur doit s'ouvrir sur le geste lui-même : un `label` porte le
          clic natif jusqu'à l'input, là où un handler après navigation
          perdrait le geste utilisateur et serait bloqué par Safari. */}
      <label className={className} htmlFor={idInput}>
        {children}
        <input
          id={idInput}
          className="capture-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={auChoixPhoto}
        />
      </label>

      {photo &&
        createPortal(
          <div className="feuille-fond" role="dialog" aria-modal="true" aria-label="Confirmer la capture">
            <div className="feuille">
              {panneau === "zone" && (
                <Selecteur
                  titre="Zone"
                  options={optionsZones}
                  valeur={zoneId}
                  onFermer={() => setPanneau(null)}
                  onChoisir={(id) => {
                    setZoneId(id);
                    if (!typeManuel && instantane) setTypeId(typeSuggere(instantane, id));
                    setPanneau(null);
                  }}
                />
              )}
              {panneau === "type" && (
                <Selecteur
                  titre="Type"
                  options={optionsTypes}
                  valeur={typeId}
                  onFermer={() => setPanneau(null)}
                  onChoisir={(id) => {
                    setTypeId(id);
                    setTypeManuel(true);
                    setPanneau(null);
                  }}
                />
              )}
              {panneau === "element" && (
                <Selecteur
                  titre="Objet"
                  options={optionsElements}
                  valeur={elementId}
                  onFermer={() => (elementId === null ? fermer() : setPanneau(null))}
                  onChoisir={(id) => {
                    setElementId(id);
                    setPanneau(null);
                  }}
                />
              )}

              {panneau === null && (
                <>
                  <div className="feuille-photo">
                    {apercu && <img src={apercu} alt="" />}
                  </div>

                  {mode === "nouveau" ? (
                    <>
                      <div className="feuille-lignes">
                        <button type="button" className="ligne" onClick={() => setPanneau("zone")}>
                          <span className="ligne-cle">Zone</span>
                          <span className="ligne-valeur">{zone?.nom ?? "à choisir"}</span>
                        </button>
                        <button type="button" className="ligne" onClick={() => setPanneau("type")}>
                          <span className="ligne-cle">Type</span>
                          <span className="ligne-valeur">{type?.nom ?? "à choisir"}</span>
                        </button>
                      </div>
                      {nomEdite === null ? (
                        <button type="button" className="feuille-nom" onClick={() => setNomEdite(nomPropose)}>
                          {nomPropose || "sans nom"} <span aria-hidden="true">✎</span>
                        </button>
                      ) : (
                        <input
                          className="feuille-nom-champ"
                          type="text"
                          value={nomEdite}
                          autoFocus
                          onChange={(e) => setNomEdite(e.target.value)}
                          aria-label="Nom de la fiche"
                        />
                      )}
                    </>
                  ) : (
                    <div className="feuille-lignes">
                      <button
                        type="button"
                        className="ligne"
                        onClick={() => setPanneau("element")}
                        disabled={Boolean(cibleFixe)}
                      >
                        <span className="ligne-cle">Objet</span>
                        <span className="ligne-valeur">{elementNom ?? "à choisir"}</span>
                      </button>
                    </div>
                  )}

                  {compression.etat === "erreur" && (
                    <p className="feuille-erreur" role="alert">
                      Photo inexploitable : {compression.message}
                    </p>
                  )}

                  <div className="feuille-actions">
                    <button
                      type="button"
                      className="bouton-primaire"
                      onClick={enregistrer}
                      disabled={!pretAEnregistrer || enregistrement}
                    >
                      {enregistrement ? "Enregistrement…" : "Enregistrer"}
                    </button>
                    <button type="button" className="bouton-discret" onClick={fermer}>
                      Annuler
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}

      {confirmation &&
        createPortal(
          <div className="confirmation" role="status">
            <span className="confirmation-texte">{confirmation.nom}</span>
            {elementConfirme ? (
              <Link
                to={`/proprietes/${proprieteId}/elements/${elementConfirme}/modifier`}
                onClick={() => setConfirmation(null)}
              >
                Compléter
              </Link>
            ) : (
              <span className="confirmation-attente">envoi en attente</span>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
