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
      <p className={`bg-teal-300 ${className}`} {...props}>
        Shared with Networks
      </p>
    );
  } else if (publication_status.includes("Published")) {
    return (
      <p className={`bg-emerald-300 ${className}`} {...props}>
        Published
      </p>
    );
  }

  switch (confirmation_status) {
    case true:
    case "true":
      return (
        <p className={`bg-green-300 ${className}`} {...props}>
          Confirmed
        </p>
      );
    case false:
    case "false":
      return (
        <p className={`bg-orange-300 ${className}`} {...props}>
          Unable to Confirm
        </p>
      );
    default:
  }

  switch (verification_status) {
    case true:
    case "true":
      return (
        <p className={`bg-yellow-300 ${className}`} {...props}>
          Confirming
        </p>
      );
    case false:
    case "false":
      return (
        <p className={`bg-red-300 ${className}`} {...props}>
          Unable to Verify
        </p>
      );
    default:
  }

  return (
    <p className={`bg-amber-300 ${className}`} {...props}>
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
    ? <span className={`bg-amber-300 ${className}`} {...props}>Verifying</span>
    : verification_status === "true" || verification_status === true
      ? <span className={`bg-lime-300 ${className}`} {...props}>Verified</span>
      : verification_status === "false" || verification_status === false
        ? <span className={`bg-red-300 ${className}`} {...props}>Unable to Verify</span>
        : null
  );
  const confirmed = (
    confirmation_status === "maybe" || isNil(confirmation_status)
    ? <span className={`bg-yellow-300 ${className}`} {...props}>Confirming</span>
    : confirmation_status === "true" || confirmation_status === true
      ? <span className={`bg-green-300 ${className}`} {...props}>Confirmed</span>
      : confirmation_status === "false" || confirmation_status === false
        ? <span className={`bg-orange-300 ${className}`} {...props}>Unable to Confirm</span>
        : null
  );
  const published = (
    publication_status.includes("Published")
    ? <span className={`bg-emerald-300 ${className}`} {...props}>Published</span>
    : <span className={`bg-fuchsia-300 ${className}`} {...props}>Not Published</span>
  );
  const shared = (
    publication_status.includes("Shared with Networks")
    && <span className={`bg-teal-300 ${className}`} {...props}>Shared with Networks</span>
  );
  return (<div className='flex gap-2'>
    {verified}{confirmed}{published}{shared}
  </div>);
}
