// Date/time formatting for the compare-modal alert cards. Kept here (alert-compare
// scope) rather than in the shared reportParser since it's only used by CompareCardBody.

// "2026-04-27T17:00:00Z" -> "2026-04-27 @ 17:00 UTC"
export const formatStamp = (iso?: string): string => {
  const s = iso?.replace("T", " ").substring(0, 16);
  if (!s) return "";
  return `${s.replace(" ", " @ ")} UTC`;
};

// Humanized gap between two ISO stamps. "" on missing/invalid/negative input.
export const formatDuration = (startIso?: string, endIso?: string): string => {
  if (!startIso || !endIso) return "";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (isNaN(ms) || ms < 0) return "";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hours` : `${hours}h ${rem}m`;
};
