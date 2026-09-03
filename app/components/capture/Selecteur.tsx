// app/components/capture/Selecteur.tsx
import { useMemo, useState } from "react";

export type OptionSelecteur = {
  id: number;
  principal: string;
  secondaire?: string;
  /** Termes supplémentaires cherchés par le filtre (alias du catalogue). */
  motsCles?: string[];
};

const sansAccent = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

// Le champ de filtre n'est jamais autofocus : faire surgir le clavier coûte
// une seconde et contredit « aucune saisie clavier si l'utilisateur accepte
// les valeurs proposées ».
export function Selecteur({
  titre,
  options,
  valeur,
  onChoisir,
  onFermer,
}: {
  titre: string;
  options: OptionSelecteur[];
  valeur: number | null;
  onChoisir: (id: number) => void;
  onFermer: () => void;
}) {
  const [filtre, setFiltre] = useState("");

  const visibles = useMemo(() => {
    const terme = sansAccent(filtre.trim());
    if (!terme) return options;
    return options.filter((o) =>
      [o.principal, o.secondaire ?? "", ...(o.motsCles ?? [])].some((t) => sansAccent(t).includes(terme)),
    );
  }, [filtre, options]);

  return (
    <div className="selecteur">
      <header className="selecteur-tete">
        <button type="button" className="selecteur-retour" onClick={onFermer} aria-label="Retour">
          ←
        </button>
        <h2>{titre}</h2>
      </header>
      <input
        type="search"
        className="selecteur-filtre"
        placeholder="Filtrer"
        value={filtre}
        onChange={(e) => setFiltre(e.target.value)}
      />
      <ul className="selecteur-liste">
        {visibles.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className={o.id === valeur ? "selecteur-option selecteur-option-active" : "selecteur-option"}
              onClick={() => onChoisir(o.id)}
            >
              <span className="selecteur-principal">{o.principal}</span>
              {o.secondaire && <span className="selecteur-secondaire">{o.secondaire}</span>}
            </button>
          </li>
        ))}
        {visibles.length === 0 && <li className="selecteur-vide">Rien ne correspond.</li>}
      </ul>
    </div>
  );
}
