// app/components/ChampEditor.tsx
import { useState } from "react";
import { CHAMP_GENRES } from "../db/schema/types";
import type { ChampDefinition, ChampGenre } from "../db/schema/types";

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
            <select
              value={champ.genre}
              onChange={(e) => {
                const genre = e.target.value as ChampGenre;
                // "Obligatoire" n'a pas de sens pour une case à cocher : elle
                // porte toujours une valeur (cochée ou non), il n'y a rien à
                // rendre obligatoire.
                modifier(i, genre === "booleen" ? { genre, obligatoire: false } : { genre });
              }}
            >
              {CHAMP_GENRES.map((g) => (
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
          {champ.genre !== "booleen" && (
            <label>
              Obligatoire
              <input type="checkbox" checked={champ.obligatoire} onChange={(e) => modifier(i, { obligatoire: e.target.checked })} />
            </label>
          )}
          <button type="button" onClick={() => retirer(i)}>Retirer ce champ</button>
        </fieldset>
      ))}
      <button type="button" onClick={ajouter}>Ajouter un champ</button>
      <input type="hidden" name={nomChamp} value={JSON.stringify(champs.map(({ optionsTexte, ...c }) => c))} />
    </fieldset>
  );
}
