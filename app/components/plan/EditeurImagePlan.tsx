// app/components/plan/EditeurImagePlan.tsx
// Redresser et recadrer un plan avant de l'envoyer. Le propriétaire
// photographie un plan posé sur une table : il coupe les bords et rattrape
// quelques degrés.
//
// Ce que cet écran ne fait PAS : la correction de perspective à quatre coins.
// Un plan photographié de biais reste trapézoïdal, et c'est dit à l'écran
// plutôt que sous-entendu. Le plan sert de fond pour pointer, pas pour
// mesurer (`plan.echelle` reste NULL), et une homographie achèterait une
// précision que rien ne consomme.
//
// Il ne découpe pas non plus l'image lui-même : il envoie les octets d'origine
// et quatre nombres. `sharp` fait la coupe côté serveur, ce qui n'encode
// qu'une seule fois — sur du trait fin, une génération de JPEG en plus se
// voit — et rend le résultat vérifiable sans navigateur.
import { useEffect, useRef, useState } from "react";
import { LARGEUR_MAX_PLAN } from "../../lib/plans/types";

const APERCU_MAX = 900;
const ROTATION_FINE = 15;

export type Preparation = {
  fichier: Blob;
  nomFichier: string;
  rotation: number;
  recadrage: { x: number; y: number; largeur: number; hauteur: number };
};

type Source = { blob: Blob; nom: string; image: ImageBitmap; largeur: number; hauteur: number };

const CADRE_ENTIER = { x: 0, y: 0, largeur: 100, hauteur: 100 };
const borner = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Boîte englobante d'une image pivotée : la même formule que celle de sharp. */
function englobante(largeur: number, hauteur: number, degres: number) {
  const r = (degres * Math.PI) / 180;
  return {
    largeur: Math.abs(largeur * Math.cos(r)) + Math.abs(hauteur * Math.sin(r)),
    hauteur: Math.abs(largeur * Math.sin(r)) + Math.abs(hauteur * Math.cos(r)),
  };
}

