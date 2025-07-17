import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import * as Yup from "yup";

import { editComment, removeComment } from "../../../api/groups";
import { GroupComment, GroupCommentAttachment } from "../../../api/groups/types";
import { getSession } from "../../../api/session";

import AggieButton from "../../../components/AggieButton";
import {
  FilePickerManager,
  ImageUploadButton,
} from "../../../components/ImageUploader";
import UserToken from "../../../components/UserToken";
import { Formik, Field, FieldProps, Form } from "formik";
import Linkify from "linkify-react";
import { isEqual } from "lodash";

import { faComment, faCommentAlt } from "@fortawesome/free-regular-svg-icons";
import { faEdit, faEllipsisH } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DateTime from "../../../components/DateTime";
import DropdownMenu from "../../../components/DropdownMenu";

interface IProps {
  data: GroupComment;
  groupId: string | undefined;
}
const Comment = ({ data, groupId }: IProps) => {
  const queryClient = useQueryClient();
  const { data: session } = useQuery(["session"], getSession, {
    staleTime: 50000,
  });
  const [edit, setEdit] = useState(false);
  const managerRef = useRef(new FilePickerManager());

  const doDeleteComment = useMutation(removeComment, {
    onSuccess() {
      queryClient.invalidateQueries(["group", groupId]);
    },
  });
  const doUpdateComment = useMutation(editComment, {
    onSuccess() {
      queryClient.invalidateQueries(["group", groupId]);
    },
  });
  function onEditSubmit(
    formData: {
      commentdata: string,
      attachments: File | GroupCommentAttachment | null
    },
    resetForm: () => void
  ) {
    const post: GroupComment =
      isEqual(data.attachments?.[0], formData.attachments)
      ? {
        ...data,
        data: formData.commentdata,
      }
      : {
        ...data,
        data: formData.commentdata,
        attachments: formData.attachments && [formData.attachments],
        attachmentsToDelete:
          (data.attachments?.[0] && '_id' in data.attachments[0])
          ? [data.attachments[0]._id]
          : null,
      };
    doUpdateComment.mutate(
      { id: groupId, comment: post, },
      {
        onSuccess: () => {
          resetForm();
          managerRef.current.clear();
          setEdit(false);
          queryClient.invalidateQueries(["group", groupId]);
        },
      }
    );
  }
  if (!groupId) return <></>;

  return (
    <div
      key={data._id}
      className='border border-slate-300 rounded-lg bg-slate-50 overflow-hidden my-2'
    >
      <div className='flex justify-between text-sm py-2 px-2 border-b border-slate-300'>
        <p className='inline-flex items-center text-slate-600 gap-1'>
          <FontAwesomeIcon icon={faCommentAlt} /> <UserToken id={data.author} />
          <span className='italic '>comments </span>
        </p>
        <div className='flex gap-2 items-center'>
          <p className='italic'>
            last updated{" "}
            <DateTime dateString={data.updatedAt || data.createdAt} />
          </p>
          {(data.author === session?._id || session?.role === "admin") && (
            <>
              <AggieButton
                variant='secondary'
                onClick={() => setEdit(true)}
                icon={faEdit}
                className='h-full'
                disabled={edit}
              ></AggieButton>
              <DropdownMenu
                variant='secondary'
                className='px-2 py-1 rounded-lg bg-slate-100 border border-slate-300'
                panelClassName='overflow-hidden right-0'
                buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
              >
                <AggieButton
                  className='w-full px-2 py-1 hover:bg-red-100  font-medium flex gap-2 text-nowrap items-center flex-grow text-red-800 '
                  onClick={() =>
                    doDeleteComment.mutate({ id: groupId, comment: data })
                  }
                >
                  <FontAwesomeIcon icon={faEdit} />
                  delete comment
                </AggieButton>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
      {edit ? (
        <>
          <Formik
            initialValues={{
              commentdata: data.data,
              attachments: (data.attachments?.[0] || null)
            }}
            onSubmit={(e, { resetForm }) => {
              onEditSubmit(e, resetForm);
            }}
            validationSchema={Yup.object().shape({
              commentdata: Yup.string().required("Cannot Post Empty Comment!"),
              attachments: Yup.mixed(),
            })}
          >
            {({ resetForm, errors, isValid }) => (
              <Form encType="multipart/form-data">
                <Field
                  as='textarea'
                  name='commentdata'
                  className='focus-theme px-3 py-2 border-b border-slate-300 bg-white w-full min-h-36'
                  placeholder='Write a comment here...'
                />
                <Field name='attachments'>
                  {({ form }: FieldProps) => <>
                    <ImageUploadButton manager={managerRef.current} form={form} />
                    {
                      managerRef.current.getName()
                      || form.initialValues.attachments?.fileName
                    }
                  </>}
                </Field>
                {errors && (
                  <p className='text-sm text-rose-700 italic ml-2'>
                    {errors.commentdata}
                  </p>
                )}
                <AggieButton
                  type='button'
                  variant='secondary'
                  className='mb-2 ml-2 mt-1'
                  onClick={() => {
                    resetForm();
                    setEdit(false);
                  }}
                >
                  Cancel
                </AggieButton>
                <AggieButton
                  type='submit'
                  variant='primary'
                  className='mb-2 ml-2 mt-1'
                >
                  Update
                </AggieButton>
              </Form>
            )}
          </Formik>
        </>
      ) : (
        <>
          <p className='whitespace-pre-line px-3 py-3 bg-white'>
            <Linkify>{data.data}</Linkify>
          </p>
          {
            data.attachments
            && data.attachments.map((f: GroupCommentAttachment | File) =>
              ('fileName' in f) ? f.fileName : f.name
            )
          }
        </>
      )}
    </div>
  );
};

export default Comment;
