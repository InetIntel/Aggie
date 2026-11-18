import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

import type { Group } from "../../api/groups/types";
import type { AsnInfo } from "../../api/asn/types";
import { resolveTimeZone } from "../../utils/dateFormat";
import { useFormatters } from "../../utils/useFormatters";
import TagsList from "../../components/Tags/TagsList";
import SocialMediaIcon from "../../components/SocialMediaPost/SocialMediaIcon";
import {
  coverageTier,
  dedupeLocations,
  formatDuration,
  formatHeadingDate,
  GeoScopeLookup,
  isOngoing,
  startTimeOf,
  TIER_STYLES,
  toTime,
} from "./timelineHelpers";

countries.registerLocale(enLocale);

// Aggie's confirmations are made by the Georgia Tech IODA team. Shown in the
// footer once an incident's confirmation_status is true.
const CONFIRMING_ORG = "Georgia Tech";

const SOURCE_LABELS: Record<string, string> = {
  ioda: "IODA",
  cloudflare: "Cloudflare",
  ooni: "OONI",
};

const sectionLabel =
  "text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-gray-400";

function StatusPill({ ongoing }: { ongoing: boolean }) {
  return ongoing ? (
    <span className='inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'>
      <span className='h-1.5 w-1.5 rounded-full bg-sky-600 dark:bg-sky-300' />
      Ongoing
    </span>
  ) : (
    <span className='inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-gray-700 dark:text-gray-300'>
      <FontAwesomeIcon icon={faCheck} size='xs' />
      Closed
    </span>
  );
}

