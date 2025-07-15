import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Formik, Field, FieldProps, Form } from "formik";
import * as Yup from "yup";

import { addComment } from "../../../api/groups";
import {
  EditableGroupComment,
  Group,
  GroupComment,
} from "../../../api/groups/types";
import { getSession } from "../../../api/session";

import AggieButton from "../../../components/AggieButton";
import DateTime from "../../../components/DateTime";
import {
  FilePickerManager,
  ImageUploadButton,
  NamePreview,
} from "../../../components/ImageUploader";
import UserToken from "../../../components/UserToken";
import Comment from "./Comment";

import { faDotCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface IProps {
  group?: Group;
  isLoading: boolean;
}
const CommentTimeline = ({ group, isLoading }: IProps) => {
  const queryClient = useQueryClient();
  const managerRef = useRef(new FilePickerManager());

  const postNewComment = useMutation(addComment);

  const { data: session } = useQuery(["session"], getSession, {
    staleTime: 50000,
  });
  function onPostAdd(
    formData: { commentdata: string, attachments: File | null },
    resetForm: () => void
  ) {
    if (!session || !group) return false;
    const post: EditableGroupComment = {
      data: formData.commentdata,
      author: session._id,
    };
    postNewComment.mutate(
      { id: group._id, comment: post, attachments: formData.attachments },
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
        <h2 className='text-sm font-medium flex gap-1 items-center'>
          <FontAwesomeIcon icon={faDotCircle} className='text-slate-600 mr-1' />
          <span className='font-normal italic text-slate-600'> user </span>
          <UserToken id={group?.creator?._id || ""} loading={isLoading} />
          <span className='font-normal italic text-slate-600'>
            {" "}
            created this incident on
          </span>{" "}
          <span>
            {" "}
            <DateTime dateString={group?.storedAt || ""} />
          </span>
        </h2>
        <p></p>
      </div>
      <div>
        {!!group?.comments &&
          group.comments.map((comment: GroupComment) => (
            <Comment data={comment} groupId={group._id} key={comment._id} />
          ))}
      </div>
      <div className=' bg-slate-50 border border-slate-300 rounded-lg'>
        <Formik
          initialValues={{ commentdata: "", attachments: null }}
          onSubmit={(e, { resetForm }) => {
            console.log(e);
            onPostAdd(e, resetForm);
          }}
          validationSchema={Yup.object().shape({
            commentdata: Yup.string().required("Cannot Post Empty Comment!"),
            attachments: Yup.mixed(),
          })}
        >
          {({ resetForm, errors }) => (
            <Form>
              <div className='flex justify-between px-3 py-2'>
                <h2 className='font-medium'>Add Comment</h2>
                <Field name='attachments'>
                  {({ form }: FieldProps) => (
                    <ImageUploadButton manager={managerRef.current} form={form} />
                  )}
                </Field>
              </div>
              <NamePreview manager={managerRef.current} />
              <Field
                as='textarea'
                name='commentdata'
                className='focus-theme px-3 py-1 border-y border-slate-300 bg-white w-full min-h-36'
                placeholder='Write a comment here...'
              />
              {errors && (
                <p className='text-sm text-rose-700 italic ml-2'>
                  {errors.commentdata}
                </p>
              )}

              <AggieButton
                type='submit'
                variant='primary'
                className='mb-2 ml-2 mt-1'
                loading={postNewComment.isLoading}
                disabled={postNewComment.isLoading}
              >
                Post
              </AggieButton>
            </Form>
          )}
        </Formik>
      </div>
    </article>
  );
};
export default CommentTimeline;
