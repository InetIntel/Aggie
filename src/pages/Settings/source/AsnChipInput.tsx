import { useState } from "react";
import type { ReactNode } from "react";
import { useField } from "formik";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import { getAsnsByIds } from "../../../api/asn";

interface IProps {
  name: string;
  // How the Formik field stores ASNs:
  //   "array"  -> string[] of ASN numbers (IODA's typed `asns` field)
  //   "string" -> comma-separated string  (OONI's legacy `lists` field)
  format: "array" | "string";
  label: string;
  hint?: ReactNode;
  placeholder?: string;
}

// Free-entry chip input for ASNs: type a number and press Enter to add a chip,
// remove with the × button. Accepts any positive-integer ASN typed directly (the
// networks a user wants often aren't in the AsnInfo metadata, e.g. an ASN in an
// upstream country), so it doesn't depend on that collection being populated.
// Provider names are shown as a best-effort nicety when metadata is available.
//
// Backs either storage format so IODA and OONI share one control while keeping
// their existing schema fields (no data migration).
const AsnChipInput = ({ name, format, label, hint, placeholder }: IProps) => {
  const [field, , helpers] = useField(name);
  const [draft, setDraft] = useState("");

  // Normalize the stored value to a string[] of ASN numbers for display.
  const asns: string[] =
    format === "array"
      ? Array.isArray(field.value)
        ? field.value.map(String)
        : []
      : String(field.value || "")
          .split(/[\s,]+/)
          .filter(Boolean);

  // Write back in the field's native format.
  const setAsns = (next: string[]) => {
    helpers.setValue(format === "array" ? next : next.join(", "));
  };

  // Best-effort names for the entered ASNs. Never gates entry.
  const asnKeys = asns.map((n) => `as${n}`);
  const { data: asnInfo } = useQuery(
    ["asn-names", asnKeys.join(",")],
    () => getAsnsByIds(asnKeys),
    { enabled: asnKeys.length > 0, staleTime: 60000 }
  );

  // Keep only positive integers; tolerate an "AS"/"as" prefix and junk.
  const parse = (raw: string) =>
    (raw || "")
      .split(/[\s,]+/)
      .map((t) => t.trim().replace(/^as/i, ""))
      .filter((t) => /^\d+$/.test(t) && Number(t) > 0);

  const commit = (raw: string) => {
    const next = [...asns];
    parse(raw).forEach((n) => {
      if (!next.includes(n)) next.push(n);
    });
    setAsns(next);
    setDraft("");
  };

  const removeAsn = (n: string) => {
    setAsns(asns.filter((existing) => existing !== n));
  };

  return (
    <div className='flex flex-col gap-1'>
      <span className='text-slate-600 dark:text-gray-400'>{label}</span>
      {hint ? (
        <p className='text-xs text-slate-500 dark:text-gray-400'>{hint}</p>
      ) : null}
      <div className='flex flex-wrap gap-2 items-center px-2 py-2 rounded border border-slate-300 bg-slate-50 dark:bg-gray-900'>
        {asns.map((n) => {
          const asnName = asnInfo?.[`as${n}`]?.name;
          return (
            <span
              key={n}
              className='inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-gray-600 px-2 py-1 text-sm font-medium'
            >
              AS{n}
              {asnName ? (
                <span className='font-normal text-slate-500 dark:text-gray-300'>
                  {" "}
                  — {asnName}
                </span>
              ) : null}
              <button
                type='button'
                onClick={() => removeAsn(n)}
                className='text-slate-500 hover:text-slate-800 dark:hover:text-gray-200'
                aria-label={`Remove AS${n}`}
              >
                <FontAwesomeIcon icon={faXmark} size='xs' />
              </button>
            </span>
          );
        })}
        <input
          value={draft}
          inputMode='numeric'
          onChange={(e) => {
            const value = e.target.value;
            if (/[\s,]$/.test(value)) commit(value);
            else setDraft(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && asns.length) {
              removeAsn(asns[asns.length - 1]);
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={
            asns.length ? "Add another…" : placeholder || "e.g. 44244, 58224"
          }
          className='flex-1 min-w-[8rem] bg-transparent focus:outline-none text-black dark:text-gray-300 px-1 py-1'
        />
      </div>
    </div>
  );
};

export default AsnChipInput;
