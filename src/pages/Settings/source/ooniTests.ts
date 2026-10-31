// Supported OONI tests offered in the feed form's Test dropdown. Mirrors
// backend/config/models/ooniTests.js (there is no shared schema between the two
// apps). Keep the two lists in sync. Reference: https://ooni.org/nettest/
export const OONI_TEST_OPTIONS: { _id: string; label: string }[] = [
  { _id: "web_connectivity", label: "Web Connectivity" },
  { _id: "whatsapp", label: "WhatsApp" },
  { _id: "telegram", label: "Telegram" },
  { _id: "signal", label: "Signal" },
  { _id: "facebook_messenger", label: "Facebook Messenger" },
  { _id: "tor", label: "Tor" },
  { _id: "psiphon", label: "Psiphon" },
  {
    _id: "http_header_field_manipulation",
    label: "HTTP Header Field Manipulation",
  },
  { _id: "http_invalid_request_line", label: "HTTP Invalid Request Line" },
  { _id: "dnscheck", label: "DNSCheck" },
];

export const ooniTestLabel = (id?: string): string => {
  if (!id) return "";
  return OONI_TEST_OPTIONS.find((t) => t._id === id)?.label || id;
};
