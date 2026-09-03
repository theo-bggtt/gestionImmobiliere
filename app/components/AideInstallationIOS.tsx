// app/components/AideInstallationIOS.tsx
import { useEffect, useState } from "react";

const VU = "aideInstallationIOSVue";

// iOS n'émet pas `beforeinstallprompt` : sans cette explication, personne ne
// trouve « Sur l'écran d'accueil » et l'app reste un onglet. Affiché une fois.
export function AideInstallationIOS() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    const installee =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (ios && safari && !installee && !localStorage.getItem(VU)) {
      localStorage.setItem(VU, "1");
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="aide-installation" role="dialog" aria-label="Installer l'application">
      <p>
        Pour capturer en un geste, installe l'app : bouton <strong>Partager</strong> puis{" "}
        <strong>Sur l'écran d'accueil</strong>.
      </p>
      <button type="button" onClick={() => setVisible(false)}>
        Compris
      </button>
    </div>
  );
}
