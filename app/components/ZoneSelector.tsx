// app/components/ZoneSelector.tsx
import type { chargerArbreZones, ZoneAvecEnfants } from "../lib/zoneTree";

type Arbre = Awaited<ReturnType<typeof chargerArbreZones>>;

function OptionsZone({ zones, profondeur = 0 }: { zones: ZoneAvecEnfants[]; profondeur?: number }) {
  return (
    <>
      {zones.map((z) => (
        <>
          <option key={z.id} value={z.id}>
            {"— ".repeat(profondeur)}
            {z.nom}
          </option>
          {z.enfants.length > 0 && <OptionsZone zones={z.enfants} profondeur={profondeur + 1} />}
        </>
      ))}
    </>
  );
}

// Vocabulaire "zone" uniquement, jamais l'autre terme (règle non négociable #6).
export function ZoneSelector({ arbre, name, defaultValue }: { arbre: Arbre; name: string; defaultValue?: number }) {
  return (
    <select name={name} defaultValue={defaultValue} required>
      <option value="">— choisir une zone —</option>
      {arbre.arbre.flatMap(({ batiment, niveaux }) =>
        niveaux.map(({ niveau, zones }) => (
          <optgroup key={niveau.id} label={`${batiment.nom} — ${niveau.nom}`}>
            <OptionsZone zones={zones} />
          </optgroup>
        ))
      )}
      {arbre.zonesExterieures.length > 0 && (
        <optgroup label="Extérieur">
          <OptionsZone zones={arbre.zonesExterieures} />
        </optgroup>
      )}
    </select>
  );
}
