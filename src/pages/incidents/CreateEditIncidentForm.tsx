import { useQuery } from "@tanstack/react-query";

import { Field } from "formik";
import * as Yup from "yup";
import { VERACITY_OPTIONS } from "../../api/common";
import { Group, GroupEditableData } from "../../api/groups/types";
import { getUsers } from "../../api/users";

import FormikDropdown from "../../components/FormikDropdown";
import FormikInput from "../../components/FormikInput";
import FormikMultiCombobox from "../../components/FormikMultiCombobox";
import FormikSwitch from "../../components/FormikSwitch";
import FormikWithSchema from "../../components/FormikWithSchema";

const incidentSchema = Yup.object().shape({
  title: Yup.string().required("Group name required"),
  locationName: Yup.string(),
  escalated: Yup.boolean(),
  closed: Yup.boolean(),
  veracity: Yup.string(),
  assignedTo: Yup.array().of(Yup.string()).optional().default([]),
  notes: Yup.string(),
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
          escalated: group?.escalated || false,
          closed: group?.closed || false,
          veracity: group?.veracity || "Unconfirmed",
          assignedTo: group?.assignedTo?.map((i) => i._id) || [],
          notes: group?.notes || "",
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
          <FormikSwitch name='escalated' label={"Escalated"} />
          <FormikSwitch name='closed' label='Closed' />
        </div>
        <FormikInput name='title' label='Incident Title' />
        <p className='text-sm text-slate-700'>
          Ideally, titles should be written as a<i>question</i> that can be
          answered with a true/false
        </p>
        <FormikDropdown
          name={"veracity"}
          list={VERACITY_OPTIONS.map((i) => {
            return { _id: i, label: i };
          })}
          label={"Veracity"}
        />
        <FormikMultiCombobox
          name='assignedTo'
          unitLabel='User'
          label='Assign User to Incident'
          list={
            users?.map((i) => {
              return { key: i._id, value: i.username };
            }) || [{ key: "", value: "loading" }]
          }
        />

        <div className=' border-b'></div>

        <FormikInput name='locationName' label='Location' />

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
