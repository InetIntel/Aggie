// Supported OONI test names a source may be configured to watch. Kept in one
// place so the source controller can validate against it. The frontend keeps
// its own matching list (there is no shared schema between the two apps).
// Reference: https://ooni.org/nettest/
module.exports = [
  'web_connectivity',
  'whatsapp',
  'telegram',
  'signal',
  'facebook_messenger',
  'tor',
  'psiphon',
  'http_header_field_manipulation',
  'http_invalid_request_line',
  'dnscheck',
];
