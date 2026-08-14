import type { Report } from "../../api/reports/types";

const OoniEvent = ({ report }: { report: Report }) => {
  const raw = report.metadata?.rawAPIResponse;
  const trigger = raw?.triggers?.[0];
  const asn = raw?.probeASN ? `AS${raw.probeASN}` : report.author;
  const zeroDomains: string[] = raw?.zeroDomains || [];

  return (
    <div className='space-y-3'>
      <p className='whitespace-pre-wrap break-words'>{report.content}</p>
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
          <dt className='text-slate-500 dark:text-gray-400'>Measurement day</dt>
          <dd className='font-medium'>{trigger?.measurementDay || "Unknown"}</dd>
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