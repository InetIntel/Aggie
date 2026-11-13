import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLock,
  faPencil,
  faTrash,
  faUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";

import type { Group } from "../../../api/groups/types";
import { getGroupFilterOptions, getGroupReports } from "../../../api/groups";
import { useIncidentMutations } from "../useIncidentMutations";
import { IncidentOverallStatus } from "../IncidentStatuses";
import { CoverageBadge, coveragePercent } from "../IncidentCoverage";
import ImpactedAsnTable from "../Incident/ImpactedAsnTable";
import GroupReportListItem from "../Incident/GroupReportListItem";
import AsnChips from "./AsnChips";
import { formatDurationFromSeconds } from "../../../utils/format";
import { useFormatters } from "../../../utils/useFormatters";
import { getUserDirectory } from "../../../api/users";
import type { GroupSortBy } from "../../../api/common";

import DataTable from "../../../components/DataTable/DataTable";
import ColumnHeaderControls from "../../../components/DataTable/ColumnHeaderControls";
import LocationFilter from "../../../components/filters/LocationFilter";
import { getAlertFilterOptions } from "../../../api/reports";
import HeaderListFilter from "../../../components/DataTable/HeaderListFilter";
import type {
  DataTableColumn,
  DataTableSelection,
} from "../../../components/DataTable/types";
import AggieButton from "../../../components/AggieButton";
import AggieDialog from "../../../components/AggieDialog";
import ConfirmationDialog from "../../../components/ConfirmationDialog";
import CreateEditIncidentForm from "../CreateEditIncidentForm";
import FilterListBox from "../../../components/filters/FilterListBox";
import FilterDateTime from "../../../components/filters/FilterDateTime";
import type { GroupQueryState } from "../../../api/groups/types";

interface IProps {
  data: Group[];
  isLoading?: boolean;
  selection?: DataTableSelection<Group>;
  query: GroupQueryState;
  onFilterChange: (values: Partial<GroupQueryState>) => void;
}

const formatAssignedTo = (group: Group) => {
  if (!group.assignedTo || group.assignedTo.length === 0) return null;
  return group.assignedTo
    .map(
      (u) =>
        (u && typeof u === "object" && "username" in u && u.username) || "",
    )
    .filter(Boolean)
    .join(", ");
};

const AlertsCount = ({ count }: { count: number }) => (
  <>
    <span
      className={`font-semibold ${
        count > 0
          ? "text-red-700 dark:text-red-300"
          : "text-slate-500 dark:text-gray-400"
      }`}
    >
      {count}
    </span>
    {count > 0 && (
      <span className="ml-1 text-xs text-slate-500 dark:text-gray-400">
        reports
      </span>
    )}
  </>
);

// The incident's alerts, rendered the same way the incident detail page does
// (getGroupReports -> GroupReportListItem -> SocialMediaListItem). Mounted inside
// DataTable's expandedContent, which only renders when a row is expanded, so the
// per-incident fetch fires lazily on expand. Read-only here: select-mode props are
// stubbed since report management lives on the detail page.
const IncidentAlertsList = ({ groupId }: { groupId: string }) => {
  const { data, isLoading } = useQuery(["groups", "reports", { groupId }], () =>
    getGroupReports({ groupId }),
  );
  if (isLoading)
    return (
      <span className="text-slate-500 dark:text-gray-400">
        Loading reports…
      </span>
    );
  const results = data?.results ?? [];
  if (results.length === 0)
    return (
      <span className="text-slate-500 dark:text-gray-400">No reports.</span>
    );
  return (
    <div className="flex flex-col rounded-lg bg-slate-50 dark:bg-gray-900 border border-slate-300 dark:border-gray-600 divide-y divide-slate-200 dark:divide-gray-700">
      {results.map((report) => (
        <GroupReportListItem
          key={report._id}
          report={report}
          isChecked={false}
          isSelectMode={false}
          onCheckChange={() => {}}
          hideCheckbox
        />
      ))}
    </div>
  );
};

