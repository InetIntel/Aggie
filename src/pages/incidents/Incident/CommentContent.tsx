import Linkify from "linkify-react";

// Parse only complete iframe snippets. All other content remains escaped text.
// The inert document is used solely to read attributes, never inserted into the DOM.
export function parseRadarEmbed(snippet: string) {
  const document = new DOMParser().parseFromString(snippet, "text/html");
  const iframe = document.body.firstElementChild;
  if (iframe?.tagName !== "IFRAME" || document.body.childNodes.length !== 1 ||
      iframe.textContent?.trim()) return null;
  try {
    const src = new URL(iframe.getAttribute("src") || "");
    if (src.protocol !== "https:" || src.hostname !== "radar.cloudflare.com" ||
        src.port || src.username || src.password ||
        !/^\/embed\/[A-Za-z0-9_-]+$/.test(src.pathname)) return null;
    const dimension = (name: string, fallback: number) => {
      const value = iframe.getAttribute(name) || "";
      return /^\d+$/.test(value)
        ? Math.max(200, Math.min(1200, Number(value))) : fallback;
    };
    return {
      src: src.href,
      title: iframe.getAttribute("title") || "Cloudflare Radar chart",
      width: dimension("width", 800),
      height: dimension("height", 443),
    };
  } catch {
    return null;
  }
}

export default function CommentContent({ text }: { text: string }) {
  const parts = [];
  const snippets = /<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi;
  let offset = 0;
  let match;
  while ((match = snippets.exec(text)) !== null) {
    const embed = parseRadarEmbed(match[0]);
    if (!embed) continue;
    if (match.index > offset) {
      parts.push(<p key={offset}><Linkify>{text.slice(offset, match.index)}</Linkify></p>);
    }
    parts.push(
      <iframe
        key={`embed-${match.index}`}
        {...embed}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        className="max-w-full border-0"
      />
    );
    offset = match.index + match[0].length;
  }
  if (offset < text.length || parts.length === 0) {
    parts.push(<p key={offset}><Linkify>{text.slice(offset)}</Linkify></p>);
  }
  return <>{parts}</>;
}
