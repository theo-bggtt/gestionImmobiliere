// app/components/plan/VuePlan.tsx
// Le plan interactif du propriétaire : zoom, déplacement, regroupement des
// points quand on dézoome. Sans bibliothèque — `transform` CSS et les
// événements pointeur suffisent, pincer-zoomer compris, et une dépendance de
// plus pour ça se paierait sur chaque chargement.
//
// La page de partage ne rend PAS ce composant : elle n'exécute aucun script
// et sert `PlanStatique`. Les deux ne partagent que la feuille de style.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { regrouper } from "../../lib/plans/regroupement";
import { centre, SOMMETS_MAX, SOMMETS_MIN } from "../../lib/plans/geometrie";
import type { PointPlan, PolygoneZone, Sommet } from "../../lib/plans/types";
import type { Liens } from "../recherche/liens";

const ECHELLE_MIN = 1;
const ECHELLE_MAX = 8;
// Au-delà, un appui sur une pastille est un glissement et non un clic : sans
// ce seuil, le moindre tremblement de doigt déplacerait l'objet au lieu
// d'ouvrir sa fiche.
const SEUIL_GLISSEMENT = 4;

type Vue = { echelle: number; tx: number; ty: number };

const borner = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Le tracé d'un contour. L'état vit dans l'écran et non ici : la vue reçoit
 * les sommets déjà posés et signale les clics, elle ne décide de rien — même
 * découpage que `placement`. Deux modes exclusifs, et l'écran s'en assure :
 * poser un objet et tracer une zone sont deux sens différents pour le même
 * clic sur le fond.
 */
export type Tracage = {
  zoneNom: string;
  sommets: Sommet[];
  onSommet: (x: number, y: number) => void;
  onDefaire: () => void;
  onTerminer: () => void;
  onAbandonner: () => void;
};

