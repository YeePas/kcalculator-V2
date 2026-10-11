/* ── Product corrections ───────────────────────────────────── */
/* Turns a "Klopt niet?" report into an entry for data/product-corrections.json
   (applied by scripts/validate_products.mjs). The values are a starting point: adjust them
   to what the package says before adding the entry. */

export function buildCorrectionEntry(issue = {}) {
  const details = issue.details || {};
  if (!details.product) return null;
  const entry = { n: details.product };
  if (details.brand) entry.b = details.brand;
  entry.set = { ...(details.per100 || {}) };
  const message = String(issue.message || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  entry.note = `melding${issue.id ? ` #${issue.id}` : ''}${message ? `: ${message}` : ''}`;
  return entry;
}
