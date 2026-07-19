/** Apple peidab iPadOS-is end vahel Maci user agent'i taha. */
export function isAppleMobile(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isTouchDevice(): boolean {
  return navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
}

/**
 * iPadOS-i PWA-s võib Screen Orientation API landscape'is ekslikult 0° jääda.
 * Apple'i legacy nurk kasutab lisaks vastupidist märki (-90 = päripäeva).
 */
export function appleScreenRotation(): number {
  const landscape = matchMedia("(orientation: landscape)").matches;
  const legacy = (window as Window & { orientation?: number }).orientation;

  if (typeof legacy === "number") {
    const normalizedLegacy = ((-legacy % 360) + 360) % 360;
    const legacyIsLandscape = normalizedLegacy % 180 === 90;
    if (legacyIsLandscape === landscape) return normalizedLegacy;
  }

  const modern = screen.orientation?.angle;
  if (typeof modern === "number") {
    const normalizedModern = ((modern % 360) + 360) % 360;
    const modernIsLandscape = normalizedModern % 180 === 90;
    if (modernIsLandscape === landscape) return normalizedModern;
  }

  if (landscape) {
    return screen.orientation?.type === "landscape-secondary" ? 270 : 90;
  }
  return screen.orientation?.type === "portrait-secondary" ? 180 : 0;
}
