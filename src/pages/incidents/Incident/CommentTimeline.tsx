import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Formik, Field, FieldProps, Form } from "formik";
import * as Yup from "yup";

import { addComment } from "../../../api/groups";
import { GroupCommentAttachment } from "../../../api/groups/types";
import {
  EditableGroupComment,
  Group,
  GroupComment,
} from "../../../api/groups/types";
import { getSession } from "../../../api/session";

import AggieButton from "../../../components/AggieButton";
import DateTime from "../../../components/DateTime";
import { FileChipList } from "../../../components/FileChip";
import {
  FilePickerManager,
  FileUploadButton,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_SIZE,
} from "../../../components/FileUploader";
import UserToken from "../../../components/UserToken";
import Comment from "./Comment";

import { faDotCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

function getImageFiles(files: FileList | File[]): File[] {
  return Array.from(files).filter(
    (file) => file.type === "image/jpeg" || file.type === "image/png"
  );
}

interface IProps {
  group?: Group;
  isLoading: boolean;
}
const CommentTimeline = ({ group, isLoading }: IProps) => {
  const queryClient = useQueryClient();
  const managerRef = useRef(new FilePickerManager());
  const [attachmentError, setAttachmentError] = useState("");

  const postNewComment = useMutation(addComment);

  const { data: session } = useQuery(["session"], getSession, {
    staleTime: 50000,
  });
  function onPostAdd(
    formData: { commentdata: string, attachments: (File | GroupCommentAttachment)[] },
    resetForm: () => void
  ) {
    if (!session || !group) return false;
    const post: EditableGroupComment = {
      data: formData.commentdata,
      attachments: formData.attachments,
      author: session._id,
    };
    postNewComment.mutate(
      { id: group._id, comment: post },
      {
        onSuccess: () => {
          resetForm();
          managerRef.current.clear();
          queryClient.invalidateQueries(["group", group._id]);
        },
      }
    );
  }
  if (!group) return <></>;

  return (
    <article className='mt-4'>
      <div className='px-2 py-2 flex justify-between'>
        <p className='text-sm flex gap-1 items-center'>
          <FontAwesomeIcon icon={faDotCircle} className='text-slate-600 dark:text-gray-400 mr-1' />
          <span className='italic text-slate-600 dark:text-gray-400'> user </span>
          <UserToken id={group?.creator?._id || ""} loading={isLoading} />
          <span className='italic text-slate-600 dark:text-gray-400'>
            {" "}
            created this incident on
          </span>{" "}
          <span>
            {" "}
            <DateTime dateString={group?.storedAt || ""} />
          </span>
        </p>
        <p></p>
      </div>
      <div>
        {!!group?.comments &&
          group.comments.map((comment: GroupComment) => (
            <Comment data={comment} groupId={group._id} key={comment._id} />
          ))}
      </div>
      <div className=' bg-slate-50 dark:bg-gray-900 border border-slate-300 rounded-lg'>
        <Formik
          initialValues={{ commentdata: "", attachments: [] as File[] }}
          onSubmit={(e, { resetForm }) => {
            onPostAdd(e, resetForm);
          }}
          validationSchema={Yup.object().shape({
            commentdata: Yup.string().required("Cannot Post Empty Comment!"),
            attachments: Yup.array().of(Yup.mixed()).max(
              MAX_ATTACHMENT_COUNT,
              `each comment can be attached maximum ${MAX_ATTACHMENT_COUNT} files`
            ),
          })}
        >
        {({ resetForm, errors, values, setFieldValue }) => {
  const addImages = (files: File[]) => {
  const images = getImageFiles(files);
  if (images.length === 0) return;

  if (images.some(file => file.size > MAX_ATTACHMENT_SIZE)) {
    setAttachmentError("Each image must be less than 5 MB.");
    return;
  }

  const existing = managerRef.current.getFiles();

  if (existing.length + images.length > MAX_ATTACHMENT_COUNT) {
    setAttachmentError("Maximum 3 attachments allowed.");
    return;
  }

  const combined = [...existing, ...images];

  managerRef.current.setFiles(combined);
  setFieldValue("attachments", combined);
  setAttachmentError("");
};

  return (
    <Form
      encType="multipart/form-data"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        addImages(Array.from(event.dataTransfer.files));
      }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length > 0) {
          event.preventDefault();
          addImages(files);
        }
      }}
    >
              <div className='flex justify-between px-3 py-2'>
                <h2 className='font-medium'>Add Comment</h2>
              </div>
              <Field
                as='textarea'
                name='commentdata'
                className='focus-theme px-3 py-1 border-y border-slate-300 bg-white dark:bg-gray-800 w-full min-h-36 dark:bg-gray-600'
                placeholder='Write a comment here...'
              />
              <Field name='attachments' >
                {({ form }: FieldProps) => (
                  <div className='px-2 py-1 '>
                    <FileUploadButton manager={managerRef.current} form={form} />
                    {attachmentError && (
                    <p className="text-sm text-red-600">
                    {attachmentError}
                    </p>
                  )}
                    <div className="flex flex-wrap gap-2">
  {managerRef.current.getNames().map((name, index) => (
    <div
      key={`${name}-${index}`}
      className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:bg-gray-800"
    >
      <span>{name}</span>

      <button
        type="button"
        onClick={() => {
          managerRef.current.removeFileAt(index);

          form.setFieldValue(
            "attachments",
            [...managerRef.current.getFiles()]
          );
        }}
        className="font-bold text-red-500 hover:text-red-700"
        aria-label={`Remove ${name}`}
        title="Remove attachment"
      >
        ×
      </button>
    </div>
  ))}
</div>
                  </div>
                )}
              </Field>
              {errors && (
                <p className='text-sm text-rose-700 italic ml-2'>
                  {errors.commentdata}
                </p>
              )}
              <AggieButton
                type='submit'
                variant='primary'
                className='mb-2 ml-2 mt-1 '
                loading={postNewComment.isLoading}
                disabled={postNewComment.isLoading}
              >
                Post
              </AggieButton>
         </Form>
  );
}}
        </Formik>
      </div>
    </article>
  );
};
export default CommentTimeline;
