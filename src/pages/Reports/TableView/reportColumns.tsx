import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDotCircle,
  faExclamationTriangle,
  faMinusCircle,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import type { Report } from "../../../api/reports/types";
import { getGroup } from "../../../api/groups";
import {
  signalToNameColor,
  reportNetwork,
  SIGNAL_BADGE_BASE,
} from "../../../components/SocialMediaPost/reportParser";

import type { DataTableColumn } from "../../../components/DataTable/types";
import ColumnHeaderControls from "../../../components/DataTable/ColumnHeaderControls";
import FilterListBox from "../../../components/filters/FilterListBox";
import FilterDateTime from "../../../components/filters/FilterDateTime";
import LocationFilter, { type LocationOption } from "../../../components/filters/LocationFilter";
import FilterComboBox from "../../../components/filters/FilterComboBox";
import HeaderListFilter from "../../../components/DataTable/HeaderListFilter";
import type { ReportQueryState } from "../../../api/reports/types";
import {
  ALERT_MEDIA_OPTIONS,
  DATA_SOURCE_OPTIONS,
  providerLabel,
} from "../../../api/common";
import SocialMediaIcon from "../../../components/SocialMediaPost/SocialMediaIcon";
import AggieToken from "../../../components/AggieToken";
import DateTime from "../../../components/DateTime";

const dash = <span className='text-slate-500 dark:text-gray-400'>—</span>;

// Raw datasource → human label + color, e.g. "bgp" → "BGP".
export const reportSignal = (report: Report): [string, string] => {
  const raw = report?.metadata?.rawAPIResponse?.rawEvent?.datasource;
  if (!raw) return ["", ""];
  return signalToNameColor(raw) as [string, string];
};

const PlatformCell = ({ report }: { report: Report }) => (
  <span className='text-slate-600 dark:text-gray-400'>
    <SocialMediaIcon mediaKey={report._media?.[0]} />
  </span>
);

// ASN emphasized on top, network name below, geo scope (country/region) last.
const NetworkCell = ({ report }: { report: Report }) => {
  const { asn, network, scope } = reportNetwork(report);
  if (!asn && !network && !scope) return dash;
  return (
    <div className='flex flex-col items-start leading-tight'>
      {asn && (
        <span className='font-medium text-slate-700 dark:text-gray-300'>{asn}</span>
      )}
      {network && (
        <span className='block truncate text-slate-500 dark:text-gray-400'>
          {network}
        </span>
      )}
      {scope && (
        <span className='block truncate text-xs text-slate-400 dark:text-gray-500'>
          {scope}
        </span>
      )}
    </div>
  );
};

const StatusCell = ({ report }: { report: Report }) => (
  <div className='flex flex-col gap-1 items-start'>
    <span
      className={
        report.read
          ? "text-slate-500 dark:text-gray-400"
          : "text-blue-700 font-medium dark:text-blue-300"
      }
    >
      {report.read ? "Read" : "Unread"}
    </span>
    {report.irrelevant === "true" && (
      <AggieToken variant='light:red' icon={faXmark} className='text-xs'>
        Ignore
      </AggieToken>
    )}
    {report.irrelevant === "false" && (
      <AggieToken variant='light:green' icon={faDotCircle} className='text-xs'>
        Investigate
      </AggieToken>
    )}
  </div>
);

const SignalCell = ({ report }: { report: Report }) => {
  const [signal, bgColor] = reportSignal(report);
  if (!signal) return dash;
  return (
    <AggieToken
      className={`${bgColor} ${SIGNAL_BADGE_BASE} text-xs px-1.5 py-0.5 whitespace-nowrap`}
    >
      {signal}
    </AggieToken>
  );
};

