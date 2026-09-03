// app/components/recherche/BarreRecherche.tsx
import { useEffect, useState } from "react";

/**
 * Renvoie `valeur` une fois qu'elle a cessé de bouger pendant `ms`.
 * La recherche part à la frappe, mais pas à chaque touche : sur un réseau
 * mobile, une requête par caractère coûte plus cher que les 150 ms d'attente.
 */
export function useAntiRebond<T>(valeur: T, ms = 150): T {
  const [retardee, setRetardee] = useState(valeur);
  useEffect(() => {
    const t = setTimeout(() => setRetardee(valeur), ms);
    return () => clearTimeout(t);
  }, [valeur, ms]);
  return retardee;
}

export function BarreRecherche({
  valeur,
  onChange,
  autoFocus = false,
  placeholder = "Chercher un objet",
  onEffacer,
}: {
  valeur: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  onEffacer?: () => void;
}) {
  return (
    <div className="recherche-barre">
      <input
        type="search"
        className="recherche-champ"
        value={valeur}
        placeholder={placeholder}
        aria-label="Chercher un objet"
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        // Empêche la soumission implicite : la recherche part toute seule.
        onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        onChange={(e) => onChange(e.target.value)}
      />
      {valeur !== "" && (
        <button
          type="button"
          className="recherche-effacer"
          aria-label="Effacer la recherche"
          onClick={() => (onEffacer ? onEffacer() : onChange(""))}
        >
          ×
        </button>
      )}
    </div>
  );
}
