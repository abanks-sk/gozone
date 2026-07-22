/**
 * Ghanaian mobile-number helpers — mirror the server's validation so the user gets
 * instant feedback and the API receives a clean E.164 (+233…) number.
 */

/** Valid GH mobile network prefixes (the two digits after the 0 / +233). */
const GH_PREFIXES = ['20', '23', '24', '25', '26', '27', '28', '29',
                     '50', '53', '54', '55', '56', '57', '59'];

/** Strip a raw entry down to the 9-digit national number, or null if it can't be one. */
function toNsn(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('233')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return d.length === 9 ? d : null;
}

/** Canonicalise any accepted GH format to +233XXXXXXXXX, or null if not a valid GH mobile. */
export function normalizeGhPhone(raw: string): string | null {
  const nsn = toNsn(raw);
  if (!nsn) return null;
  if (!GH_PREFIXES.some((p) => nsn.startsWith(p))) return null;
  return '+233' + nsn;
}

export function isValidGhPhone(raw: string): boolean {
  return normalizeGhPhone(raw) != null;
}
