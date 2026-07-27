// Convertit une durée style JWT_EXPIRES_IN ("8h", "30m", "1d", "3600") en
// millisecondes, pour servir de maxAge au cookie -- doit rester cohérent
// avec la durée de vie réelle du JWT posé par authService.login().
const UNITES: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function dureeEnMs(duree: string): number {
  const correspondance = /^(\d+)\s*([smhd])?$/.exec(duree.trim());
  if (!correspondance) {
    throw new Error(`Format de durée invalide: ${duree}`);
  }
  const [, valeur, unite] = correspondance;
  // Sans unité, jsonwebtoken interprète la valeur comme des secondes.
  const multiplicateur = unite ? UNITES[unite] : UNITES['s'];
  return Number(valeur) * multiplicateur;
}