function CoverageMeter({ label, value }: { label: string; value?: number | null }) {
  const tier = coverageTier(value);
  const style = TIER_STYLES[tier];
  const pct = typeof value === "number" ? Math.min(Math.max(value, 0), 1) * 100 : 0;
  return (
    <div className='flex-1 min-w-[12rem]'>
      <p className={sectionLabel}>{label}</p>
      <div className='mt-1 flex items-baseline gap-3'>
        <span className='text-2xl font-medium text-slate-800 dark:text-gray-100'>
          {typeof value === "number" ? `${pct.toFixed(1)}%` : "N/A"}
        </span>
        {style.label && <span className={`text-xs ${style.text}`}>{style.label}</span>}
      </div>
      <div className='mt-2 h-1 w-full rounded-full bg-slate-200 dark:bg-gray-700'>
        <div className={`h-1 rounded-full ${style.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const asName = (info: AsnInfo | undefined) => {
  if (!info?.name) return null;
  const country = info.country ? countries.getName(info.country.toUpperCase(), "en") : undefined;
  return country ? `${info.name} - ${country}` : info.name;
};

interface IProps {
  group: Group;
  getAsnInfo: (asn: string) => AsnInfo | undefined;
  geo: GeoScopeLookup;
}

const TimelineCard = ({ group, getAsnInfo, geo }: IProps) => {
  const { prefs, formatDateTime, formatTimeZone } = useFormatters();
  const ongoing = isOngoing(group);
  const start = toTime(group.incidentStartedAt);
  const end = toTime(group.incidentEndedAt);
  const durationMs = start !== null ? (end ?? Date.now()) - start : null;
  const asns = group.impactedAsns ?? [];
  // One row per ASN (repeats dropped), paired with its organization.
  const asnRows = Array.from(new Set(asns.map((a) => a.toLowerCase()))).map((a) => ({
    asn: a,
    organization: asName(getAsnInfo(a)),
  }));
  const locations = dedupeLocations(group, geo);
  const description = group.publicDescription || group.notes;
  const confirmed =
    group.confirmation_status === true || group.confirmation_status === "true";

  return (
    <article className='overflow-hidden rounded-md border border-slate-200 bg-white shadow-md dark:border-slate-600 dark:bg-gray-800'>
      <div className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <p className='text-lg font-semibold uppercase tracking-wide text-[#2B7A8F] dark:text-sky-300'>
            {formatHeadingDate(startTimeOf(group), resolveTimeZone(prefs))}
          </p>
          <StatusPill ongoing={ongoing} />
        </div>
        <Link
          to={`/incidents/${group._id}`}
          className='mt-1 block font-semibold text-slate-900 hover:underline dark:text-gray-100'
        >
          {group.title}
        </Link>
        {group.smtcTags.length > 0 && (
          <div className='mt-2 flex flex-wrap gap-1 text-xs'>
            <TagsList values={group.smtcTags} />
          </div>
        )}
        <dl className='mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700 dark:text-gray-300'>
          <div className='flex items-baseline gap-1.5'>
            <dt className='text-[10px] uppercase tracking-wider text-slate-400'>Start</dt>
            <dd>
              {formatDateTime(group.incidentStartedAt, "Unknown")}{" "}
              <span className='text-slate-400'>{formatTimeZone(group.incidentStartedAt)}</span>
            </dd>
          </div>
          <div className='flex items-baseline gap-1.5'>
            <dt className='text-[10px] uppercase tracking-wider text-slate-400'>End</dt>
            <dd>
              {formatDateTime(group.incidentEndedAt, ongoing ? "Ongoing" : "Unknown")}{" "}
              <span className='text-slate-400'>{formatTimeZone(group.incidentEndedAt)}</span>
            </dd>
          </div>
          {durationMs !== null && (
            <div className='flex items-baseline gap-1.5'>
              <dt className='text-[10px] uppercase tracking-wider text-slate-400'>Duration</dt>
              <dd>
                {formatDuration(durationMs)}
                {end === null && ongoing ? " so far" : ""}
              </dd>
            </div>
          )}
        </dl>
        {locations.length > 0 && (
          <div className='mt-2 flex flex-wrap gap-1'>
            {locations.map((l) => (
              <span
                key={l}
                className='rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-gray-700 dark:text-gray-300'
              >
                {l}
              </span>
            ))}
          </div>
        )}
        {description && (
          <p className='mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-gray-300'>
            {description}
          </p>
        )}
      </div>

      <div className='flex flex-wrap gap-6 border-t border-slate-200 p-4 dark:border-slate-600'>
        <CoverageMeter
          label='Direct population coverage'
          value={group.directPopulationCoverageScore}
        />
        <CoverageMeter
          label='Indirect population coverage'
          value={group.indirectPopulationCoverageScore}
        />
      </div>

      {asnRows.length > 0 && (
        <div className='border-t border-slate-200 p-4 dark:border-slate-600'>
          <table className='w-full text-left text-xs'>
            <thead>
              <tr>
                <th className={`${sectionLabel} w-28 pb-1 pr-4 font-semibold`}>ASN</th>
                <th className={`${sectionLabel} pb-1 font-semibold`}>Organization</th>
              </tr>
            </thead>
            <tbody>
              {asnRows.map(({ asn, organization }) => (
                <tr key={asn} className='border-t border-slate-100 dark:border-slate-700'>
                  <td className='py-1 pr-4 align-top'>
                    <span className='inline-block rounded border border-yellow-400 bg-yellow-100 px-1.5 py-0.5 text-slate-800 dark:bg-yellow-900/40 dark:text-yellow-100'>
                      {asn.toUpperCase()}
                    </span>
                  </td>
                  <td className='py-1 align-middle text-slate-700 dark:text-gray-200'>
                    {organization ?? <span className='italic text-slate-400'>Unknown</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(group.reportSources?.length || confirmed) && (
        <footer className='flex flex-wrap items-center gap-x-6 gap-y-1 bg-slate-100 px-4 py-2 text-xs text-slate-600 dark:bg-gray-700 dark:text-gray-300'>
          {!!group.reportSources?.length && (
            <span className='flex items-center gap-2'>
              Source
              {group.reportSources.map((s) => (
                <span key={s} className='inline-flex items-center gap-1 font-semibold'>
                  <SocialMediaIcon mediaKey={s} />
                  {SOURCE_LABELS[s] ?? s}
                </span>
              ))}
            </span>
          )}
          {confirmed && (
            <span>
              Confirmed by <span className='font-semibold'>{CONFIRMING_ORG}</span>
            </span>
          )}
        </footer>
      )}
    </article>
  );
};

export default TimelineCard;
