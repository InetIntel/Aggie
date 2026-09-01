import { useQuery } from "@tanstack/react-query";
import {
  faCircleMinus,
  faUsers,
  faMagnifyingGlassChart,
  faCommentNodes,
  faBullhorn,
  faBackwardStep,
  faForwardStep,
  faLock,
} from "@fortawesome/free-solid-svg-icons";
import { faCompass } from "@fortawesome/free-regular-svg-icons";

import { Field, useField } from "formik";
import * as Yup from "yup";
import {
  PUBLISHED_OPTIONS,
  Group,
  GroupEditableData,
  IncidentAccessMode,
} from "../../api/groups/types";
import { getUserDirectory } from "../../api/users";
import { getAllAsns } from "../../api/asn";
import type { AsnInfo } from "../../api/asn/types";
import { getSession } from "../../api/session";
import { getIncidentAccessTeams } from "../../api/teams";
import type { Team } from "../../api/teams/types";

import FormikDateTime from "../../components/FormikDateTime";
import FormikDropdown from "../../components/FormikDropdown";
import FormikInput from "../../components/FormikInput";
import FormikMultiCombobox from "../../components/FormikMultiCombobox";
import FormikSwitch from "../../components/FormikSwitch";
import FormikWithSchema from "../../components/FormikWithSchema";
import { getGeoScopes } from "../../api/geoscope";

const incidentSchema = Yup.object().shape({
  title: Yup.string().required("Group name required"),
  locationName: Yup.string(), //keep in schema for backward compatibility
  closed: Yup.boolean(),
  verification_status: Yup.string(),
  confirmation_status: Yup.string(),
  publication_status: Yup.array(Yup.string())
    .required("publication status required").min(1).max(2)
    .test(
      "is-published",
      "Incident cannot be both Not Published and Published",
      (value) => {
        if (!value) return true;
        return !(
          value.includes("Not Published") && value.includes("Published")
        );
      }
    ),
  assignedTo: Yup.array().of(Yup.string()).optional().default([]),
  notes: Yup.string(),
  incidentStartedAt: Yup.date(),
  incidentEndedAt: Yup.date(),
  impactedAsns: Yup.array().of(Yup.string()).optional().default([]),
  impactedGeoScopes: Yup.array().of(Yup.string()).optional().default([]),
  accessPolicyMode: Yup.string().oneOf(["public", "restricted"]),
  accessPolicyTeams: Yup.array()
    .of(Yup.string())
    .when("accessPolicyMode", {
      is: "restricted",
      then: Yup.array()
        .of(Yup.string())
        .min(1, "Select at least one team for a restricted incident"),
    }),
});

interface IncidentFormValues extends GroupEditableData {
  accessPolicyMode: IncidentAccessMode;
  accessPolicyTeams: string[];
}

const getIncidentAccessTeamIds = (group?: Group) => {
  return (group?.accessPolicy?.teams || []).map((team) =>
    typeof team === "string" ? team : team._id
  );
};

const IncidentAccessPolicyFields = ({ teams }: { teams?: Team[] }) => {
  const [modeField] = useField<IncidentAccessMode>("accessPolicyMode");
  const [teamsField, teamsMeta, teamsHelpers] = useField<string[]>(
    "accessPolicyTeams"
  );
  const selectedTeamIds = teamsField.value || [];

  const toggleTeam = (teamId: string) => {
    if (selectedTeamIds.includes(teamId)) {
      teamsHelpers.setValue(selectedTeamIds.filter((id) => id !== teamId));
      return;
    }
    teamsHelpers.setValue([...selectedTeamIds, teamId]);
  };

  return (
    <div className='rounded border border-slate-300 bg-slate-50 dark:bg-gray-900 p-3'>
      <h3 className='font-medium mb-1'>Incident Access</h3>
      <p className='text-xs text-slate-500 dark:text-gray-400 mb-3'>
        Public incidents are available normally. Restricted incidents are visible
        only to the selected teams and administrators.
      </p>

      <FormikDropdown
        name='accessPolicyMode'
        label='Access Mode'
        icon={faLock}
        list={[
          { _id: "public", label: "Public" },
          { _id: "restricted", label: "Restricted to teams" },
        ]}
      />

      {modeField.value === "restricted" && (
        <div className='flex flex-col gap-2 mt-3'>
          <span className='text-slate-600 dark:text-gray-400'>Allowed Teams</span>
          {teams && teams.length > 0 ? (
            teams.map((team) => (
              <label key={team._id} className='flex items-center gap-2 text-sm'>
                <input
                  type='checkbox'
                  checked={selectedTeamIds.includes(team._id)}
                  onChange={() => toggleTeam(team._id)}
                />
                <span>{team.name}</span>
              </label>
            ))
          ) : (
            <p className='text-sm text-slate-500'>No teams are available.</p>
          )}
          {teamsMeta.touched && teamsMeta.error && (
            <p className='text-sm text-orange-600'>{teamsMeta.error}</p>
          )}
        </div>
      )}
    </div>
  );
};

interface IProps {
  group?: Group;
  onSubmit: (values: Partial<GroupEditableData>) => void;
  onCancel: () => void;
  isLoading: boolean;
}