// Linked-incident chip; fetches the group lazily like ReportListItem does.
const IncidentCell = ({ report }: { report: Report }) => {
  const { data: incident } = useQuery(
    ["group", report._group],
    () => getGroup(report._group),
    { enabled: !!report._group },
  );

  if (!report._group || !incident) return dash;

  return (
    <Link
      to={`/incidents/${incident._id}`}
      className={`inline-flex items-center gap-1 max-w-full min-w-0 rounded-lg px-1.5 py-0.5 text-sm border border-slate-300 hover:bg-white dark:hover:bg-gray-800 ${
        incident.closed
          ? "bg-purple-50 dark:bg-purple-50 dark:saturate-[0.7] text-purple-700"
          : "bg-slate-50 dark:bg-gray-900 text-slate-700 dark:text-gray-300"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className='truncate min-w-0 font-medium'>{incident.title}</span>
      {incident.escalated && (
        <FontAwesomeIcon icon={faExclamationTriangle} className='text-red-500' />
      )}
      {incident.closed && (
        <FontAwesomeIcon icon={faMinusCircle} className='text-purple-500' />
      )}
      <span className='whitespace-nowrap'>#{incident.idnum}</span>
    </Link>
  );
};

// Display order is fixed here; collapse order is encoded independently by
// `collapsePriority` (higher = more persistent). As the table narrows, columns
// collapse in this order: signal → status → Incident → date → ASN; platform has
// no priority so it always stays. Widths are the per-column minimums.
interface GroupOption {
  key: string;
  value: string;
  data: { _id: string; title: string; idnum: number };
  searchstring: string;
}

interface BuildReportColumnsOptions {
  query: ReportQueryState;
  onFilterChange: (values: Partial<ReportQueryState>) => void;
  locationOptions?: Record<"countries" | "asns" | "regions" | "networks", LocationOption[]>;
  locationsLoading: boolean;
  locationsError: boolean;
  groupOptions: GroupOption[];
}

const SORT_KEYS = {
  platform: ["ascPlatform", "descPlatform"],
  status: ["ascStatus", "descStatus"],
  date: ["ascDate", "descDate"],
  source: ["ascAsn", "descAsn"],
  signal: ["ascSignal", "descSignal"],
} as const;

export const buildReportColumns = ({
  query,
  onFilterChange,
  locationOptions,
  locationsLoading,
  locationsError,
  groupOptions,
}: BuildReportColumnsOptions): DataTableColumn<Report>[] => {
  const sort = (field: keyof typeof SORT_KEYS) => {
    const [ascending, descending] = SORT_KEYS[field];
    const direction =
      query.sortBy === ascending ||
      (field === "date" && !query.sortBy && query.sort === "oldest")
        ? ("asc" as const)
        : query.sortBy === descending ||
            (field === "date" && !query.sortBy && !query.sort)
          ? ("desc" as const)
          : null;
    return {
      label: field,
      direction,
      onChange: (nextDirection: "asc" | "desc") =>
        onFilterChange({
          sortBy: nextDirection === "asc" ? ascending : descending,
          sort: undefined,
        }),
    };
  };
  const selectedValues = (value?: string | string[]) =>
    Array.isArray(value) ? value : String(value ?? "").split(",").filter(Boolean);

  return [
  {
    id: "platform",
    header: "Platform",
    headerActionIsLabel: true,
    headerAction: (
      <ColumnHeaderControls>
        <FilterListBox
          headerStyle
          label="Platform"
          options={[...ALERT_MEDIA_OPTIONS]}
          value={selectedValues(query.media)}
          isMultiSelect
          getOptionLabel={providerLabel}
          onChange={(value) => {
            const media = value as string[];
            onFilterChange({ media: media.length ? media.join(",") : undefined });
          }}
        />
      </ColumnHeaderControls>
    ),
    minWidth: 100,
    tdClassName: "whitespace-nowrap",
    spilloverLabel: "Platform",
    cell: (report) => <PlatformCell report={report} />,
  },
  {
    id: "status",
    header: "Status",
    headerActionIsLabel: true,
    headerAction: (
      <ColumnHeaderControls>
        <FilterListBox
          headerStyle
          label="Read status"
          options={["Read", "Unread"]}
          value={query.status ?? ""}
          onChange={(value) =>
            onFilterChange({ status: (value as string) || undefined })
          }
        />
        <FilterListBox
          headerStyle
          label="Triage"
          options={["Investigate", "Ignore"]}
          value={
            query.irrelevant === "false"
              ? "Investigate"
              : query.irrelevant === "true"
                ? "Ignore"
                : ""
          }
          onChange={(value) =>
            onFilterChange({
              irrelevant:
                value === "Investigate"
                  ? "false"
                  : value === "Ignore"
                    ? "true"
                    : undefined,
            })
          }
        />
      </ColumnHeaderControls>
    ),
    minWidth: 240,
    collapsePriority: 2,
    cell: (report) => <StatusCell report={report} />,
  },
  {
    id: "date",
    header: "Date",
    headerActionIsLabel: true,
    headerAction: (
      <ColumnHeaderControls sort={{ ...sort("date"), dual: true }}>
        <FilterDateTime
          headerStyle
          label="Date"
          before={String(query.before ?? "")}
          after={String(query.after ?? "")}
          onSetBefore={(before) =>
            onFilterChange({ before: before || undefined })
          }
          onSetAfter={(after) =>
            onFilterChange({ after: after || undefined })
          }
        />
      </ColumnHeaderControls>
    ),
    minWidth: 200,
    collapsePriority: 4,
    tdClassName: "whitespace-nowrap text-xs",
    cell: (report) => <DateTime dateString={report.authoredAt} />,
  },
  {
    id: "source",
    header: "ASN / Network / Geo Scope",
    headerActionIsLabel: true,
    headerAction: (
      <ColumnHeaderControls>
        <HeaderListFilter
          label="Network"
          searchPlaceholder="Search network name"
          options={(locationOptions?.networks ?? []).map((o) => ({
            value: o.key,
            label: o.label,
          }))}
          loading={locationsLoading}
          value={String(query.network ?? "")}
          onSelect={(value) => onFilterChange({ network: value || undefined })}
        />
        {(["asns", "countries", "regions"] as const).map((kind) => (
          <LocationFilter
            headerStyle
            key={kind}
            label={{ asns: "ASNs", countries: "Countries", regions: "Regions" }[kind]}
            options={locationOptions?.[kind] ?? []}
            value={selectedValues(query[kind])}
            loading={locationsLoading}
            error={locationsError}
            onChange={(values) =>
              onFilterChange({ [kind]: values.length ? values : undefined })
            }
          />
        ))}
      </ColumnHeaderControls>
    ),
    minWidth: 325,
    collapsePriority: 5,
    cell: (report) => <NetworkCell report={report} />,
  },
  {
    id: "incident",
    header: "Incident",
    headerActionIsLabel: true,
    headerAction: (
      <FilterComboBox
        headerStyle
        label="Incident"
        list={groupOptions}
        selectedKey={query.groupId}
        onChange={(item) =>
          onFilterChange({ groupId: item.key || undefined })
        }
      />
    ),
    minWidth: 200,
    collapsePriority: 3,
    grow: true,
    cell: (report) => <IncidentCell report={report} />,
  },
  {
    id: "signal",
    header: "Signal",
    headerActionIsLabel: true,
    headerAction: (
      <FilterListBox
        headerStyle
        label="Signal"
        options={[...DATA_SOURCE_OPTIONS]}
        value={selectedValues(query.dataSources)}
        isMultiSelect
        onChange={(value) => {
          const sources = value as string[];
          onFilterChange({
            dataSources: sources.length ? sources : undefined,
          });
        }}
      />
    ),
    minWidth: 200,
    collapsePriority: 1,
    noSpillover: true, // signal already shown by the IODA badge in the expanded detail
    cell: (report) => <SignalCell report={report} />,
  },
  ];
};
