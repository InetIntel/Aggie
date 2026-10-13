import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import CommentContent, { parseRadarEmbed } from "./CommentContent";

const src = "https://radar.cloudflare.com/embed/DnsVolumeByAsXY?theme=light&location=ir&ref=%2Fdns%2Fir&dateRange=7d&dateEnd=2026-10-08T16%3A30%3A00.000Z";
const snippet = `<iframe class="cf-radar-embed" width="800" height="443" src="${src}" title="Cloudflare Radar - DNS query volume by autonomous system" loading="lazy" scrolling="no" style="border:0;max-width:100%;"></iframe>`;

test("accepts the issue's Radar snippet and HTML-encoded query separators", () => {
  expect(parseRadarEmbed(snippet)).toEqual({ src, title: "Cloudflare Radar - DNS query volume by autonomous system", width: 800, height: 443 });
  expect(parseRadarEmbed(snippet.replaceAll("&", "&amp;"))).toEqual(parseRadarEmbed(snippet));
});

test.each([
  "http://radar.cloudflare.com/embed/Chart",
  "https://example.com/embed/Chart",
  "https://radar.cloudflare.com.evil.test/embed/Chart",
  "https://evil.radar.cloudflare.com/embed/Chart",
  "https://radar.cloudflare.com@evil.test/embed/Chart",
  "https://user@radar.cloudflare.com/embed/Chart",
  "https://radar.cloudflare.com:444/embed/Chart",
  "https://radar.cloudflare.com/dns/ir",
  "https://radar.cloudflare.com/embed/",
  "https://radar.cloudflare.com/embed/../dns",
  "https://radar.cloudflare.com/embed/%2f%2fevil.test",
  "//radar.cloudflare.com/embed/Chart",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "",
])("rejects unsafe or unsupported source %s", (url) => {
  expect(parseRadarEmbed(`<iframe src="${url}"></iframe>`)).toBeNull();
});

let container;
beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); });
afterEach(() => { act(() => ReactDOM.unmountComponentAtNode(container)); container.remove(); });
const render = (text) => act(() => ReactDOM.render(<CommentContent text={text} />, container));

test("preserves text, newlines, automatic links, and multiple embeds in order", () => {
  render(`Before\nhttps://example.com\n${snippet}Between${snippet}After`);
  expect(Array.from(container.children).map((element) => element.tagName)).toEqual(["P", "IFRAME", "P", "IFRAME", "P"]);
  expect(container.firstChild.textContent).toBe("Before\nhttps://example.com\n");
  expect(container.querySelector("a").href).toBe("https://example.com/");
  expect(container.lastChild.textContent).toBe("After");
});

test("rebuilds trusted embeds without attacker-controlled attributes", () => {
  render(`<iframe src="${src}" srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;" onload="alert(1)" style="position:fixed" allow="camera;microphone" sandbox="allow-top-navigation" width="99999" height="-1"></iframe>`);
  const iframe = container.querySelector("iframe");
  expect(iframe.src).toBe(src);
  for (const attribute of ["srcdoc", "onload", "style", "allow"]) expect(iframe.hasAttribute(attribute)).toBe(false);
  expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
  expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(iframe.getAttribute("loading")).toBe("lazy");
  expect(iframe.title).toBe("Cloudflare Radar chart");
  expect(iframe.width).toBe("1200");
  expect(iframe.height).toBe("443");
});

test.each([
  '<script>alert(1)</script><img src=x onerror="alert(1)">',
  '<iframe src="https://evil.test"></iframe>',
  `<iframe src="${src}">fallback text</iframe>`,
  `<iframe src="${src}"`,
  '&lt;iframe src="https://radar.cloudflare.com/embed/Chart"&gt;&lt;/iframe&gt;',
])("keeps unsupported HTML as literal text: %s", (text) => {
  render(text);
  expect(container.textContent).toBe(text);
  expect(container.querySelector("iframe, script, img")).toBeNull();
});

test("rerendering updated comment content removes old embeds", () => {
  render(snippet);
  expect(container.querySelectorAll("iframe")).toHaveLength(1);
  render("Updated comment");
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.textContent).toBe("Updated comment");
});