export function EditeurImagePlan({ onChange }: { onChange: (p: Preparation | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  // Deux réglages distincts plutôt qu'un angle unique : les quarts de tour
  // remettent un plan à l'endroit, le réglage fin rattrape la photo prise de
  // travers. Les mélanger rendrait la glissière illisible.
  const [quarts, setQuarts] = useState(0);
  const [fin, setFin] = useState(0);
  const [cadre, setCadre] = useState(CADRE_ENTIER);
  const [etat, setEtat] = useState<string | null>(null);
  const rotation = quarts * 90 + fin;

  async function choisir(fichier: File | undefined) {
    if (!fichier) return;
    setEtat("Lecture…");
    try {
      let blob: Blob = fichier;
      let nom = fichier.name;

      if (fichier.type === "application/pdf") {
        // Import dynamique et gardé par le type : pdf.js ne pèse sur personne
        // tant qu'aucun PDF n'est ouvert.
        const { rasteriserPdf } = await import("../../lib/plans/pdf");
        blob = await rasteriserPdf(fichier);
        nom = fichier.name.replace(/\.pdf$/i, "") + ".png";
      }

      // `imageOrientation: "from-image"` applique l'orientation EXIF, comme
      // `sharp.rotate()` le fera côté serveur : sans ça, l'aperçu et le
      // résultat ne parleraient pas de la même image.
      const image = await createImageBitmap(blob, { imageOrientation: "from-image" });
      setSource({ blob, nom, image, largeur: image.width, hauteur: image.height });
      setQuarts(0);
      setFin(0);
      setCadre(CADRE_ENTIER);
      setEtat(null);
    } catch (erreur) {
      setSource(null);
      onChange(null);
      setEtat(erreur instanceof Error ? erreur.message : "Ce fichier n'a pas pu être lu.");
    }
  }

  // L'aperçu est dessiné à la boîte englobante, comme le fera sharp : le
  // rectangle de recadrage est donc exprimé dans le même repère des deux
  // côtés, et ce qu'on voit est ce qui sera enregistré.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;

    const boite = englobante(source.largeur, source.hauteur, rotation);
    const facteur = Math.min(1, APERCU_MAX / Math.max(boite.largeur, boite.hauteur));
    canvas.width = Math.max(1, Math.round(boite.largeur * facteur));
    canvas.height = Math.max(1, Math.round(boite.hauteur * facteur));

    const contexte = canvas.getContext("2d");
    if (!contexte) return;
    contexte.fillStyle = "#ffffff";
    contexte.fillRect(0, 0, canvas.width, canvas.height);
    contexte.save();
    contexte.translate(canvas.width / 2, canvas.height / 2);
    contexte.rotate((rotation * Math.PI) / 180);
    contexte.scale(facteur, facteur);
    contexte.drawImage(source.image, -source.largeur / 2, -source.hauteur / 2);
    contexte.restore();
  }, [source, rotation]);

  useEffect(() => {
    if (!source) return;
    onChange({ fichier: source.blob, nomFichier: source.nom, rotation, recadrage: cadre });
    // `onChange` change d'identité à chaque rendu du parent ; le suivre
    // relancerait la boucle sur lui-même.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, rotation, cadre]);

  // Le recadrage : on glisse un coin, ou l'intérieur du cadre.
  const cadreRef = useRef<HTMLDivElement>(null);
  const prise = useRef<{ coin: string; x: number; y: number; depart: typeof CADRE_ENTIER } | null>(null);

  function enPourcentage(e: React.PointerEvent) {
    const r = cadreRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }

  function saisir(coin: string) {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      const p = enPourcentage(e);
      if (!p) return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      prise.current = { coin, x: p.x, y: p.y, depart: cadre };
    };
  }

  function glisser(e: React.PointerEvent) {
    // Tout est lu ICI, jamais dans l'argument de `setCadre` : un updater est
    // exécuté par React pendant le rendu, et `prise` a alors déjà pu être
    // remise à zéro par le relâchement du pointeur.
    const en = prise.current;
    if (!en) return;
    const p = enPourcentage(e);
    if (!p) return;

    const dx = p.x - en.x;
    const dy = p.y - en.y;
    const d = en.depart;

    if (en.coin === "interieur") {
      setCadre({
        ...d,
        x: borner(d.x + dx, 0, 100 - d.largeur),
        y: borner(d.y + dy, 0, 100 - d.hauteur),
      });
      return;
    }

    // Un cadre ne se retourne pas : chaque bord tiré s'arrête à 5 % de
    // l'autre, sinon la largeur passerait négative.
    const gauche = en.coin.includes("g");
    const haut = en.coin.includes("h");
    const x1 = gauche ? borner(d.x + dx, 0, d.x + d.largeur - 5) : d.x;
    const y1 = haut ? borner(d.y + dy, 0, d.y + d.hauteur - 5) : d.y;
    const x2 = gauche ? d.x + d.largeur : borner(d.x + d.largeur + dx, d.x + 5, 100);
    const y2 = haut ? d.y + d.hauteur : borner(d.y + d.hauteur + dy, d.y + 5, 100);
    setCadre({ x: x1, y: y1, largeur: x2 - x1, hauteur: y2 - y1 });
  }

  return (
    <div className="editeur-plan">
      <label className="editeur-fichier">
        Image du plan (photo, capture d'écran ou PDF)
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => void choisir(e.target.files?.[0])}
          required
        />
      </label>

      {etat && <p role="alert">{etat}</p>}

      {source && (
        <>
          <div className="editeur-apercu" ref={cadreRef} onPointerMove={glisser} onPointerUp={() => (prise.current = null)}>
            <canvas ref={canvasRef} className="editeur-canevas" />
            <div
              className="editeur-cadre"
              style={{
                left: `${cadre.x}%`,
                top: `${cadre.y}%`,
                width: `${cadre.largeur}%`,
                height: `${cadre.hauteur}%`,
              }}
              onPointerDown={saisir("interieur")}
            >
              {["hg", "hd", "bg", "bd"].map((coin) => (
                <span key={coin} className={`editeur-poignee editeur-poignee-${coin}`} onPointerDown={saisir(coin)} />
              ))}
            </div>
          </div>

          <div className="editeur-outils">
            <button type="button" className="bouton-discret" onClick={() => setQuarts((q) => (q + 3) % 4)}>
              ⟲ Quart de tour
            </button>
            <button type="button" className="bouton-discret" onClick={() => setQuarts((q) => (q + 1) % 4)}>
              ⟳ Quart de tour
            </button>
            <label className="editeur-angle">
              Redresser
              <input
                type="range"
                min={-ROTATION_FINE}
                max={ROTATION_FINE}
                step={0.5}
                value={fin}
                onChange={(e) => setFin(Number(e.target.value))}
              />
              <span className="selecteur-secondaire">{Math.round(rotation * 10) / 10}°</span>
            </label>
            <button type="button" className="bouton-discret" onClick={() => setCadre(CADRE_ENTIER)}>
              Tout garder
            </button>
          </div>

          <p className="editeur-note">
            La rotation redresse de quelques degrés. Une photo prise de biais reste déformée : aucune correction de
            perspective n'est appliquée. Le plan est enregistré à {LARGEUR_MAX_PLAN} px de large au maximum.
          </p>
        </>
      )}
    </div>
  );
}
