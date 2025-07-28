import { Group } from "../../api/groups/types";
import { isNil } from "lodash";

export default function incidentOverallStatus({
  verification_status,
  confirmation_status,
  publication_status,
}: Group) {
  if (publication_status.includes("Shared with Networks")) {
    return "Shared with Networks";
  } else if (publication_status.includes("Published")) {
    return "Published";
  }

  if (!isNil(confirmation_status)) {
    if (confirmation_status) {
      return "Confirmed";
    } else {
      return "Unable to Confirm";
    }
  }

  if (!isNil(verification_status)) {
    if (verification_status) {
      return "Confirming";
    } else {
      return "Unable to Verify";
    }
  }

  return "Verifying Measurement";
}
