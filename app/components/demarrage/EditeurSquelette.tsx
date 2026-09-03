// app/components/demarrage/EditeurSquelette.tsx
// La proposition est une PROPOSITION : tout se renomme, tout se supprime, on
// ajoute ce qui manque, et rien n'est écrit tant que le bouton du bas n'a pas
// été pressé. L'état vit ici, donc fermer l'onglet annule tout.
import type { BatimentPropose, NiveauPropose, SquelettePropose, ZoneProposee } from "../../lib/demarrage/types";

let compteur = 0;
function cle(prefixe: string) {
  compteur += 1;
  return `${prefixe}-ajout-${compteur}`;
}

export function EditeurSquelette({
  squelette,
  onChanger,
}: {
  squelette: SquelettePropose;
  onChanger: (s: SquelettePropose) => void;
}) {
  function majBatiment(cleBatiment: string, transformer: (b: BatimentPropose) => BatimentPropose) {
    onChanger({
      ...squelette,
      batiments: squelette.batiments.map((b) => (b.cle === cleBatiment ? transformer(b) : b)),
    });
  }

  function majNiveau(cleBatiment: string, cleNiveau: string, transformer: (n: NiveauPropose) => NiveauPropose) {
    majBatiment(cleBatiment, (b) => ({
      ...b,
      niveaux: b.niveaux.map((n) => (n.cle === cleNiveau ? transformer(n) : n)),
    }));
  }

  return (
    <div className="demarrage-editeur">
      {squelette.batiments.map((batiment) => (
        <section key={batiment.cle} className="demarrage-batiment">
          <header className="demarrage-batiment-entete">
            <input
              type="text"
              value={batiment.nom}
              onChange={(e) => majBatiment(batiment.cle, (b) => ({ ...b, nom: e.target.value }))}
              aria-label="Nom du bâtiment"
              className="demarrage-nom-batiment"
            />
            {squelette.batiments.length > 1 && (
              <button
                type="button"
                className="demarrage-retirer"
                onClick={() =>
                  onChanger({ ...squelette, batiments: squelette.batiments.filter((b) => b.cle !== batiment.cle) })
                }
              >
                Retirer le bâtiment
              </button>
            )}
          </header>

          {batiment.niveaux.map((niveau) => (
            <div key={niveau.cle} className="demarrage-niveau">
              <div className="demarrage-niveau-entete">
                {/* L'ordinal est montré parce que c'est lui qui range, pas le
                    nom. Le rendre visible évite qu'on renomme « Combles » en
                    « Cave » en croyant déplacer le niveau. */}
                <span className="demarrage-ordinal" title="Rang du niveau : négatif sous terre, 0 au rez">
                  {niveau.ordinal > 0 ? `+${niveau.ordinal}` : niveau.ordinal}
                </span>
                <input
                  type="text"
                  value={niveau.nom}
                  onChange={(e) => majNiveau(batiment.cle, niveau.cle, (n) => ({ ...n, nom: e.target.value }))}
                  aria-label="Nom du niveau"
                  className="demarrage-nom-niveau"
                />
                <button
                  type="button"
                  className="demarrage-retirer"
                  onClick={() =>
                    majBatiment(batiment.cle, (b) => ({ ...b, niveaux: b.niveaux.filter((n) => n.cle !== niveau.cle) }))
                  }
                >
                  Retirer
                </button>
              </div>

              <ListeZones
                zones={niveau.zones}
                onChanger={(zones) => majNiveau(batiment.cle, niveau.cle, (n) => ({ ...n, zones }))}
                typeParDefaut="interieur"
              />
            </div>
          ))}
        </section>
      ))}

      <section className="demarrage-batiment">
        <header className="demarrage-batiment-entete">
          <h3 className="demarrage-nom-batiment-fixe">Extérieur</h3>
        </header>
        <p className="demarrage-aide">
          Rattaché à la parcelle, sans niveau. C'est ce qu'un lien de partage au jardinier peut montrer.
        </p>
        <ListeZones
          zones={squelette.zonesExterieures}
          onChanger={(zonesExterieures) => onChanger({ ...squelette, zonesExterieures })}
          typeParDefaut="exterieur"
        />
      </section>
    </div>
  );
}

function ListeZones({
  zones,
  onChanger,
  typeParDefaut,
}: {
  zones: ZoneProposee[];
  onChanger: (zones: ZoneProposee[]) => void;
  typeParDefaut: ZoneProposee["type"];
}) {
  return (
    <ul className="demarrage-zones">
      {zones.map((zone) => (
        <li key={zone.cle} className="demarrage-zone">
          <input
            type="text"
            value={zone.nom}
            onChange={(e) => onChanger(zones.map((z) => (z.cle === zone.cle ? { ...z, nom: e.target.value } : z)))}
            aria-label="Nom de la zone"
          />
          <select
            value={zone.type}
            onChange={(e) =>
              onChanger(
                zones.map((z) =>
                  z.cle === zone.cle ? { ...z, type: e.target.value as ZoneProposee["type"] } : z,
                ),
              )
            }
            aria-label="Type de zone"
          >
            <option value="interieur">intérieur</option>
            <option value="exterieur">extérieur</option>
            <option value="annexe">annexe</option>
            <option value="technique">technique</option>
          </select>
          <button
            type="button"
            className="demarrage-retirer"
            onClick={() => onChanger(zones.filter((z) => z.cle !== zone.cle))}
            aria-label={`Retirer ${zone.nom}`}
          >
            ×
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          className="demarrage-ajouter"
          onClick={() => onChanger([...zones, { cle: cle("z"), nom: "", type: typeParDefaut }])}
        >
          + Ajouter une zone
        </button>
      </li>
    </ul>
  );
}
