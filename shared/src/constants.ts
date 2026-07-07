/** Kliendi olekusaatmise sagedus serverile (Hz) */
export const TICK_RATE = 15;
/** Kaugpaatide renderdusviide — renderdame nii palju minevikus (ms) */
export const INTERP_DELAY_MS = 150;
/** Maksimaalne ekstrapoleerimine snapshot'ide puudumisel (ms) */
export const MAX_EXTRAPOLATION_MS = 250;
/** Stardiloenduse pikkus (ms) */
export const COUNTDOWN_MS = 4000;
/** Mängijaid toa kohta */
export const MAX_PLAYERS_PER_ROOM = 8;
/** Tube kokku */
export const MAX_ROOMS = 20;
/** DNF-taimer pärast esimest finišeerijat (ms) */
export const DNF_TIMEOUT_MS = 120_000;
/** Reconnect'i armuaeg (ms) */
export const RECONNECT_GRACE_MS = 60_000;
/** Nime pikkus */
export const NAME_MIN = 1;
export const NAME_MAX = 20;
/** Chat */
export const CHAT_MAX_LEN = 200;
/** Mängija paadi valitavad värvid (aktsenditriip) */
export const PLAYER_COLORS = [
  0xe63946, 0xf4a261, 0xe9c46a, 0x2a9d8f, 0x4895ef, 0x9b5de5, 0xf15bb5, 0xffffff,
] as const;
