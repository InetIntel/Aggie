import { useState } from "react";
import {
  faCompass,
  faFileLines,
} from "@fortawesome/free-regular-svg-icons";
import {
  faArrowRight,
  faMinusCircle,
  faSort,
  faSortDown,
  faSortUp,
  faTrash,
  faUserEdit,
  faWarning,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Group } from "../../../api/groups/types";
import AggieButton from "../../../components/AggieButton";
import PlaceholderDiv from "../../../components/PlaceholderDiv";
import TagsList from "../../../components/Tags/TagsList";
import UserToken from "../../../components/UserToken";
//import VeracityToken from "../../../components/VeracityToken";
import { IncidentOverallStatus, IncidentStatuses } from "../IncidentStatuses";
import { getAsnsByIds } from "../../../api/asn";
import type { AsnInfoMap } from "../../../api/asn/types";
import { formatDurationFromSeconds } from "../../../utils/format";
import { useFormatters } from "../../../utils/useFormatters";
import ImpactedAsnTable from "./ImpactedAsnTable";


interface IProps {
  group?: Group;
  isLoading: boolean;
  onEdit: () => void;
}
const IncidentInfo = ({ group, isLoading, onEdit }: IProps) => {
  const { formatDateTime } = useFormatters();
  const [isStatusClicked, setIsStatusClicked] = useState(false);
  const [isStatusHovered, setIsStatusHovered] = useState(false);
  const [asnSort, setAsnSort] = useState<{
    key: "asn" | "direct" | "indirect";
    direction: "asc" | "desc";
  }>({
    key: "direct",
    direction: "desc",
  });

  const impactedAsns = group?.impactedAsns ?? [];
  const impactedGeoScopes = group?.impactedGeoScopes ?? [];

  const {
    data: asnMap,
    isLoading: isAsnLoading,
  } = useQuery<AsnInfoMap>({
    queryKey: ["asn-bulk", impactedAsns],
    queryFn: () => getAsnsByIds(impactedAsns),
    enabled: impactedAsns.length > 0,
  });

  const asnMapByLower = Object.fromEntries(
    Object.entries(asnMap ?? {}).map(([asn, info]) => [asn.toLowerCase(), info])
  );

  const getAsnInfo = (asn: string) => asnMapByLower[asn.toLowerCase()];

  const formatCoveragePercent = (value?: number | null) =>
    typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "0.00%";

  const clampCoverageTotal = (value: number) => Math.min(value, 1);

  const getCoverageBorderClass = (value?: number | null) => {
    if (typeof value !== "number" ) {
      return "border-black dark:border-gray-200";
    }
    if (value < 0.1) {
      return "border-yellow-400 dark:border-yellow-300";
    }
    if (value <= 0.25) {
      return "border-orange-400 dark:border-orange-300";
    }
    return "border-red-500 dark:border-red-400";
  };

  const directPopulationCoverageSum = impactedAsns.reduce((sum, asn) => {
    const direct = getAsnInfo(asn)?.populationCoverageDirect;
    return typeof direct === "number" ? sum + direct : sum;
  }, 0);

  const hasDirectPopulationCoverage = impactedAsns.some(
    (asn) => typeof getAsnInfo(asn)?.populationCoverageDirect === "number"
  );
  const directPopulationCoverageBorderClass = getCoverageBorderClass(
    hasDirectPopulationCoverage ? directPopulationCoverageSum : null
  );

  const indirectPopulationCoverageMax = clampCoverageTotal(
    impactedAsns.reduce((max, asn) => {
      const indirect = getAsnInfo(asn)?.populationCoverageIndirect;
      return typeof indirect === "number" ? Math.max(max, indirect) : max;
    }, 0)
  );

  const hasIndirectPopulationCoverage = impactedAsns.some(
    (asn) => typeof getAsnInfo(asn)?.populationCoverageIndirect === "number"
  );
  const indirectPopulationCoverageBorderClass = getCoverageBorderClass(
    hasIndirectPopulationCoverage ? indirectPopulationCoverageMax : null
  );

  const sortedImpactedAsns = [...impactedAsns].sort((a, b) => {
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
      const sortByNumber = Number.isFinite(aNum) && Number.isFinite(bNum)
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

  const updateAsnSort = (key: "asn" | "direct" | "indirect") => {
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

  const getAsnSortIcon = (key: "asn" | "direct" | "indirect") => {
    if (asnSort.key !== key) return faSort;
    return asnSort.direction === "asc" ? faSortUp : faSortDown;
  };

  // The impacted-ASN table now lives in a shared component (reused by the
  // incidents table expanded row). The sort state/helpers above are kept for
  // potential future use even though this render no longer references them.
  const renderImpactedAsns = () => <ImpactedAsnTable asns={impactedAsns} />;

  const renderImpactedGeoScopes = () => {
    if (!group || !impactedGeoScopes.length) {
      return (
        <p className="italic text-slate-600 dark:text-gray-400">
          No Geographic Scope Set
        </p>
      );
    }
  
    return (
      <div className="flex flex-wrap gap-2">
        {impactedGeoScopes.map((scope) => (
          <span
            key={scope}
            className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-300 bg-white text-sm text-slate-800 dark:bg-gray-800 dark:border-slate-600 dark:text-gray-200"
          >
            {scope}
          </span>
        ))}
      </div>
    );
  };

  return (
    <header className='text-slate-600 dark:text-gray-400 border-b border-slate-300 py-2 dark:text-gray-300'>
      <div className='flex justify-between'>
        <div>
          <div className='flex gap-2 flex-wrap'>
            <PlaceholderDiv
              as='p'
              width='5em'
              loading={isLoading}
              className='font-medium'
            >
              Incident #{group?.idnum}
            </PlaceholderDiv>
            { /*<VeracityToken value={group?.veracity} />*/ }
            {group?.closed && (
              <span className='px-1 bg-purple-200 text-purple-700 font-medium inline-flex gap-1 items-center dark:bg-purple-200 dark:saturate-[0.7]'>
                <FontAwesomeIcon icon={faMinusCircle} />
                Closed
              </span>
            )}
            {group && !group?.public && (
              <span className='px-1 bg-red-200 text-red-800 font-medium inline-flex gap-1 items-center dark:bg-red-200 dark:saturate-[0.7]'>
                <FontAwesomeIcon icon={faTrash} />
                Deleted
              </span>
            )}
            <TagsList values={group?.smtcTags} />
          </div>
          <PlaceholderDiv
            loading={isLoading}
            className='text-black text-3xl font-medium my-2 dark:text-gray-300'
            loadingClass='mt-1 bg-slate-200 dark:bg-gray-600 rounded-lg'
            width='12em'
          >
            <h1 className='max-w-prose'>
              {group?.title}{" "}
            </h1>
          </PlaceholderDiv>
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
        {
          group && (
            <IncidentOverallStatus
              group={group}
              className='px-2 py-1 rounded-full hover:cursor-pointer'
              onClick={() => setIsStatusClicked(!isStatusClicked)}
              onMouseEnter={() => setIsStatusHovered(true)}
              onMouseLeave={() => setIsStatusHovered(false || isStatusClicked)}
            />
          )
        }
        {
          (isStatusHovered && group)
          && <IncidentStatuses group={group} className='px-2 py-1 rounded-full'/>
        }
      </div>
      <div className='flex gap-12 my-2'>
        <PlaceholderDiv as='p' width='7em' loading={isLoading}>
          <FontAwesomeIcon icon={faFileLines} size='sm' />{" "}
          {group?._reports?.length}{" "}
          {group?._reports?.length === 1 ? "report" : "reports"}
        </PlaceholderDiv>

        {/* <PlaceholderDiv as='p' width='7em' loading={isLoading}>
          {!!group?.locationName && (
            <>
              <FontAwesomeIcon icon={faCompass} size='xs' />{" "}
              {group.locationName}
            </>
          )}
        </PlaceholderDiv> */}
        <PlaceholderDiv as='p' width='7em' loading={isLoading}>
          {group?.creator && (
            <>
              <FontAwesomeIcon icon={faUserEdit} size='sm' />{" "}
              <UserToken id={group?.creator?._id} />
            </>
          )}
        </PlaceholderDiv>
      </div>
      <div className='border-t border-slate-300 flex gap-2 items-center pt-2'>
        <span className='whitespace-nowrap'>Assigned To:</span>
        <PlaceholderDiv
          loading={isLoading}
          className='flex flex-wrap gap-x-2 gap-y-1 items-center '
        >
          {group?.assignedTo?.length
            ? group.assignedTo.map((user) => (
                <UserToken
                  id={user._id}
                  className='bg-white dark:bg-gray-800 border border-slate-300 rounded-full px-2 text-sm font-medium dark:border-slate-600'
                />
              ))
            : (<p className='italic text-slate-600 dark:text-gray-400'>No User Assigned</p>)
          }
        </PlaceholderDiv>
      </div>
      <div className='flex gap-2 items-center pt-2'>
        <span className='whitespace-nowrap'>Incident Time (UTC):</span>
        <PlaceholderDiv
          loading={isLoading}
          className='flex flex-wrap gap-x-2 gap-y-1 items-center '
        >
          {(group?.incidentStartedAt || group?.incidentEndedAt) ? (
            <p className='whitespace-pre-line max-w-prose text-black dark:text-gray-300'>
              {formatDateTime(group?.incidentStartedAt, "Unknown Date")} {<FontAwesomeIcon icon={faArrowRight} size="sm" />} {group?.incidentEndedAt ? formatDateTime(group?.incidentEndedAt, "Unknown Date") : "Present"}
            </p>
          ) : (
            <p className='italic text-slate-600 dark:text-gray-400'>No Date Set</p>
          )}
        </PlaceholderDiv>
      </div>

      <div className='flex gap-2 items-center pt-2'>
        <span className='whitespace-nowrap'>Incident Duration:</span>
        <PlaceholderDiv
          loading={isLoading}
          className='flex flex-wrap gap-x-2 gap-y-1 items-center '
        >
          {typeof group?.incidentDurationSeconds === "number" && group.incidentDurationSeconds >= 0 ? (
            <p className='whitespace-pre-line max-w-prose text-black dark:text-gray-300'>
              {formatDurationFromSeconds(group.incidentDurationSeconds)}
            </p>
          ) : (
            <p className='italic text-slate-600 dark:text-gray-400'>Ongoing</p>
          )}
        </PlaceholderDiv>
      </div>

      <div className="flex flex-col gap-2 pt-2">
        <span className="whitespace-nowrap">Impacted ASNs:</span>
        <PlaceholderDiv
          loading={isLoading}
          className="flex flex-wrap gap-x-2 gap-y-1 items-center "
        >
          {renderImpactedAsns()}
        </PlaceholderDiv>
      </div>

      <div className="flex gap-2 items-start pt-2">
        <span className="whitespace-nowrap">Direct Population Coverage:</span>
        <PlaceholderDiv
          loading={isLoading}
          className="flex flex-wrap gap-x-2 gap-y-1 items-center "
        >
          <span
            className={`inline-flex items-center px-2 py-0.5 border rounded text-black text-sm font-medium dark:text-gray-300 ${directPopulationCoverageBorderClass}`}
          >
            {hasDirectPopulationCoverage
              ? `${(directPopulationCoverageSum * 100).toFixed(2)}%`
              : "0.00%"}
          </span>
        </PlaceholderDiv>
      </div>

      <div className="flex gap-2 items-start pt-2">
        <span className="whitespace-nowrap">Indirect Population Coverage:</span>
        <PlaceholderDiv
          loading={isLoading}
          className="flex flex-wrap gap-x-2 gap-y-1 items-center "
        >
          <span
            className={`inline-flex items-center px-2 py-0.5 border rounded text-black text-sm font-medium dark:text-gray-300 ${indirectPopulationCoverageBorderClass}`}
          >
            {hasIndirectPopulationCoverage
              ? `${(indirectPopulationCoverageMax * 100).toFixed(2)}%`
              : "0.00%"}
          </span>
        </PlaceholderDiv>
      </div>

      <div className="flex gap-2 items-start pt-2">
        <span className="whitespace-nowrap">Impacted Areas:</span>
        <PlaceholderDiv
          loading={isLoading}
          className="flex flex-wrap gap-x-2 gap-y-1 items-center "
        >
          {renderImpactedGeoScopes()}
        </PlaceholderDiv>
      </div>

      <div className='flex gap-2 pt-2'>
        <p>Description:</p>

        {group?.notes ? (
          <div className='px-2 py-1 border border-slate-200 rounded w-full bg-white dark:bg-gray-800 overflow-y-auto max-h-40 dark:bg-gray-700 dark:border-slate-600'>
            <p className='whitespace-pre-line max-w-prose text-black dark:text-gray-300'>
              {group?.notes}
            </p>
          </div>
        ) : (
          <p className='italic text-slate-600 dark:text-gray-400'>No Description Set</p>
        )}
      </div>
    </header>
  );
};

export default IncidentInfo;
