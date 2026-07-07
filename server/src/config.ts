function intEnv(name: string, def: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : def;
}

export const config = {
  port: intEnv("PORT", 8090),
  staticDir: process.env.STATIC_DIR ?? new URL("../../client/dist", import.meta.url).pathname,
};
