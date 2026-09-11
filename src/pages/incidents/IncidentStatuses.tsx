import { Group } from "../../api/groups/types";
import { isNil } from "lodash";

interface IncidentStatusProps extends React.ComponentProps<"p"> {
  group: Group,
  className: string,
  // When true, render a neutral pill (no status color). Used by the incidents
  // table, where the colliding status colors weren't carrying specific meaning;
  // the list view keeps the colored badge (default).
  colorless?: boolean,
}

export function IncidentOverallStatus({
  group,
  className = "",
  colorless = false,
  ...props
}: IncidentStatusProps) {
  const {
    verification_status,
    confirmation_status,
    publication_status,
  } = group;

  // Derive the single overall-status label + its color, then render once so the
  // colorless variant only swaps the background.
  let label: string;
  let colorCSS: string;
  if (publication_status.includes("Shared with Networks")) {
    label = "Shared with Networks";
    colorCSS = "bg-lime-200 text-slate-600 dark:text-gray-600 dark:bg-lime-200 dark:saturate-[0.7]";
  } else if (publication_status.includes("Published")) {
    label = "Published";
    colorCSS = "bg-green-200 text-slate-600 dark:text-gray-600 dark:bg-green-200 dark:saturate-[0.7]";
  } else if (confirmation_status === true || confirmation_status === "true") {
    label = "Confirmed";
    colorCSS = "bg-green-200 text-slate-600 dark:text-gray-600 dark:bg-green-200 dark:saturate-[0.7]";
  } else if (confirmation_status === false || confirmation_status === "false") {
    label = "Unable to Confirm";
    colorCSS = "bg-red-200 text-slate-600 dark:text-gray-600 dark:bg-red-200 dark:saturate-[0.7]";
  } else if (verification_status === true || verification_status === "true") {
    label = "Confirming";
    colorCSS = "bg-amber-200 text-slate-600 dark:text-gray-600 dark:bg-amber-200 dark:saturate-[0.7]";
  } else if (verification_status === false || verification_status === "false") {
    label = "Unable to Verify";
    colorCSS = "bg-red-200 text-slate-600 dark:text-gray-600 dark:bg-red-200 dark:saturate-[0.7]";
  } else {
    label = "Verifying Measurement";
    colorCSS = "bg-amber-200 text-slate-600 dark:text-gray-600 dark:bg-amber-200 dark:saturate-[0.7]";
  }

  const neutralCSS = "bg-slate-100 dark:bg-gray-700";

  return (
    <p className={`${colorless ? neutralCSS : colorCSS} ${className}`} {...props}>
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
