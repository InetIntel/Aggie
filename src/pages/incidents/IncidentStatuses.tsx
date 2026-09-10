import { Group } from "../../api/groups/types";
import { isNil } from "lodash";

interface IncidentStatusProps extends React.ComponentProps<"p"> {
  group: Group,
  className: string,
}

const CHIP_COLORS = {
  amber: "bg-amber-200 dark:bg-amber-200",
  green: "bg-green-200 dark:bg-green-200",
  red: "bg-red-200 dark:bg-red-200",
  lime: "bg-lime-200 dark:bg-lime-200",
} as const;
type ChipColor = keyof typeof CHIP_COLORS;

function chipClass(color: ChipColor, className: string) {
  return `${CHIP_COLORS[color]} text-slate-600 dark:text-gray-600 dark:saturate-[0.7] ${className}`;
}

type TernaryStatus = Group["verification_status"];
const isTrue = (status: TernaryStatus) => status === true || status === "true";
const isFalse = (status: TernaryStatus) => status === false || status === "false";
const isPending = (status: TernaryStatus) => status === "maybe" || isNil(status);

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

  // First match wins: the pill names the furthest stage the incident reached.
  let color: ChipColor = "amber";
  let label = "Verifying Measurement";
  if (publication_status.includes("Shared with Networks")) {
    color = "lime";
    label = "Shared with Networks";
  } else if (publication_status.includes("Published")) {
    color = "green";
    label = "Published";
  } else if (isTrue(confirmation_status)) {
    color = "green";
    label = "Confirmed";
  } else if (isFalse(confirmation_status)) {
    color = "red";
    label = "Unable to Confirm";
  } else if (isTrue(verification_status)) {
    color = "amber";
    label = "Confirming";
  } else if (isFalse(verification_status)) {
    color = "red";
    label = "Unable to Verify";
  }

  return (
    <p className={chipClass(color, className)} {...props}>
      {label}
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
    isPending(verification_status)
    ? <span className={chipClass("amber", className)} {...props}>Verifying</span>
    : isTrue(verification_status)
      ? <span className={chipClass("green", className)} {...props}>Verified</span>
      : isFalse(verification_status)
        ? <span className={chipClass("red", className)} {...props}>Unable to Verify</span>
        : null
  );
  const confirmed = (
    isPending(confirmation_status)
    ? <span className={chipClass("amber", className)} {...props}>Confirming</span>
    : isTrue(confirmation_status)
      ? <span className={chipClass("green", className)} {...props}>Confirmed</span>
      : isFalse(confirmation_status)
        ? <span className={chipClass("red", className)} {...props}>Unable to Confirm</span>
        : null
  );
  const published = (
    publication_status.includes("Published")
    ? <span className={chipClass("green", className)} {...props}>Published</span>
    : <span className={chipClass("red", className)} {...props}>Not Published</span>
  );
  const shared = (
    publication_status.includes("Shared with Networks")
    && <span className={chipClass("lime", className)} {...props}>Shared with Networks</span>
  );
  return (<div className='flex flex-wrap gap-2'>
    {verified}{confirmed}{published}{shared}
  </div>);
}
