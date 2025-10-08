import { Group } from "../../api/groups/types";
import { isNil } from "lodash";

interface IncidentStatusProps extends React.ComponentProps<"p"> {
  group: Group,
  className: string,
}

export function IncidentOverallStatus({
  group,
  className = "",
  ...props
}: IncidentStatusProps) {
  const {
    verification_status,
    confirmation_status,
    publication_status,
  } = group;
  if (publication_status.includes("Shared with Networks")) {
    return (
      <p className={`bg-lime-200 text-slate-600 dark:text-gray-600 dark:bg-lime-200 dark:saturate-[0.7] ${className}`} {...props}>
        Shared with Networks
      </p>
    );
  } else if (publication_status.includes("Published")) {
    return (
      <p className={`bg-green-200 text-slate-600 dark:text-gray-600 dark:bg-green-200 dark:saturate-[0.7] ${className}`} {...props}>
        Published
      </p>
    );
  }

  switch (confirmation_status) {
    case true:
    case "true":
      return (
        <p className={`bg-green-200 text-slate-600 dark:text-gray-600 dark:bg-green-200 dark:saturate-[0.7] ${className}`} {...props}>
          Confirmed
        </p>
      );
    case false:
    case "false":
      return (
        <p className={`bg-red-200 text-slate-600 dark:text-gray-600 dark:bg-red-200 dark:saturate-[0.7] ${className}`} {...props}>
          Unable to Confirm
        </p>
      );
    default:
  }

  switch (verification_status) {
    case true:
    case "true":
      return (
        <p className={`bg-amber-200 text-slate-600 dark:text-gray-600 dark:bg-amber-200 dark:saturate-[0.7] ${className}`} {...props}>
          Confirming
        </p>
      );
    case false:
    case "false":
      return (
        <p className={`bg-red-200 text-slate-600 dark:text-gray-600 dark:bg-red-200 dark:saturate-[0.7] ${className}`} {...props}>
          Unable to Verify
        </p>
      );
    default:
  }

  return (
    <p className={`bg-amber-200 text-slate-600 dark:text-gray-600 dark:bg-amber-200 dark:saturate-[0.7] ${className}`} {...props}>
      Verifying Measurement
    </p>
  );
}

export function IncidentStatuses({
  group,
  className = "",
  ...props
}: IncidentStatusProps) {
  const {
    verification_status,
    confirmation_status,
    publication_status,
  } = group;
  const verified = (
    verification_status === "maybe" || isNil(verification_status)
    ? <span className={`bg-amber-200 dark:bg-amber-200 dark:saturate-[0.7] ${className}`} {...props}>Verifying</span>
    : verification_status === "true" || verification_status === true
      ? <span className={`bg-green-200 dark:bg-green-200 dark:saturate-[0.7] ${className}`} {...props}>Verified</span>
      : verification_status === "false" || verification_status === false
        ? <span className={`bg-red-200 dark:bg-red-200 dark:saturate-[0.7] ${className}`} {...props}>Unable to Verify</span>
        : null
  );
  const confirmed = (
    confirmation_status === "maybe" || isNil(confirmation_status)
    ? <span className={`bg-amber-200 dark:bg-amber-200 dark:saturate-[0.7] ${className}`} {...props}>Confirming</span>
    : confirmation_status === "true" || confirmation_status === true
      ? <span className={`bg-green-200 dark:bg-green-200 dark:saturate-[0.7] ${className}`} {...props}>Confirmed</span>
      : confirmation_status === "false" || confirmation_status === false
        ? <span className={`bg-red-200 dark:bg-red-200 dark:saturate-[0.7] ${className}`} {...props}>Unable to Confirm</span>
        : null
  );
  const published = (
    publication_status.includes("Published")
    ? <span className={`bg-green-200 dark:bg-green-200 dark:saturate-[0.7] ${className}`} {...props}>Published</span>
    : <span className={`bg-red-200 dark:bg-red-200 dark:saturate-[0.7] ${className}`} {...props}>Not Published</span>
  );
  const shared = (
    publication_status.includes("Shared with Networks")
    && <span className={`bg-lime-200 ${className}`} {...props}>Shared with Networks</span>
  );
  return (<div className='flex gap-2'>
    {verified}{confirmed}{published}{shared}
  </div>);
}
