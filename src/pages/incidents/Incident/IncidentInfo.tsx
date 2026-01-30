import { useState } from "react";
import {
  faCompass,
  faFileLines,
} from "@fortawesome/free-regular-svg-icons";
import {
  faArrowRight,
  faMinusCircle,
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


interface IProps {
  group?: Group;
  isLoading: boolean;
  onEdit: () => void;
}
const IncidentInfo = ({ group, isLoading, onEdit }: IProps) => {
  const [isStatusClicked, setIsStatusClicked] = useState(false);
  const [isStatusHovered, setIsStatusHovered] = useState(false);

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

  
  function formatIsoTime (iso : string | Date) {
    if (!iso) return "Unknown Date";
    const date = (iso instanceof Date) ? iso : new Date(iso);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  const renderImpactedAsns = () => {
    if (!group || !impactedAsns.length) {
      return (
        <p className="italic text-slate-600 dark:text-gray-400">
          No ASN Set
        </p>
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
      <div className="flex flex-wrap gap-2">
        {impactedAsns.map((asn) => {
          const info = asnMap?.[asn];
          const labelNumber = info?.number ?? asn.replace(/^as/i, "");
          const labelName = info?.name?.trim();
          const country = info?.country?.toUpperCase();

          const labelParts = [
            `AS${labelNumber}`,
            labelName || undefined,
            country ? `(${country})` : undefined,
          ].filter(Boolean);

          return (
            <span
              key={asn}
              className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-300 bg-white text-sm text-slate-800 dark:bg-gray-800 dark:border-slate-600 dark:text-gray-200"
            >
              {labelParts.join(" — ")}
            </span>
          );
        })}
      </div>
    );
  };

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
              {formatIsoTime(group?.incidentStartedAt)} {<FontAwesomeIcon icon={faArrowRight} size="sm" />} {formatIsoTime(group?.incidentEndedAt)}
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

      <div className="flex gap-2 items-start pt-2">
        <span className="whitespace-nowrap">Impacted ASNs:</span>
        <PlaceholderDiv
          loading={isLoading}
          className="flex flex-wrap gap-x-2 gap-y-1 items-center "
        >
          {renderImpactedAsns()}
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
