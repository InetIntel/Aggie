import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

// Country list for the feed forms' country-code dropdowns (IODA / Cloudflare /
// OONI). Uses i18n-iso-countries (already a dependency) so we don't hand-maintain
// a country table. Values are two-letter ISO codes, matching what the channels
// send to each provider (probe_cc, relatedTo=country/<cc>, location code).
countries.registerLocale(enLocale);

export const COUNTRY_OPTIONS: { _id: string; label: string }[] = Object.entries(
  countries.getNames("en", { select: "official" })
)
  .map(([code, name]) => ({ _id: code, label: `${name} (${code})` }))
  .sort((a, b) => a.label.localeCompare(b.label));

// Human-readable label for a stored country code, e.g. "Iran (IR)".
export const countryLabel = (code?: string): string => {
  if (!code) return "";
  const name = countries.getName(code, "en");
  return name ? `${name} (${code})` : code;
};
