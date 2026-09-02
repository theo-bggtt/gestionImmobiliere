// app/components/ChampEditor.tsx
import { useState } from "react";
import type { ChampDefinition, ChampGenre } from "../db/schema/types";

// Liste fermée de six genres (règle non négociable #4) — ne jamais l'étendre.
const GENRES: ChampGenre[] = ["texte", "nombre", "date", "booleen", "choix", "fichier"];

type ChampBrouillon = ChampDefinition & { optionsTexte?: string };

export function ChampEditor({ nomChamp = "champs" }: { nomChamp?: string }) {
  const [champs, setChamps] = useState<ChampBrouillon[]>([]);

  function ajouter() {
    setChamps((c) => [...c, { cle: "", label: "", genre: "texte", niveauMin: 1, obligatoire: false }]);
  }

  function retirer(index: number) {
    setChamps((c) => c.filter((_, i) => i !== index));
  }

  function modifier(index: number, patch: Partial<ChampBrouillon>) {
    setChamps((c) => c.map((champ, i) => (i === index ? { ...champ, ...patch } : champ)));
  }

  return (
    <fieldset>
      <legend>Champs du type</legend>
      {champs.map((champ, i) => (
        <fieldset key={i}>
          <label>
            Clé (immuable une fois créée)
            <input
              type="text"
              value={champ.cle}
              onChange={(e) => modifier(i, { cle: e.target.value.trim().replace(/\s+/g, "_") })}
              required
            />
          </label>
          <label>
            Libellé
            <input type="text" value={champ.label} onChange={(e) => modifier(i, { label: e.target.value })} required />
          </label>
          <label>
            Genre
            <select value={champ.genre} onChange={(e) => modifier(i, { genre: e.target.value as ChampGenre })}>
              {GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          {champ.genre === "choix" && (
            <label>
              Options (une par ligne)
              <textarea
                value={champ.optionsTexte ?? (champ.options ?? []).join("\n")}
                onChange={(e) =>
                  modifier(i, {
                    optionsTexte: e.target.value,
                    options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                  })
                }
              />
            </label>
          )}
          <label>
            Unité (optionnel)
            <input type="text" value={champ.unite ?? ""} onChange={(e) => modifier(i, { unite: e.target.value || undefined })} />
          </label>
          <label>
            Niveau minimum pour voir ce champ
            <select value={champ.niveauMin} onChange={(e) => modifier(i, { niveauMin: Number(e.target.value) })}>
              <option value={0}>0 — public</option>
              <option value={1}>1 — usage</option>
              <option value={2}>2 — technique</option>
              <option value={3}>3 — privé</option>
            </select>
          </label>
          <label>
            Obligatoire
            <input type="checkbox" checked={champ.obligatoire} onChange={(e) => modifier(i, { obligatoire: e.target.checked })} />
          </label>
          <button type="button" onClick={() => retirer(i)}>Retirer ce champ</button>
        </fieldset>
      ))}
      <button type="button" onClick={ajouter}>Ajouter un champ</button>
      <input type="hidden" name={nomChamp} value={JSON.stringify(champs.map(({ optionsTexte, ...c }) => c))} />
    </fieldset>
  );
}