export function VuePlan({
  imageUrl,
  points,
  polygones,
  liens,
  placement,
  tracage,
  onPoser,
  onDeplacer,
  onRetirer,
}: {
  imageUrl: string;
  points: PointPlan[];
  polygones: PolygoneZone[];
  liens: Liens;
  /** Renseigné quand on arrive depuis une fiche : le clic pose l'objet. */
  placement?: { elementId: number; elementNom: string } | null;
  /** Renseigné pendant un tracé : le clic ajoute un sommet. */
  tracage?: Tracage | null;
  onPoser: (x: number, y: number) => void;
  onDeplacer: (pointId: number, x: number, y: number) => void;
  onRetirer: (pointId: number) => void;
}) {
  const cadreRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [vue, setVue] = useState<Vue>({ echelle: 1, tx: 0, ty: 0 });
  const [base, setBase] = useState({ largeur: 0, hauteur: 0 });
  const [deplie, setDeplie] = useState<string | null>(null);
  const [glisse, setGlisse] = useState<{ pointId: number; x: number; y: number } | null>(null);
  // Le même état en référence : un `pointermove` peut arriver avant que React
  // n'ait rendu, et le gestionnaire lirait alors un `glisse` encore nul.
  const glisseRef = useRef<{ pointId: number; x: number; y: number; departX: number; departY: number } | null>(null);

  // Les pointeurs actifs : un seul déplace, deux pincent.
  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const depart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const ecart = useRef<{ distance: number; echelle: number } | null>(null);
  const aGlisse = useRef(false);

  // La taille observée est celle de la boîte de mise en page, que `transform`
  // ne modifie pas : la taille à l'écran s'en déduit par l'échelle.
  useEffect(() => {
    const image = imageRef.current;
    if (!image || typeof ResizeObserver === "undefined") return;
    const observateur = new ResizeObserver(([entree]) => {
      const r = entree.contentRect;
      setBase({ largeur: r.width, hauteur: r.height });
    });
    observateur.observe(image);
    return () => observateur.disconnect();
  }, []);

  const grappes = useMemo(
    () => regrouper(points, base.largeur * vue.echelle, base.hauteur * vue.echelle),
    [points, base.largeur, base.hauteur, vue.echelle],
  );

  /** Coordonnées d'un événement en pourcentage de l'image, zoom et déplacement compris. */
  function enPourcentage(e: { clientX: number; clientY: number }) {
    const r = imageRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return null;
    return {
      x: borner(((e.clientX - r.left) / r.width) * 100, 0, 100),
      y: borner(((e.clientY - r.top) / r.height) * 100, 0, 100),
    };
  }

  function zoomer(facteur: number, versX?: number, versY?: number) {
    setVue((v) => {
      const echelle = borner(v.echelle * facteur, ECHELLE_MIN, ECHELLE_MAX);
      const r = cadreRef.current?.getBoundingClientRect();
      if (!r) return { ...v, echelle };
      // Zoomer sous le doigt : le point visé garde sa place à l'écran.
      const px = (versX ?? r.left + r.width / 2) - r.left;
      const py = (versY ?? r.top + r.height / 2) - r.top;
      const rapport = echelle / v.echelle;
      return {
        echelle,
        tx: px - (px - v.tx) * rapport,
        ty: py - (py - v.ty) * rapport,
      };
    });
  }

  function onPointerDownCadre(e: React.PointerEvent) {
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.target as Element).setPointerCapture?.(e.pointerId);
    aGlisse.current = false;

    if (pointeurs.current.size === 2) {
      const [a, b] = [...pointeurs.current.values()];
      ecart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), echelle: vue.echelle };
      depart.current = null;
    } else {
      depart.current = { x: e.clientX, y: e.clientY, tx: vue.tx, ty: vue.ty };
    }
  }

  function onPointerMoveCadre(e: React.PointerEvent) {
    // Le déplacement d'un point se traite avant tout : son `pointerdown` a
    // arrêté la propagation vers le cadre, donc ce pointeur n'est pas dans le
    // registre du déplacement de vue.
    const enCours = glisseRef.current;
    if (enCours) {
      const p = enPourcentage(e);
      if (!p) return;
      // Sous le seuil, c'est un clic qui tremble : on ne bouge pas le point,
      // et le lien vers la fiche reste ouvrable.
      if (Math.hypot(e.clientX - enCours.departX, e.clientY - enCours.departY) > SEUIL_GLISSEMENT) {
        aGlisse.current = true;
      }
      if (!aGlisse.current) return;
      glisseRef.current = { ...enCours, ...p };
      setGlisse({ pointId: enCours.pointId, ...p });
      return;
    }

    if (!pointeurs.current.has(e.pointerId)) return;
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointeurs.current.size === 2 && ecart.current) {
      const [a, b] = [...pointeurs.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const r = cadreRef.current?.getBoundingClientRect();
      const echelle = borner(
        (ecart.current.echelle * distance) / ecart.current.distance,
        ECHELLE_MIN,
        ECHELLE_MAX,
      );
      setVue((v) => {
        if (!r) return { ...v, echelle };
        const px = (a.x + b.x) / 2 - r.left;
        const py = (a.y + b.y) / 2 - r.top;
        const rapport = echelle / v.echelle;
        return { echelle, tx: px - (px - v.tx) * rapport, ty: py - (py - v.ty) * rapport };
      });
      return;
    }

    if (depart.current) {
      const dx = e.clientX - depart.current.x;
      const dy = e.clientY - depart.current.y;
      if (Math.hypot(dx, dy) > SEUIL_GLISSEMENT) aGlisse.current = true;
      setVue((v) => ({ ...v, tx: depart.current!.tx + dx, ty: depart.current!.ty + dy }));
    }
  }

  function onPointerUpCadre(e: React.PointerEvent) {
    pointeurs.current.delete(e.pointerId);
    if (pointeurs.current.size < 2) ecart.current = null;
    if (pointeurs.current.size === 0) depart.current = null;

    const enCours = glisseRef.current;
    if (enCours) {
      // Un point relâché où il a été pris n'a pas bougé : rien à enregistrer.
      if (aGlisse.current) onDeplacer(enCours.pointId, enCours.x, enCours.y);
      glisseRef.current = null;
      setGlisse(null);
    }
  }

  function onClicCadre(e: React.MouseEvent) {
    // Un clic qui a glissé est un déplacement de vue, jamais une saisie.
    if (aGlisse.current) return;
    const p = enPourcentage(e);
    if (!p) return;

    // Les deux modes sont exclusifs, et l'écran le garantit ; l'ordre ici ne
    // fait que le rendre inoffensif si un jour il ne l'était plus.
    if (tracage) {
      if (tracage.sommets.length < SOMMETS_MAX) tracage.onSommet(p.x, p.y);
      return;
    }
    // En dehors du placement et du tracé, le fond ne sert qu'à déplacer la vue.
    if (placement) onPoser(p.x, p.y);
  }

  return (
    <div className="plan-vue">
      <div className="plan-outils">
        <button type="button" className="bouton-discret" onClick={() => zoomer(1.4)} aria-label="Zoomer">
          +
        </button>
        <button type="button" className="bouton-discret" onClick={() => zoomer(1 / 1.4)} aria-label="Dézoomer">
          −
        </button>
        <button type="button" className="bouton-discret" onClick={() => setVue({ echelle: 1, tx: 0, ty: 0 })}>
          Vue entière
        </button>
        {placement && !tracage && (
          <span className="plan-placement">
            Touchez le plan pour poser <strong>{placement.elementNom}</strong>
          </span>
        )}

        {tracage && (
          <>
            <span className="plan-placement">
              Contour de <strong>{tracage.zoneNom}</strong> — {tracage.sommets.length} point
              {tracage.sommets.length > 1 ? "s" : ""}
              {tracage.sommets.length < SOMMETS_MIN
                ? ` (${SOMMETS_MIN} minimum)`
                : tracage.sommets.length >= SOMMETS_MAX
                  ? " (maximum atteint)"
                  : ""}
            </span>
            <button
              type="button"
              className="bouton-discret"
              onClick={tracage.onDefaire}
              disabled={tracage.sommets.length === 0}
            >
              Annuler le dernier point
            </button>
            <button type="button" onClick={tracage.onTerminer} disabled={tracage.sommets.length < SOMMETS_MIN}>
              Terminer le contour
            </button>
            <button type="button" className="bouton-discret" onClick={tracage.onAbandonner}>
              Abandonner
            </button>
          </>
        )}
      </div>

      <div
        ref={cadreRef}
        className={placement || tracage ? "plan-cadre plan-cadre-placement" : "plan-cadre"}
        onPointerDown={onPointerDownCadre}
        onPointerMove={onPointerMoveCadre}
        onPointerUp={onPointerUpCadre}
        onPointerCancel={onPointerUpCadre}
        onClick={onClicCadre}
        onWheel={(e) => {
          e.preventDefault();
          zoomer(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
        }}
      >
        {/* Pendant un tracé, les pastilles ne prennent plus le clic (voir la
            feuille de style) : sans ça, poser un sommet sur un objet
            ouvrirait sa fiche et abandonnerait le contour en cours. Elles
            restent visibles — c'est en repérant la chaudière qu'on sait où
            passe le mur du local technique. */}
        <div
          className={tracage ? "plan-couche plan-couche-tracage" : "plan-couche"}
          style={{ transform: `translate(${vue.tx}px, ${vue.ty}px) scale(${vue.echelle})` }}
        >
          <img ref={imageRef} className="plan-image" src={imageUrl} alt="" draggable={false} />

          {/* Les contours tracés, plus celui en cours. Le calque est en
              pourcentages (`viewBox` 0 0 100 sur une boîte étirée), donc il
              suit l'image sans que rien n'ait à connaître ses dimensions —
              c'est la même propriété que celle des points, et c'est ce qui
              fait qu'un remplacement d'image ne déplace pas un contour. */}
          {(polygones.length > 0 || tracage) && (
            <svg className="plan-geom" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {polygones.map((g) => (
                <polygon key={g.zoneId} points={g.sommets.map((s) => `${s.x},${s.y}`).join(" ")} />
              ))}
              {tracage && tracage.sommets.length > 0 && (
                // `polyline` et non `polygon` : le tracé n'est pas encore
                // fermé, et le montrer fermé dirait qu'il l'est.
                <polyline
                  className="plan-geom-encours"
                  points={tracage.sommets.map((s) => `${s.x},${s.y}`).join(" ")}
                />
              )}
            </svg>
          )}

          {/* Les sommets déjà posés, en HTML et non en SVG : le calque est
              étiré par `preserveAspectRatio="none"`, un cercle SVG y devient
              un ovale et grossirait avec le zoom. */}
          {tracage?.sommets.map((s, rang) => (
            <span
              key={`${rang}-${s.x}-${s.y}`}
              className="plan-sommet"
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                transform: `translate(-50%, -50%) scale(${1 / vue.echelle})`,
              }}
              aria-hidden="true"
            />
          ))}

          {/* L'étiquette d'un contour est en HTML pour la même raison, et elle
              est portée par le nom de la zone — la seule chose qu'un contour
              ait à dire. */}
          {polygones.map((g) => {
            const c = centre(g.sommets);
            return (
              <span
                key={g.zoneId}
                className="plan-geom-nom"
                style={{
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                  transform: `translate(-50%, -50%) scale(${1 / vue.echelle})`,
                }}
              >
                {g.nom}
              </span>
            );
          })}

          {grappes.map((grappe) => {
            const seul = grappe.points.length === 1 ? grappe.points[0] : null;
            const enCours = seul && glisse?.pointId === seul.id ? glisse : null;
            const x = enCours ? enCours.x : grappe.x;
            const y = enCours ? enCours.y : grappe.y;

            return (
              <div
                key={grappe.cle}
                className="plan-ancre"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  // Contre-échelle : une pastille garde sa taille à l'écran,
                  // sinon elle devient un pavé au zoom 8.
                  transform: `translate(-50%, -50%) scale(${1 / vue.echelle})`,
                }}
              >
                {seul ? (
                  <Link
                    to={liens.fiche(seul.elementId)}
                    className="plan-point plan-point-seul"
                    onPointerDown={(e) => {
                      // Sans cet arrêt, prendre un point déplacerait aussi la
                      // vue sous lui.
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture?.(e.pointerId);
                      aGlisse.current = false;
                      glisseRef.current = {
                        pointId: seul.id,
                        x: seul.x,
                        y: seul.y,
                        departX: e.clientX,
                        departY: e.clientY,
                      };
                      setGlisse({ pointId: seul.id, x: seul.x, y: seul.y });
                    }}
                    onPointerMove={onPointerMoveCadre}
                    onPointerUp={onPointerUpCadre}
                    onClick={(e) => {
                      // Un glissement n'ouvre pas la fiche : il vient de
                      // déplacer le point.
                      if (aGlisse.current) e.preventDefault();
                    }}
                  >
                    <span className="plan-point-pastille" aria-hidden="true" />
                    <span className="plan-point-nom">{seul.nom}</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="plan-point plan-point-grappe"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeplie(deplie === grappe.cle ? null : grappe.cle);
                    }}
                    aria-expanded={deplie === grappe.cle}
                  >
                    {grappe.points.length}
                  </button>
                )}

                {deplie === grappe.cle && (
                  <ul className="plan-grappe-liste">
                    {grappe.points.map((p) => (
                      <li key={p.id}>
                        <Link to={liens.fiche(p.elementId)}>{p.nom}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {points.length > 0 && (
        <details className="plan-liste">
          <summary>{points.length} objet{points.length > 1 ? "s" : ""} sur ce plan</summary>
          <ul>
            {points.map((p) => (
              <li key={p.id}>
                <Link to={liens.fiche(p.elementId)}>{p.nom}</Link>
                <span className="selecteur-secondaire"> {p.zoneNom}</span>
                <button type="button" className="bouton-discret" onClick={() => onRetirer(p.id)}>
                  Retirer du plan
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
