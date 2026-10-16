// Builds a browser-resolvable URL for an incident comment attachment. The comment doc stores
// `path` as a root-relative reference (`/incidents/uploads/<file>`); attachment bytes live in
// MongoDB (kind 'incident-attachment') and are served at the same authenticated route, so the
// reference only needs the deployment base prefix (PUBLIC_URL, e.g. "/aggie" when served under
// a subpath). Anything that isn't an attachment reference is returned untouched — and there is
// deliberately no hardcoded localhost fallback: a root-relative URL already resolves against
// the current origin.
export function buildAttachmentUrl(attachmentPath: string): string {
  if (!attachmentPath.startsWith("/incidents/uploads/")) return attachmentPath;
  const base = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  return `${base}${attachmentPath}`;
}
