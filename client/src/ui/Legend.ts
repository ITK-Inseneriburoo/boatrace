import { h } from "./ScreenManager";
import { t } from "./i18n/et";

const RIDA: [string, string][] = [
  ["W / ↑", "Gaas"],
  ["S / ↓", "Pidur / tagurdamine"],
  ["A · D / ← · →", "Rool"],
  ["Ctrl", "Boost (kiiruslisa, taastuv)"],
  ["Shift", "Sõidukivõime"],
  ["Tühik", "Veekahur"],
  ["R", "Tagasi rajale"],
  ["H", "Juhtimise legend"],
  ["1 · 2 · 3", "—"],
];

const VAATLEJA: [string, string][] = [
  ["W A S D", "Liiguta kaamerat"],
  ["Q / E", "Kõrgus üles / alla"],
  ["Tab", "Järgne järgmisele paadile / vaba vaade"],
];

/** Juhtimisklahvide tabel — kasutusel menüüs ja sõiduaegses overlays */
export function buildLegend(includeSpectator = true): HTMLElement {
  const wrap = h("div", { style: "display:flex;flex-direction:column;gap:4px;min-width:300px" });
  const row = (keys: string, mida: string): HTMLElement =>
    h(
      "div",
      { style: "display:flex;gap:14px;align-items:baseline" },
      h(
        "span",
        {
          style:
            "font-family:ui-monospace,monospace;background:rgba(255,255,255,.09);border:1px solid var(--panel-border);border-radius:6px;padding:2px 9px;font-size:.82rem;white-space:nowrap;min-width:110px;text-align:center",
        },
        keys,
      ),
      h("span", { style: "font-size:.9rem" }, mida),
    );
  for (const [k, v] of RIDA) {
    if (v === "—") continue;
    wrap.appendChild(row(k, v));
  }
  wrap.appendChild(
    h("div", { style: "color:var(--text-dim);font-size:.78rem;margin-top:4px" }, "Gamepad: RT gaas · LT pidur · vasak kepp rool · B/RB boost · A võime · X veekahur"),
  );
  if (navigator.maxTouchPoints > 0) {
    wrap.appendChild(
      h("div", { style: "color:var(--accent);font-size:.8rem;margin-top:7px" }, t("touch.legend")),
    );
  }
  if (includeSpectator) {
    wrap.appendChild(
      h("div", { style: "color:var(--text-dim);font-size:.78rem;text-transform:uppercase;letter-spacing:.1em;margin-top:8px" }, "Vaatleja"),
    );
    for (const [k, v] of VAATLEJA) wrap.appendChild(row(k, v));
  }
  return wrap;
}
