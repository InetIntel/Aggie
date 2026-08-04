import { Report } from "../../api/reports/types";

interface IProps {
  report: Report;
}

interface Trigger {
  type: "zero_measurements" | "measurement_decline";
  measurementDay?: string;
  measurementCount?: number;
  recentStart?: string;
  recentEnd?: string;
  recentCounts?: number[];
  recentAverage?: number;
  baselineStart?: string;
  baselineEnd?: string;
  baselineNonZeroDays?: number;
  baselineAverage?: number;
  declineFraction?: number;
}

interface EvidenceMeasurement {
  input: string;
  measurementStartTime: string;
  measurementUid: string;
  measurementUrl: string;
  blockingType?: string;
  verificationStatus?: string;
}

const formatNumber = (value?: number) =>
  value == null ? "-" : value.toLocaleString(undefined, { maximumFractionDigits: 1 });

const EvidenceList = ({
  title,
  measurements,
  statusClass,
}: {
  title: string;
  measurements: EvidenceMeasurement[];
  statusClass: string;
}) => (
  <section className='border-t border-slate-200 pt-3 mt-3'>
    <h3 className='font-medium mb-2'>{title} ({measurements.length})</h3>
    {measurements.length === 0 ? (
      <p className='text-sm text-slate-600'>No measurements selected.</p>
    ) : (
      <div className='divide-y divide-slate-200'>
        {measurements.map((measurement) => (
          <a
            key={measurement.measurementUid}
            href={measurement.measurementUrl}
            target='_blank'
            rel='noreferrer'
            className='block py-2 hover:bg-slate-50'
          >
            <div className='flex flex-wrap items-center gap-2'>
              <span className={`text-xs font-medium px-2 py-0.5 ${statusClass}`}>
                {measurement.blockingType || "unknown interference"}
              </span>
              <span className='font-medium break-all'>{measurement.input}</span>
            </div>
            <p className='text-xs text-slate-600 mt-1'>
              {measurement.measurementStartTime} | {measurement.verificationStatus || "unverified"}
            </p>
          </a>
        ))}
      </div>
    )}
  </section>
);

const OONIPost = ({ report }: IProps) => {
  const raw = report.metadata.rawAPIResponse as any;
  const triggers: Trigger[] = raw.triggers || [];
  const evidence = raw.evidence || { confirmed: [], anomalous: [] };

  return (
    <div className='space-y-3'>
      <div>
        <h2 className='font-medium'>OONI volume alert</h2>
        <p className='text-sm text-slate-600'>
          {raw.networkName || `AS${raw.probeASN}`} | AS{raw.probeASN} | {raw.alertDate}
        </p>
      </div>

      {triggers.map((trigger) => (
        <section key={trigger.type} className='border-t border-slate-200 pt-3'>
          {trigger.type === "zero_measurements" ? (
            <>
              <h3 className='font-medium'>No measurements recorded</h3>
              <p className='text-sm mt-1'>
                OONI returned {trigger.measurementCount} measurements for {trigger.measurementDay}.
              </p>
            </>
          ) : (
            <>
              <h3 className='font-medium'>Measurement volume declined</h3>
              <dl className='grid grid-cols-2 gap-x-4 gap-y-2 text-sm mt-2'>
                <div>
                  <dt className='text-slate-600'>Decline</dt>
                  <dd className='font-medium'>{((trigger.declineFraction || 0) * 100).toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className='text-slate-600'>Recent counts</dt>
                  <dd className='font-medium'>{trigger.recentCounts?.join(", ")}</dd>
                </div>
                <div>
                  <dt className='text-slate-600'>2-day average</dt>
                  <dd className='font-medium'>{formatNumber(trigger.recentAverage)}</dd>
                </div>
                <div>
                  <dt className='text-slate-600'>14-day baseline</dt>
                  <dd className='font-medium'>{formatNumber(trigger.baselineAverage)}</dd>
                </div>
                <div className='col-span-2'>
                  <dt className='text-slate-600'>Baseline period</dt>
                  <dd>{trigger.baselineStart} to {trigger.baselineEnd} ({trigger.baselineNonZeroDays} non-zero days)</dd>
                </div>
              </dl>
            </>
          )}
        </section>
      ))}

      {evidence.available ? (
        <>
          <p className='text-sm text-slate-600 border-t border-slate-200 pt-3'>
            Related measurements from {evidence.windowStart} to {evidence.windowEnd} provide context and do not establish the cause of the volume decline.
          </p>
          <EvidenceList
            title='Confirmed measurements'
            measurements={evidence.confirmed || []}
            statusClass='bg-red-100 text-red-800'
          />
          <EvidenceList
            title='Anomalous measurements'
            measurements={evidence.anomalous || []}
            statusClass='bg-amber-100 text-amber-900'
          />
        </>
      ) : (
        <p className='text-sm text-slate-600 border-t border-slate-200 pt-3'>
          {evidence.reason || "No related measurement evidence is available."}
        </p>
      )}
    </div>
  );
};

export default OONIPost;