const CreateEditIncidentForm = ({
  group,
  onSubmit,
  onCancel,
  isLoading,
}: IProps) => {
  const { data: users } = useQuery(["users", "directory"], getUserDirectory);
  const { data: asns } = useQuery<AsnInfo[]>(["asns"], getAllAsns);
  const { data: geoOptions } = useQuery(["geoScopes"], getGeoScopes);
  const { data: session } = useQuery(["session"], getSession, {
    staleTime: 50000,
  });
  const canManageIncidentAccess =
    session?.permissions?.includes("manage incident access") === true ||
    session?.isTeamLead === true;
  const { data: incidentAccessTeams } = useQuery(
    ["teams", "incident-access"],
    getIncidentAccessTeams,
    {
      enabled: canManageIncidentAccess,
      staleTime: 50000,
    }
  );

  return (
    <>
      <FormikWithSchema
        initialValues={{
          title: group?.title || "",
          locationName: group?.locationName || "",
          closed: group?.closed || false,
          verification_status: group?.verification_status || "maybe",
          confirmation_status: group?.confirmation_status || "maybe",
          publication_status: group?.publication_status || ["Not Published"],
          assignedTo: group?.assignedTo?.map((i) => i._id) || [],
          notes: group?.notes || "",
          incidentStartedAt: group?.incidentStartedAt || "",
          incidentEndedAt: group?.incidentEndedAt || "",
          impactedAsns: group?.impactedAsns || [],
          impactedGeoScopes: group?.impactedGeoScopes || [],
          accessPolicyMode: group?.accessPolicy?.mode || "public",
          accessPolicyTeams: getIncidentAccessTeamIds(group),
        }}
        schema={incidentSchema}
        onSubmit={(values: IncidentFormValues) => {
          const {
            accessPolicyMode,
            accessPolicyTeams,
            ...incidentValues
          } = values;
          const payload: Partial<GroupEditableData> = {
            ...incidentValues,
            _id: group?._id,
          };

          if (canManageIncidentAccess) {
            payload.accessPolicy = {
              mode: accessPolicyMode,
              teams: accessPolicyMode === "restricted" ? accessPolicyTeams : [],
            };
          }

          onSubmit(payload);
        }}
        loading={isLoading}
        onSubmitText={!!group ? "Update Incident" : "Create Incident"}
        onClose={onCancel}
      >
        <div className='flex gap-6 text-slate-200 dark:text-gray-300 pb-1'>
          <FormikSwitch
            name='closed'
            label='Closed'
            icon={faCircleMinus}
          />
        </div>
        <FormikInput name='title' label='Title' />
        {canManageIncidentAccess && (
          <IncidentAccessPolicyFields teams={incidentAccessTeams} />
        )}
        <FormikMultiCombobox
          name='assignedTo'
          unitLabel='User'
          label='Assign User to Incident'
          icon={faUsers}
          list={
            users?.map((i) => {
              return { key: i._id, value: i.username };
            }) || [{ key: "", value: "loading" }]
          }
        />

        <div className=' border-b'></div>

        <FormikDropdown
          name='verification_status'
          label='Outage verified?'
          list={[
            // https://formik.org/docs/guides/validation#frequently-asked-questions
            // Formik uses undefined to represent empty states.
            {_id: "maybe", label: "Verifying"},
            {_id: "true", label: "Verified"},
            {_id: "false", label: "Unable to Verify"},
          ]}
          placeholder='Verifying'
          icon={faMagnifyingGlassChart}
        />
        <FormikDropdown
          name='confirmation_status'
          label='Reason confirmed?'
          list={[
            {_id: "maybe", label: "Confirming"},
            {_id: "true", label: "Confirmed"},
            {_id: "false", label: "Unable to Confirm"},
          ]}
          placeholder='Confirming'
          icon={faCommentNodes}
        />
        <FormikMultiCombobox
          name='publication_status'
          unitLabel='status'
          label='Published?'
          icon={faBullhorn}
          list={PUBLISHED_OPTIONS.map((i) => {
            return { key: i, value: i };
          })}
        />
        {/* show only in edit mode */}
        {group && (
          <>
          <FormikMultiCombobox
            name='impactedAsns'
            unitLabel='ASN'
            label='Impacted ASNs'
            icon={faMagnifyingGlassChart}
            list={
              asns?.map((a) => {
                const num = a.number ?? Number(a.asn.replace(/^as/i, ""));
                const parts = [
                  `AS${num}`,
                  a.name || undefined,
                ].filter(Boolean);
                return {
                  key: a.asn,             // form: "as58303"
                  value: parts.join(" — "), // label shown in UI
                };
              }) || [{ key: "", value: "Loading ASNs…" }]
            }
          />
          <FormikMultiCombobox
            name='impactedGeoScopes'
            unitLabel='area'
            label='Impacted Geographic Areas'
            icon={faCompass}
            list={
              geoOptions?.map((g) => ({ key: g.key, value: g.value })) || []
            }
          />
          <FormikDateTime
            name='incidentStartedAt'
            label='Incident Start Time (UTC)'
            icon={faBackwardStep}
          />
          <FormikDateTime
            name='incidentEndedAt'
            label='Incident End Time (UTC)'
            icon={faForwardStep}
          />
          </>
        )}

        {/* <FormikInput name='locationName' label='Location' icon={faCompass} /> hide from UI */}

        <label>
          <span className='text-slate-600 dark:text-gray-400'>Description:</span>
          <Field
            as='textarea'
            name='notes'
            className='focus-theme px-3 py-2 border border-slate-300 bg-slate-50 dark:bg-gray-900 rounded w-full min-h-36'
            placeholder='Write useful information for Report trackers to know to help them understand this incident'
          />
        </label>
      </FormikWithSchema>
    </>
  );
};

export default CreateEditIncidentForm;
