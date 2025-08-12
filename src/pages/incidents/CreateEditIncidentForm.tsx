import { useQuery } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleMinus,
  faUsers,
  faMagnifyingGlassChart,
  faCommentNodes,
  faBullhorn,
  faBackwardStep,
  faForwardStep,
} from "@fortawesome/free-solid-svg-icons";
import { faCompass } from "@fortawesome/free-regular-svg-icons";

import { Field } from "formik";
import * as Yup from "yup";
import { PUBLISHED_OPTIONS, Group, GroupEditableData } from "../../api/groups/types";
import { getUsers } from "../../api/users";

import FormikDateTime from "../../components/FormikDateTime";
import FormikDropdown from "../../components/FormikDropdown";
import FormikInput from "../../components/FormikInput";
import FormikMultiCombobox from "../../components/FormikMultiCombobox";
import FormikSwitch from "../../components/FormikSwitch";
import FormikWithSchema from "../../components/FormikWithSchema";

const incidentSchema = Yup.object().shape({
  title: Yup.string().required("Group name required"),
  locationName: Yup.string(),
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
});

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
  const { data: users } = useQuery(["users"], getUsers);

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
        }}
        schema={incidentSchema}
        onSubmit={(values: GroupEditableData) => {
          onSubmit({ ...values, _id: group?._id });
        }}
        loading={isLoading}
        onSubmitText={!!group ? "Update Incident" : "Create Incident"}
        onClose={onCancel}
      >
        <div className='flex gap-6 text-slate-200 pb-1'>
          <FormikSwitch
            name='closed'
            label='Closed'
            icon={faCircleMinus}
          />
        </div>
        <FormikInput name='title' label='Title' />
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
        <FormikInput name='locationName' label='Location' icon={faCompass} />

        <label>
          <span className='text-slate-600'>Description:</span>
          <Field
            as='textarea'
            name='notes'
            className='focus-theme px-3 py-2 border border-slate-300 bg-slate-50 rounded w-full min-h-36'
            placeholder='Write useful information for Report trackers to know to help them understand this incident'
          />
        </label>
      </FormikWithSchema>
    </>
  );
};

export default CreateEditIncidentForm;