const IncidentsTable = ({
  data,
  isLoading,
  selection,
  query,
  onFilterChange,
}: IProps) => {
  const [editTarget, setEditTarget] = useState<Group | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

  const { doUpdate, doRemove } = useIncidentMutations();
  const { formatDate, formatTime, formatTimeZone } = useFormatters();
  const { data: users } = useQuery(["users", "directory"], getUserDirectory);
  // Full lists for the Title / ASN header dropdowns (not just the current page).
  // Alert ASN options are only used to look up a network name to show next to each ASN.
  const asnQuery = useQuery(["alert-filter-options"], getAlertFilterOptions);
  const { data: filterOptions, isLoading: allGroupsLoading } = useQuery(
    ["groups", "filter-options"],
    getGroupFilterOptions,
  );
  const { titleOptions, idOptions, asnOptions } = useMemo(() => {
    const groups = filterOptions?.incidents ?? [];
    const titles = [...groups]
      .sort((a, b) => (b.idnum ?? 0) - (a.idnum ?? 0))
      .map((g) => ({ value: `#${g.idnum}`, label: `#${g.idnum} ${g.title}` }));
    const ids = [...groups]
      .sort((a, b) => (a.idnum ?? 0) - (b.idnum ?? 0))
      .map((g) => ({ value: String(g.idnum), label: `#${g.idnum}` }));
    // The ASN picker lists the ASNs incidents actually use (impactedAsns), so
    // every choice returns at least one incident. Names come from the alert options.
    const normalize = (asn: string) => asn.trim().toLowerCase().replace(/^as/, "");
    const nameByAsn = new Map(
      (asnQuery.data?.asns ?? []).map((o) => [normalize(o.key), o.label]),
    );
    const asns = (filterOptions?.asns ?? [])
      .slice()
      .sort((a, b) => normalize(a).localeCompare(normalize(b), undefined, { numeric: true }))
      .map((asn) => ({
        key: asn,
        label: nameByAsn.get(normalize(asn)) ?? asn.toUpperCase(),
      }));
    return { titleOptions: titles, idOptions: ids, asnOptions: asns };
  }, [filterOptions, asnQuery.data]);

  const updateFilters = (values: Partial<GroupQueryState>) =>
    onFilterChange({ ...values, page: undefined });
  const sortControl = (
    label: string,
    ascending: GroupSortBy,
    descending: GroupSortBy,
  ) => ({
    label,
    dual: true,
    direction:
      query.sortBy === ascending
        ? ("asc" as const)
        : query.sortBy === descending
          ? ("desc" as const)
          : null,
    onChange: (direction: "asc" | "desc") =>
      updateFilters({ sortBy: direction === "asc" ? ascending : descending }),
  });
  const searchControl = (
    label: string,
    key: "title" | "idnum" | "impactedAsn" | "totalReports",
    placeholder?: string,
    inputType?: "search" | "number",
  ) => ({
    label,
    value: String(query[key] ?? ""),
    placeholder,
    inputType,
    min: inputType === "number" ? (key === "idnum" ? 1 : 0) : undefined,
    step: inputType === "number" ? 1 : undefined,
    onChange: (value: string) =>
      updateFilters({ [key]: value || undefined }),
  });

  // Display order is fixed here; collapse order is encoded independently by
  // `collapsePriority` (higher = more persistent). As the table narrows, columns
  // collapse in this order: Assigned To → # Of Reports → IPC → DPC → Status →
  // ASN → Date → Title; ID# has no priority so it always stays. Widths are the
  // per-column minimums.
  const columns: DataTableColumn<Group>[] = [
    {
      id: "idnum",
      header: "ID#",
      headerActionIsLabel: true,
      headerAction: (
        <ColumnHeaderControls sort={sortControl("ID", "ascId", "descId")}>
          <HeaderListFilter
            label="ID#"
            searchPlaceholder="Search incident ID"
            options={idOptions}
            loading={allGroupsLoading}
            value={String(query.idnum ?? "")}
            displayValue={query.idnum ? `#${query.idnum}` : undefined}
            onSelect={(value) => {
              const id = value.replace(/^#/, "").trim();
              updateFilters({ idnum: /^\d+$/.test(id) ? id : undefined });
            }}
          />
        </ColumnHeaderControls>
      ),
      minWidth: 75,
      tdClassName:
        "text-slate-600 dark:text-gray-400 font-medium whitespace-nowrap",
      cell: (inc) => <>#{inc.idnum}</>,
    },
    {
      id: "title",
      header: "Incident Title",
      headerActionIsLabel: true,
      headerAction: (
        <HeaderListFilter
          label="Incident Title"
          searchPlaceholder="Search incident title"
          options={titleOptions}
          loading={allGroupsLoading}
          value={String(query.title ?? "")}
          displayValue={
            titleOptions.find((o) => o.value === query.title)?.label ??
            String(query.title ?? "")
          }
          onSelect={(value) => updateFilters({ title: value || undefined })}
        />
      ),
      // Explicit px width (via `minWidth`), not auto. Under the table's fixed
      // layout a full-width `colSpan` cell — the expanded detail row — shrinks
      // any *auto*-width column to its min-content (title once collapsed to a
      // vertical single-letter stack on expand). An explicit width can't be
      // collapsed by the span. No `grow` here: the title stays fixed at this
      // width and long titles wrap onto additional lines instead of widening
      // the column (which leaves leftover table width unfilled on wide screens).
      minWidth: 300,
      collapsePriority: 8,
      thClassName: "pr-4",
      // Word-level wrapping only — NOT `overflow-wrap: anywhere`, which would drop
      // the min-content to one character. Titles wrap to as many lines as needed.
      tdClassName: "pr-4",
      cell: (inc) => {
        const reportCount = inc._reports?.length ?? 0;
        return (
          <>
            <Link
              to={`/incidents/${inc._id}`}
              className="text-blue-700 hover:underline font-medium dark:text-blue-300 leading-snug break-words"
              onClick={(e) => e.stopPropagation()}
            >
              {inc.title}
            </Link>
            <div className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
              {reportCount} {reportCount === 1 ? "report" : "reports"}
            </div>
            {inc.accessPolicy?.mode === "restricted" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-100 px-1 rounded mt-1">
                <FontAwesomeIcon icon={faLock} /> Restricted
              </span>
            )}
          </>
        );
      },
    },
    {
      id: "date",
      header: "Date",
      headerActionIsLabel: true,
      headerAction: (
        <ColumnHeaderControls
          sort={sortControl("start date", "ascStartDate", "descStartDate")}
        >
          <FilterDateTime
            headerStyle
            label="Date"
            before={String(query.before ?? "")}
            after={String(query.after ?? "")}
            onSetBefore={(before) => updateFilters({ before: before || undefined })}
            onSetAfter={(after) => updateFilters({ after: after || undefined })}
          />
        </ColumnHeaderControls>
      ),
      minWidth: 275,
      collapsePriority: 7,
      noSpillover: true, // duration already shown in the expanded detail
      tdClassName: "whitespace-nowrap text-xs",
      cell: (inc) => {
        const tzStart = formatTimeZone(inc.incidentStartedAt);
        const tzEnd = formatTimeZone(inc.incidentEndedAt);
        return (
          <div className="flex flex-col text-left leading-tight">
            <span className="uppercase tracking-wide text-[12px] font-bold text-slate-500 dark:text-gray-400">
              Start:
            </span>
            <div className="flex items-baseline gap-x-2">
              <span>{formatDate(inc.incidentStartedAt)}</span>
              <span>
                {formatTime(inc.incidentStartedAt)}
                {tzStart && (
                  <span className="text-slate-400 dark:text-gray-500">
                    {" "}
                    {tzStart}
                  </span>
                )}
              </span>
            </div>
            <span className="uppercase tracking-wide text-[12px] font-bold text-slate-500 dark:text-gray-400 mt-1">
              End:
            </span>
            <div className="flex items-baseline gap-x-2">
              <span>{formatDate(inc.incidentEndedAt)}</span>
              <span>
                {formatTime(inc.incidentEndedAt)}
                {tzEnd && (
                  <span className="text-slate-400 dark:text-gray-500">
                    {" "}
                    {tzEnd}
                  </span>
                )}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      id: "asn",
      header: "ASN(s)",
      headerActionIsLabel: true,
      headerAction: (
        <LocationFilter
          headerStyle
          label="ASN(s)"
          options={asnOptions}
          loading={allGroupsLoading}
          error={false}
          value={String(query.impactedAsn ?? "").split(",").filter(Boolean)}
          onChange={(values) =>
            updateFilters({ impactedAsn: values.length ? values.join(",") : undefined })
          }
        />      ),
      minWidth: 160,
      collapsePriority: 6,
      // Absorbs the table's leftover width so the ASN chips get more room than
      // their 160px minimum (others stay at `minWidth`). One `grow` per table.
      grow: true,
      tdClassName: "align-top",
      cell: (inc) => (
        <div className="flex flex-col items-start gap-0.5 leading-tight w-full">
          <AsnChips asns={inc.impactedAsns} max={9} />
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      headerActionIsLabel: true,
      headerAction: (
        <ColumnHeaderControls>
          <FilterListBox
            headerStyle
            label="Status"
            options={[
              "Verifying Measurement",
              "Published",
              "Unable to Confirm",
              "Confirmed",
            ]}
            value={String(query.tableStatus ?? "")
              .split(",")
              .filter(Boolean)}
            isMultiSelect
            onChange={(value) => {
              const statuses = value as string[];
              updateFilters({
                tableStatus: statuses.length ? statuses.join(",") : undefined,
              });
            }}
            toggleLabel="Include closed"
            toggleDescription="Also show closed incidents."
            toggleValue={query.closed === "all"}
            onToggleChange={(value) =>
              updateFilters({ closed: value ? "all" : undefined })
            }
          />
        </ColumnHeaderControls>
      ),

      minWidth: 240,
      collapsePriority: 5,
      tdClassName: "whitespace-nowrap",
      cell: (inc) => (
        <IncidentOverallStatus
          group={inc}
          colorless
          className="px-1.5 py-0.5 rounded-full font-medium text-xs text-slate-600 dark:text-gray-400 inline-flex gap-1 items-center no-underline w-fit"
        />
      ),
    },
    {
      id: "dpc",
      header: "DPC",
      headerAction: (
        <ColumnHeaderControls
          sort={sortControl("DPC", "ascDpc", "descDpc")}
        />
      ),
      minWidth: 85,
      collapsePriority: 4,
      noSpillover: true, // shown in the expanded detail metadata
      tdClassName: "whitespace-nowrap text-xs align-top",
      cell: (inc) => (
        coveragePercent(inc.directPopulationCoverageScore)
      ),
    },
    {
      id: "ipc",
      header: "IPC",
      headerAction: (
        <ColumnHeaderControls
          sort={sortControl("IPC", "ascIpc", "descIpc")}
        />
      ),
      minWidth: 85,
      collapsePriority: 3,
      noSpillover: true,
      tdClassName: "whitespace-nowrap text-xs align-top",
      cell: (inc) => (
        coveragePercent(inc.indirectPopulationCoverageScore)
      ),
    },
    {
      id: "alertsReport",
      header: "# Of Reports",
      headerActionIsLabel: true,
      headerAction: (
        <ColumnHeaderControls
          search={{
            ...searchControl(
              "report count",
              "totalReports",
              "Exact report count",
              "number",
            ),
            headerLabel: "# Of Reports",
          }}
          sort={sortControl("report count", "ascReports", "descReports")}
        />
      ),
      minWidth: 100,
      collapsePriority: 2,
      noSpillover: true, // shown in the expanded detail metadata
      cell: (inc) => <AlertsCount count={inc._reports?.length ?? 0} />,
    },
    {
      id: "assignedTo",
      header: "Assigned To",
      headerActionIsLabel: true,
      headerAction: (
        <ColumnHeaderControls
          sort={sortControl("assignee", "ascAssigned", "descAssigned")}
        >
          <FilterListBox
            headerStyle
            label="Assigned To"
            options={[
              "none",
              ...(users ?? []).map((user) => user._id),
            ]}
            value={String(query.assignedTo ?? "")}
            getOptionLabel={(id) =>
              id === "none"
                ? "Not Assigned"
                : users?.find((user) => user._id === id)?.username ?? id
            }
            onChange={(value) =>
              updateFilters({ assignedTo: (value as string) || undefined })
            }
          />
        </ColumnHeaderControls>
      ),
      minWidth: 140,
      collapsePriority: 1,
      noSpillover: true, // shown in the expanded detail metadata
      cell: (inc) =>
        formatAssignedTo(inc) || (
          <span className="text-slate-500 dark:text-gray-400">—</span>
        ),
    },
  ];

  return (
    <>
      <DataTable
        data={data}
        isLoading={isLoading}
        getRowKey={(inc) => inc._id}
        columns={columns}
        selection={selection}
        hideExpandBar
        connectedExpanded
        tableClassName="text-xs"
        actionsColWidth={176}
        rowActions={(inc) => {
          // Match the alerts table's action buttons (read/investigate/ignore):
          // shared AggieButton styling, right-aligned so they line up across rows.
          const btnSize = "text-[10px] md:text-xs xl:text-sm";
          const btnPadding = "px-1 py-0.5 xl:px-1.5 xl:py-1";
          return (
            <div className="flex items-center justify-end gap-0.5 xl:gap-1">
              {/* Open-external stays a Link (preserves middle-click / open-in-new-tab)
                  but is styled to match the AggieButtons beside it. */}
              <Link
                to={`/incidents/${inc._id}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={`View incident #${inc.idnum}`}
                title={`View incident #${inc.idnum}`}
                className={`inline-flex items-center rounded-lg border border-slate-300 ${btnSize} ${btnPadding} hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-600 dark:text-gray-400`}
              >
                <FontAwesomeIcon icon={faUpRightFromSquare} />
              </Link>
              <AggieButton permission="edit data" permissionResource={inc}
                variant="light:green"
                className={`rounded-lg border border-slate-300 ${btnSize}`}
                padding={btnPadding}
                icon={faPencil}
                title="Edit incident"
                aria-label={`Edit incident ${inc.idnum}`}
                onClick={() => setEditTarget(inc)}
              />
              <AggieButton permission="edit data" permissionResource={inc}
                variant="light:rose"
                className={`rounded-lg border border-slate-300 ${btnSize}`}
                padding={btnPadding}
                icon={faTrash}
                title="Delete incident"
                aria-label={`Delete incident ${inc.idnum}`}
                onClick={() => setDeleteTarget(inc)}
              />
            </div>
          );
        }}
        expandedContent={(inc) => (
          <div className="flex flex-col gap-4 text-xs">
            <div className="flex flex-col min-[1456px]:flex-row gap-y-4 gap-x-8">
              {/* Left: incident metadata as inline "Label: value" rows */}
              <div className="min-[1456px]:flex-1 min-[1456px]:min-w-0 flex flex-col gap-1">
                <div className="flex gap-1">
                  <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                    Assigned To:
                  </strong>
                  {formatAssignedTo(inc) || (
                    <span className="text-slate-500 dark:text-gray-400">—</span>
                  )}
                </div>
                <div className="flex gap-1 items-center">
                  <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                    Direct Population Coverage:
                  </strong>
                  <CoverageBadge value={inc.directPopulationCoverageScore} />
                </div>
                <div className="flex gap-1 items-center">
                  <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                    Indirect Population Coverage:
                  </strong>
                  <CoverageBadge value={inc.indirectPopulationCoverageScore} />
                </div>
                <div className="flex gap-1 items-center">
                  <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                    # of Reports:
                  </strong>
                  <span
                    className={`font-semibold ${
                      (inc._reports?.length ?? 0) > 0
                        ? "text-red-700 dark:text-red-300"
                        : "text-slate-500 dark:text-gray-400"
                    }`}
                  >
                    {inc._reports?.length ?? 0}
                  </span>
                </div>
                <div className="flex gap-1">
                  <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                    Incident duration:
                  </strong>
                  {formatDurationFromSeconds(inc.incidentDurationSeconds)}
                </div>
                <div className="flex gap-1">
                  <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                    Notes:
                  </strong>
                  {inc.notes ? (
                    <span className="whitespace-pre-line">{inc.notes}</span>
                  ) : (
                    <span className="italic text-slate-500 dark:text-gray-400">
                      No notes recorded.
                    </span>
                  )}
                </div>
                {inc.locationName && (
                  <div className="flex gap-1 text-slate-600 dark:text-gray-300">
                    <strong className="text-teal-900 dark:text-teal-200 shrink-0">
                      Location:
                    </strong>
                    {inc.locationName}
                  </div>
                )}
              </div>

              {/* Divider: a vertical bar between the columns when side-by-side,
                a thin horizontal line once the ASN table wraps underneath. */}
              <div className="border-t min-[1456px]:border-t-0 min-[1456px]:border-l border-slate-300 dark:border-gray-600" />

              {/* Right (drops to the bottom when narrow): impacted ASN table.
                Equal flex-1 with the left column so the divider stays centered
                and the empty "No ASN Set" state keeps the same placement. */}
              <div className="min-[1456px]:flex-1 min-[1456px]:min-w-0">
                <strong className="text-teal-900 dark:text-teal-200">
                  Impacted ASNs:
                </strong>
                <div className="mt-1">
                  <ImpactedAsnTable asns={inc.impactedAsns ?? []} />
                </div>
              </div>
            </div>

            {/* Full-width alerts list, rendered like the incident detail page.
              Lazy-fetched per incident (only mounts when the row is expanded). */}
            <div className="w-full">
              <strong className="text-teal-900 dark:text-teal-200">
                Reports ({inc._reports?.length ?? 0}):
              </strong>
              <div className="mt-1">
                <IncidentAlertsList groupId={inc._id} />
              </div>
            </div>
          </div>
        )}
      />

      <AggieDialog
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        className="px-3 py-4 w-full max-w-lg"
        data={{ title: "Edit Incident" }}
      >
        {editTarget && (
          <CreateEditIncidentForm
            group={editTarget}
            onCancel={() => setEditTarget(null)}
            onSubmit={(values) =>
              doUpdate.mutate(
                { ...values, _id: editTarget._id },
                { onSuccess: () => setEditTarget(null) },
              )
            }
            isLoading={doUpdate.isLoading}
          />
        )}
      </AggieDialog>

      <ConfirmationDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          doRemove.mutate(deleteTarget, {
            onSuccess: () => setDeleteTarget(null),
          });
        }}
        disabled={doRemove.isLoading}
        loading={doRemove.isLoading}
        title={`Delete incident ${deleteTarget?.title}?`}
        variant="danger"
        description="This action cannot be undone."
        className="max-w-md w-full"
        confirmText="Delete"
      >
        <p>
          There are {deleteTarget?._reports?.length ?? 0} report(s) attached,
          which will be permanently removed.
        </p>
      </ConfirmationDialog>
    </>
  );
};

export default IncidentsTable;
