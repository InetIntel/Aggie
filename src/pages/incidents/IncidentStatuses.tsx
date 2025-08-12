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

  if (!isNil(confirmation_status)) {
    if (confirmation_status) {
      return (
        <p className={`bg-green-300 ${className}`} {...props}>
          Confirmed
        </p>
      );
    } else {
      return (
        <p className={`bg-orange-300 ${className}`} {...props}>
          Unable to Confirm
        </p>
      );
    }
  }

  if (!isNil(verification_status)) {
    if (verification_status) {
      return (
        <p className={`bg-yellow-300 ${className}`} {...props}>
          Confirming
        </p>
      );
    } else {
      return (
        <p className={`bg-red-300 ${className}`} {...props}>
          Unable to Verify
        </p>
      );
    }
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
      isNil(verification_status)
      ? <span className={`bg-amber-300 ${className}`} {...props}>Verifying</span>
      : verification_status
        ? <span className={`bg-lime-300 ${className}`} {...props}>Verified</span>
        : <span className={`bg-red-300 ${className}`} {...props}>Unable to Verify</span>
    );
    const confirmed = (
      isNil(confirmation_status)
      ? <span className={`bg-yellow-300 ${className}`} {...props}>Confirming</span>
      : confirmation_status
        ? <span className={`bg-green-300 ${className}`} {...props}>Confirmed</span>
        : <span className={`bg-orange-300 ${className}`} {...props}>Unable to Confirm</span>
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
