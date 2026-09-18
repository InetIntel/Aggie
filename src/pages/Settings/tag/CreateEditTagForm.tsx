import * as Yup from "yup";

import { Formik, Form } from "formik";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { editTag, newTag } from "../../../api/tags";
import {
  TAG_CATEGORIES,
  TAG_CATEGORY_LABELS,
  type Tag,
} from "../../../api/tags/types";
import type { AxiosError } from "axios";

import AggieButton from "../../../components/AggieButton";
import FormikDropdown from "../../../components/FormikDropdown";
import FormikInput from "../../../components/FormikInput";

const tagEditSchema = Yup.object().shape({
  name: Yup.string().required("Tag name required"),
  category: Yup.mixed()
    .oneOf([...TAG_CATEGORIES])
    .required("Category required")
    .default("measurement"),
  description: Yup.string(),
  isCommentTag: Yup.boolean().default(false),
  color: Yup.string().required("Required").default("#fff"),
});

type editSchema = Yup.InferType<typeof tagEditSchema>;

const defaultTagEditValues = tagEditSchema.getDefault();

interface IProps {
  tag?: Tag;
  onClose: () => void;
}

const CreateEditTagForm = ({ tag, onClose }: IProps) => {
  const isCreateMode = !tag;
  const defaultValues = isCreateMode
    ? (defaultTagEditValues as editSchema)
    : ({
        name: tag.name,
        category: tag.category,
        description: tag.description,
        isCommentTag: tag.isCommentTag,
        color: tag.color,
      } as editSchema);

  const queryClient = useQueryClient();

  const [error, setError] = useState("");
  const doCreateTag = useMutation(newTag, {
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries(["tags"]);
    },
    onError: showError,
  });
  const doEditTag = useMutation(editTag, {
    onSuccess: () => {
      onClose();
      queryClient.invalidateQueries(["tags"]);
    },
    onError: showError,
  });
  function showError(err: AxiosError) {
    if (err.response && err.response.status === 422) {
      setError("A tag with this name already exists.");
      return;
    }
    setError("The tag could not be saved.");
  }
  function onSubmitForm(data: editSchema) {
    setError("");
    if (isCreateMode) {
      doCreateTag.mutate(data);
    } else {
      doEditTag.mutate({ ...data, _id: tag._id });
    }
  }

  const isLoading = doEditTag.isLoading || doCreateTag.isLoading;

  return (
    <Formik
      initialValues={defaultValues}
      onSubmit={(e) => onSubmitForm(e)}
      validationSchema={tagEditSchema}
      validateOnBlur={true}
    >
      <Form className='flex flex-col gap-4'>
        {error && (
          <p className='px-3 py-2 border border-red-400 bg-red-200 dark:bg-red-200 dark:saturate-[0.7] text-red-800 font-medium'>
            {error}
          </p>
        )}

        <FormikInput
          label='Tag name'
          name='name'
          placeholder='Enter a tag name'
        />
        <div>
          <FormikDropdown
            label='Category'
            name='category'
            list={TAG_CATEGORIES.map((category) => ({
              _id: category,
              label: TAG_CATEGORY_LABELS[category],
            }))}
          />
          <p className='mt-1 text-xs text-slate-500 dark:text-gray-400'>
            This controls where the tag is grouped throughout Aggie.
          </p>
        </div>
        <FormikInput
          label='Description'
          name='description'
          placeholder='Optional description'
          multiline
          rows={3}
        />

        <div className='flex justify-between'>
          <AggieButton
            disabled={isLoading}
            variant='secondary'
            type='button'
            onClick={onClose}
          >
            Cancel
          </AggieButton>
          <AggieButton
            variant='primary'
            disabled={isLoading}
            loading={isLoading}
            type={"submit"}
          >
            {isCreateMode ? "Create tag" : "Save changes"}
          </AggieButton>
        </div>
      </Form>
    </Formik>
  );
};

export default CreateEditTagForm;
