import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import * as Yup from "yup";

import { editComment, removeComment } from "../../../api/groups";
import {
  GroupComment,
  GroupCommentAttachment,
} from "../../../api/groups/types";
import { getSession } from "../../../api/session";

import AggieButton from "../../../components/AggieButton";
import { FileChipList } from "../../../components/FileChip";
import {
  FilePickerManager,
  FileUploadButton,
  MAX_ATTACHMENT_COUNT,
} from "../../../components/FileUploader";
import UserToken from "../../../components/UserToken";
import { Formik, Field, FieldProps, Form } from "formik";
import Linkify from "linkify-react";
import { isEmpty, isEqual, differenceWith } from "lodash";

import { faComment, faCommentAlt } from "@fortawesome/free-regular-svg-icons";
import {
  faEdit,
  faEllipsisH,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DateTime from "../../../components/DateTime";
import DropdownMenu from "../../../components/DropdownMenu";

const CommentImagePreview = ({ src, name }: { src: string; name: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex w-32 flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="overflow-hidden rounded-lg border border-slate-300"
          aria-label={`Preview ${name}`}
        >
          <img
            src={src}
            alt={name}
            loading="lazy"
            className="h-32 w-32 object-cover hover:opacity-80"
          />
        </button>

        <span
          className="w-full break-all text-center text-xs text-slate-600 dark:text-slate-300"
          title={name}
        >
          {name}
        </span>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Image preview: ${name}`}
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 text-3xl text-white"
            onClick={() => setOpen(false)}
            aria-label="Close image preview"
          >
            ×
          </button>

          <img
            src={src}
            alt={name}
            className="max-h-[90vh] max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

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
  const managerRef = useRef(new FilePickerManager(data.attachments));

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
      commentdata: string;
      attachments: (File | GroupCommentAttachment)[];
    },
    resetForm: () => void,
  ) {
    const post: GroupComment = {
      ...data,
      data: formData.commentdata,
      attachments: differenceWith(
        formData.attachments,
        data.attachments,
        isEqual,
      ),
      attachmentsToDelete: differenceWith(
        data.attachments,
        formData.attachments,
        isEqual,
      ).reduce(
        (accumulator, currentValue) =>
          "_id" in currentValue
            ? accumulator.concat([String(currentValue._id)])
            : accumulator,
        [] as string[],
      ),
    };
    doUpdateComment.mutate(
      { id: groupId, comment: post },
      {
        onSuccess: () => {
          resetForm();
          setEdit(false);
          queryClient.invalidateQueries(["group", groupId]);
        },
      },
    );
  }
  function onEditClick() {
    managerRef.current.clear();
    managerRef.current = new FilePickerManager(data.attachments);
    setEdit(true);
  }

  if (!groupId) return <></>;

  const UPLOAD_DIR = process.env.UPLOAD_DIR || process.env.PUBLIC_URL || "";
  const nameList = data.attachments.reduce(
    (accumulator, currentValue) =>
      accumulator.concat([
        currentValue instanceof File
          ? currentValue.name
          : currentValue.fileName,
      ]),
    [] as string[],
  );
  const pathList = data.attachments.reduce(
    (accumulator, currentValue) =>
      accumulator.concat([
        currentValue instanceof File
          ? currentValue.webkitRelativePath
          : UPLOAD_DIR + currentValue.path,
      ]),
    [] as string[],
  );

  return (
    <div
      key={data._id}
      className="border border-slate-300 rounded-lg bg-slate-50 dark:bg-gray-900 overflow-hidden my-2 dark:bg-gray-700"
    >
      <div className="border-b border-slate-300">
        <div className="flex justify-between text-sm px-2 py-2">
          <p className="inline-flex items-center text-slate-600 dark:text-gray-400 gap-1">
            <FontAwesomeIcon icon={faCommentAlt} />{" "}
            <UserToken id={data.author} />
            <span className="italic ">comments </span>
          </p>
          <div className="flex gap-2 items-center">
            <p className="italic">
              last updated{" "}
              <DateTime dateString={data.updatedAt || data.createdAt} />
            </p>
            {(data.author === session?._id || session?.role === "admin") && (
              <>
                <AggieButton
                  variant="secondary"
                  onClick={onEditClick}
                  icon={faEdit}
                  className="h-full"
                  disabled={edit}
                ></AggieButton>
                <DropdownMenu
                  variant="secondary"
                  className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-gray-700 border border-slate-300 "
                  panelClassName="overflow-hidden right-0"
                  buttonElement={<FontAwesomeIcon icon={faEllipsisH} />}
                >
                  <AggieButton
                    className="w-full px-2 py-1 hover:bg-red-100 dark:hover:bg-red-100 dark:saturate-[0.7] font-medium flex gap-2 text-nowrap items-center flex-grow text-red-800 "
                    onClick={() =>
                      doDeleteComment.mutate({ id: groupId, comment: data })
                    }
                  >
                    <FontAwesomeIcon icon={faTrash} />
                    delete comment
                  </AggieButton>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>
      </div>
      {edit ? (
        <Formik
          initialValues={{
            commentdata: data.data,
            attachments: data.attachments,
          }}
          onSubmit={(e, { resetForm }) => {
            onEditSubmit(e, resetForm);
          }}
          validationSchema={Yup.object().shape({
            commentdata: Yup.string().required("Cannot Post Empty Comment!"),
            attachments: Yup.array()
              .of(Yup.mixed())
              .max(
                MAX_ATTACHMENT_COUNT,
                `each comment can be attached maximum ${MAX_ATTACHMENT_COUNT} files`,
              ),
          })}
        >
          {({ resetForm, errors, isValid }) => (
            <Form encType="multipart/form-data">
              <Field
                as="textarea"
                name="commentdata"
                className="focus-theme px-3 py-2 border-b border-slate-300 bg-white dark:bg-gray-800 w-full min-h-36"
                placeholder="Write a comment here..."
              />
              <Field name="attachments">
                {({ form }: FieldProps) => (
                  <div className="px-2 py-1">
                    <FileUploadButton
                      manager={managerRef.current}
                      form={form}
                    />
                    <FileChipList
                      nameList={managerRef.current.getNames()}
                      pathList={managerRef.current.getPaths()}
                      onRemove={(i) => managerRef.current.removeFileAt(i)}
                      form={form}
                      edit={true}
                    />
                  </div>
                )}
              </Field>
              {errors && (
                <p className="text-sm text-rose-700 italic ml-2">
                  {errors.commentdata}
                </p>
              )}
              <AggieButton
                type="button"
                variant="secondary"
                className="mb-2 ml-2 mt-1"
                onClick={() => {
                  resetForm();
                  setEdit(false);
                }}
              >
                Cancel
              </AggieButton>
              <AggieButton
                type="submit"
                variant="primary"
                className="mb-2 ml-2 mt-1"
              >
                Update
              </AggieButton>
            </Form>
          )}
        </Formik>
      ) : (
        <div className="bg-white dark:bg-gray-800 flex flex-col gap-3 px-3 py-3 whitespace-pre-line">
          <p>
            <Linkify>{data.data}</Linkify>
          </p>
          <FileChipList
            nameList={nameList.filter((_, index) => {
              const attachment = data.attachments[index];
              return (
                attachment instanceof File ||
                !["image/jpeg", "image/png"].includes(attachment.mimeType)
              );
            })}
            pathList={pathList.filter((_, index) => {
              const attachment = data.attachments[index];
              return (
                attachment instanceof File ||
                !["image/jpeg", "image/png"].includes(attachment.mimeType)
              );
            })}
            edit={false}
          />
          <div className="flex flex-wrap gap-2">
            {data.attachments.map((attachment, index) => {
              if (
                attachment instanceof File ||
                !["image/jpeg", "image/png"].includes(attachment.mimeType)
              ) {
                return null;
              }

              const rawPath = pathList[index];
              const src = rawPath.startsWith("/incidents/uploads/")
                ? `${(process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "")}${rawPath}`
                : rawPath;

              return (
                <CommentImagePreview
                  key={attachment._id}
                  src={src}
                  name={attachment.fileName}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Comment;
