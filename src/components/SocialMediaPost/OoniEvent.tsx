import { useQuery } from "@tanstack/react-query";
import type { Report } from "../../api/reports/types";
import { getTags } from "../../api/tags";
import { useFormatters } from "../../utils/useFormatters";
import { SIGNAL_BADGE_CLASS } from "./reportParser";
import AggieToken from "../AggieToken";

// Matches the sky-blue tag badge style used in the Alerts list header.
const TAG_BADGE_CLASS = "bg-sky-500 dark:bg-sky-500 dark:saturate-[0.7]";

const OoniEvent = ({ report }: { report: Report }) => {
  const { formatDateTime } = useFormatters();
  const { data: allTags } = useQuery(["tags"], getTags, { staleTime: 40000 });
  const tagNames = (report.smtcTags || [])
    .map((id) => allTags?.find((t) => t._id === id)?.name)
    .filter((name): name is string => !!name);
  const raw = report.metadata?.rawAPIResponse;
  const trigger = raw?.triggers?.[0];
  const asn = raw?.probeASN ? `AS${raw.probeASN}` : report.author;
  const zeroDomains: string[] = raw?.zeroDomains || [];

  const windowEnd = raw?.windowEnd || trigger?.windowEnd;

  return (
    <div className='space-y-3'>
      <p className='whitespace-pre-wrap break-words flex flex-wrap items-baseline gap-2'>
        {tagNames.map((name) => (
          <AggieToken key={name} className={`${TAG_BADGE_CLASS} ${SIGNAL_BADGE_CLASS} shrink-0`}>
            {name}
          </AggieToken>
        ))}
        <span>
          {report.content}
          {windowEnd && <> measured at {formatDateTime(windowEnd)}.</>}
        </span>
      </p>
      <dl className='grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-200 pt-3 text-sm dark:border-gray-700'>
        <div>
          <dt className='text-slate-500 dark:text-gray-400'>Network</dt>
          <dd className='font-medium'>{raw?.networkName || asn}</dd>
        </div>
        <div>
          <dt className='text-slate-500 dark:text-gray-400'>ASN</dt>
          <dd className='font-medium'>{asn}</dd>
        </div>
        <div>
          <dt className='text-slate-500 dark:text-gray-400'>Window start</dt>
          <dd className='font-medium'>
            {formatDateTime(raw?.windowStart || trigger?.windowStart, "Unknown")}
          </dd>
        </div>
        <div>
          <dt className='text-slate-500 dark:text-gray-400'>Window end</dt>
          <dd className='font-medium'>
            {formatDateTime(raw?.windowEnd || trigger?.windowEnd, "Unknown")}
          </dd>
        </div>
        <div>
          <dt className='text-slate-500 dark:text-gray-400'>Measurements</dt>
          <dd className='font-medium'>{trigger?.measurementCount ?? 0}</dd>
        </div>
      </dl>
      {raw?.domainMode === "selected" && (
        <div className='border-t border-slate-200 pt-3 text-sm dark:border-gray-700'>
          <p className='text-slate-500 dark:text-gray-400'>Domains with zero measurements at alert time</p>
          <p className='mt-1 break-words font-medium'>
            {zeroDomains.length > 0 ? zeroDomains.join(", ") : "None"}
          </p>
        </div>
      )}
    </div>
  );
};

export default OoniEvent;