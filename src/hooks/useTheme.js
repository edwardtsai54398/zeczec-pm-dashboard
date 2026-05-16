import { useEffect } from 'react';
import { ACCENT_INK, ACCENT_PALETTES } from '../constants.js';

export function applyAccent(palette) {
  const p = Array.isArray(palette) ? palette : ACCENT_PALETTES[0];
  const s = document.documentElement.style;
  s.setProperty("--accent", p[0]);
  s.setProperty("--accent-deep", p[1] || p[0]);
  s.setProperty("--accent-soft", p[2] || p[0]);
  s.setProperty("--accent-ink", ACCENT_INK[p[0]] || p[1] || p[0]);
}

export function useTheme(tweaks) {
  useEffect(() => {
    applyAccent(tweaks.accent);
    document.body.classList.toggle("density-compact", tweaks.density === "compact");
    document.body.classList.toggle("no-tint", !tweaks.ambient);
  }, [tweaks.accent, tweaks.density, tweaks.ambient]);
}
