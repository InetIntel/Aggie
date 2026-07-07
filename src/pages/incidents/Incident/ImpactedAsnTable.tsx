// Sortable impacted-ASN table (ASN / Organization / Direct + Indirect
// Population Coverage). Extracted from IncidentInfo so the individual incident
// page and the incidents table expanded row render the exact same table with
// no drift. Self-contained: owns its own ASN-metadata fetch and sort state.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSort,
  faSortDown,
  faSortUp,
} from "@fortawesome/free-solid-svg-icons";

import { getAsnsByIds } from "../../../api/asn";
import type { AsnInfoMap } from "../../../api/asn/types";
import { coveragePercent, coverageBorderClass } from "../IncidentCoverage";

type AsnSortKey = "asn" | "direct" | "indirect";

interface IProps {
  asns: string[];
  className?: string;
  /**
   * Tighter layout for narrow containers (e.g. the compare-modal card): drops
   * the table's min-width so it never forces horizontal scroll and shortens the
   * two coverage headers. Default off — the incident page / expanded row keep
   * the full-width table.
   */
  compact?: boolean;
}

const ImpactedAsnTable = ({ asns, className = "", compact = false }: IProps) => {
  const [asnSort, setAsnSort] = useState<{
    key: AsnSortKey;
    direction: "asc" | "desc";
  }>({
    key: "direct",
    direction: "desc",
  });

  const { data: asnMap, isLoading: isAsnLoading } = useQuery<AsnInfoMap>({
    queryKey: ["asn-bulk", asns],
    queryFn: () => getAsnsByIds(asns),
    enabled: asns.length > 0,
  });

  const asnMapByLower = Object.fromEntries(
    Object.entries(asnMap ?? {}).map(([asn, info]) => [asn.toLowerCase(), info])
  );
  const getAsnInfo = (asn: string) => asnMapByLower[asn.toLowerCase()];

  const sortedImpactedAsns = [...asns].sort((a, b) => {
    const aInfo = getAsnInfo(a);
    const bInfo = getAsnInfo(b);

    if (asnSort.key === "asn") {
      const aLabel = String(aInfo?.number ?? a.replace(/^as/i, ""));
      const bLabel = String(bInfo?.number ?? b.replace(/^as/i, ""));
      const aNum = Number(aLabel);
      const bNum = Number(bLabel);

      const sortByString = aLabel.localeCompare(bLabel, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      const sortByNumber =
        Number.isFinite(aNum) && Number.isFinite(bNum)
          ? aNum - bNum
          : sortByString;

      return asnSort.direction === "asc" ? sortByNumber : -sortByNumber;
    }

    const aCoverage =
      asnSort.key === "direct"
        ? aInfo?.populationCoverageDirect
        : aInfo?.populationCoverageIndirect;
    const bCoverage =
      asnSort.key === "direct"
        ? bInfo?.populationCoverageDirect
        : bInfo?.populationCoverageIndirect;

    const aHas = typeof aCoverage === "number";
    const bHas = typeof bCoverage === "number";

    if (aHas && bHas) {
      const diff = (aCoverage as number) - (bCoverage as number);
      return asnSort.direction === "asc" ? diff : -diff;
    }

    if (aHas) return -1;
    if (bHas) return 1;
    return a.localeCompare(b);
  });

  const updateAsnSort = (key: AsnSortKey) => {
    setAsnSort((prev) => {
      if (prev.key !== key) {
        return {
          key,
          direction: key === "asn" ? "asc" : "desc",
        };
      }
      return {
        key,
        direction: prev.direction === "asc" ? "desc" : "asc",
      };
    });
  };

  const getAsnSortIcon = (key: AsnSortKey) => {
    if (asnSort.key !== key) return faSort;
    return asnSort.direction === "asc" ? faSortUp : faSortDown;
  };

  if (!asns.length) {
    return (
      <p className="italic text-slate-600 dark:text-gray-400">No ASN Set</p>
    );
  }

  if (isAsnLoading && !asnMap) {
    return (
      <p className="italic text-slate-600 dark:text-gray-400">
        Loading ASN metadata…
      </p>
    );
  }

  return (
    <div
      // `isolate` creates a stacking context so the sticky thead below can't
      // paint over an outer sticky table header when this table is embedded in
      // another (e.g. the incidents table expanded row).
      className={`isolate w-full max-h-72 overflow-auto rounded-lg border border-slate-300 bg-white dark:bg-gray-800 dark:border-slate-600 ${className}`}
    >
      <table
        // `table-fixed` in compact mode caps the table at the container width so
        // long org names wrap instead of forcing the card to scroll horizontally.
        className={`w-full ${
          compact ? "table-fixed text-xs" : "min-w-[24rem] text-sm"
        }`}
      >
        <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-gray-700 border-b border-slate-300 dark:border-slate-600">
          <tr className="text-center text-slate-600 dark:text-gray-300">
            <th className="px-3 py-2 w-30 font-medium text-black dark:text-gray-300 border-r border-slate-300 dark:border-slate-600 last:border-r-0">
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-gray-100"
                onClick={() => updateAsnSort("asn")}
              >
                ASN
                <FontAwesomeIcon
                  icon={getAsnSortIcon("asn")}
                  className="text-slate-500 dark:text-gray-400"
                />
              </button>
            </th>
            <th className="px-3 py-2 font-medium text-black dark:text-gray-300 border-r border-slate-300 dark:border-slate-600 last:border-r-0">
              Organization
            </th>
            <th className="px-3 py-2 font-medium text-black dark:text-gray-300 w-[25%] border-r border-slate-300 dark:border-slate-600 last:border-r-0">
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-gray-100"
                onClick={() => updateAsnSort("direct")}
                title="Direct Population Coverage"
              >
                {compact ? "Direct" : "Direct Population Coverage"}
                <FontAwesomeIcon
                  icon={getAsnSortIcon("direct")}
                  className="text-slate-500 dark:text-gray-400"
                />
              </button>
            </th>
            <th className="px-3 py-2 font-medium text-black dark:text-gray-300 w-[25%] border-r border-slate-300 dark:border-slate-600 last:border-r-0">
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-gray-100"
                onClick={() => updateAsnSort("indirect")}
                title="Indirect Population Coverage"
              >
                {compact ? "Indirect" : "Indirect Population Coverage"}
                <FontAwesomeIcon
                  icon={getAsnSortIcon("indirect")}
                  className="text-slate-500 dark:text-gray-400"
                />
              </button>
            </th>
          </tr>
        </thead>
        <tbody className="text-center text-slate-800 dark:text-gray-200">
          {sortedImpactedAsns.map((asn) => {
            const info = getAsnInfo(asn);
            const labelNumber = info?.number ?? asn.replace(/^as/i, "");
            const labelName = info?.name?.trim();

            return (
              <tr
                key={asn}
                className="border-b border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-gray-700 last:border-b-0"
              >
                <td className="px-3 py-2 font-medium whitespace-nowrap border-r border-slate-300 dark:border-slate-600 last:border-r-0">
                  {`AS${labelNumber}`}
                </td>
                <td className="px-3 py-2 break-words border-r border-slate-300 dark:border-slate-600 last:border-r-0">
                  {labelName || "—"}
                </td>
                <td className="px-3 py-2 border-r border-slate-300 dark:border-slate-600 last:border-r-0">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 border rounded text-black text-sm font-medium dark:text-gray-300 ${coverageBorderClass(
                      info?.populationCoverageDirect
                    )}`}
                  >
                    {coveragePercent(info?.populationCoverageDirect)}
                  </span>
                </td>
                <td className="px-3 py-2 border-r border-slate-300 dark:border-slate-600 last:border-r-0">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 border rounded text-black text-sm font-medium dark:text-gray-300 ${coverageBorderClass(
                      info?.populationCoverageIndirect
                    )}`}
                  >
                    {coveragePercent(info?.populationCoverageIndirect)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ImpactedAsnTable;
