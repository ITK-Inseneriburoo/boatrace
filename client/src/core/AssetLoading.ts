/**
 * Käivituse ajal alustatud väliste asset'ide register. Laadijad lisavad siia
 * oma promise'id, et esimene nähtav kaader ei võistleks dekodeerimise ja
 * parsimisega samas pealõimes.
 */
const pending = new Set<Promise<unknown>>();

export function trackAsset<T>(promise: Promise<T>): Promise<T> {
  pending.add(promise);
  void promise.then(
    () => pending.delete(promise),
    () => pending.delete(promise),
  );
  return promise;
}

/**
 * Oota registri tühjenemiseni. Tsükkel on vajalik, sest ühe asset'i valmimine
 * võib käivitada järgmise (nt 2k puudumisel 1k või GLB järel bänneritekstuur).
 */
export async function waitForAssetLoads(): Promise<void> {
  while (pending.size > 0) {
    await Promise.allSettled([...pending]);
    await Promise.resolve();
  }
}
