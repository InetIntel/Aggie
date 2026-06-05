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
import { formatText } from "../../../utils/format";
import { signalToNameColor } from "../../../components/SocialMediaPost/reportParser";

import type { DataTableColumn } from "../../../components/DataTable/types";
import SocialMediaIcon from "../../../components/SocialMediaPost/SocialMediaIcon";
import AggieToken from "../../../components/AggieToken";
import DateTime from "../../../components/DateTime";

const dash = <span className='text-slate-500 dark:text-gray-400'>—</span>;

// Mirrors renderAuthor() in SocialMediaListItem: who/what produced the alert.
export const reportSource = (report: Report): string => {
  const media = report._media?.[0];
  if (media === "ioda") return "IODA";
  if (media === "cloudflare")
    return report?.metadata?.rawAPIResponse?.dataSource || "Cloudflare";
  return report._sourceNicknames?.[0] || report.author || "";
};

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
      className={`${bgColor} font-medium px-1 rounded-lg text-sm text-white dark:text-gray-300`}
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
      className={`inline-flex items-center gap-1 max-w-full min-w-0 rounded-lg px-2 py-1 border border-slate-300 hover:bg-white dark:hover:bg-gray-800 ${
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

export const buildReportColumns = (): DataTableColumn<Report>[] => [
  {
    id: "platform",
    header: "Platform",
    thClassName: "w-16",
    tdClassName: "whitespace-nowrap",
    spilloverLabel: "Platform",
    cell: (report) => <PlatformCell report={report} />,
  },
  {
    id: "content",
    header: "Content",
    thClassName: "pr-4",
    // `break-words` lets long unbreakable tokens (URLs, ASN strings) wrap so the
    // cell can shrink; without it the table can't fit narrow viewports.
    tdClassName: "pr-4 min-w-0 max-w-[28rem] break-words",
    cell: (report) => (
      <div className='line-clamp-2 break-words text-slate-700 dark:text-gray-300'>
        {formatText(report.content)}
      </div>
    ),
  },
  {
    id: "status",
    header: "Status",
    thClassName: "w-24",
    cell: (report) => <StatusCell report={report} />,
  },
  {
    id: "date",
    header: "Date",
    bucket: "md",
    thClassName: "w-24",
    tdClassName: "whitespace-nowrap text-xs",
    cell: (report) => <DateTime dateString={report.authoredAt} />,
  },
  {
    id: "source",
    header: "Source",
    bucket: "lg",
    thClassName: "w-28",
    tdClassName: "max-w-[7rem]",
    cell: (report) =>
      reportSource(report) ? (
        <span className='block truncate'>{reportSource(report)}</span>
      ) : (
        dash
      ),
  },
  {
    id: "incident",
    header: "Incident",
    bucket: "lg",
    thClassName: "w-32",
    tdClassName: "max-w-[11rem]",
    cell: (report) => <IncidentCell report={report} />,
  },
  {
    id: "signal",
    header: "Signal",
    bucket: "xl",
    thClassName: "w-32",
    cell: (report) => <SignalCell report={report} />,
  },
];
