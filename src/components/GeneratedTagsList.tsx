// refactor with floating-ui

import React, { useState } from "react";
import { GeneratedTags, Report } from "../api/reports/types";
import { isBoolean, startCase } from "lodash";
import GeneratedTag from "./GeneratedTag";

import { useMutation } from "@tanstack/react-query";
import { setAITagsFeedback } from "../api/reports";
import AIFeedbackScale from "./AIFeedback/AIFeedbackScale";
import AggieDialog from "./AggieDialog";
import AggieButton from "./AggieButton";
import { Formik, Form } from "formik";
import GeneratedTagDescription from "./GeneratedTagDescription";

interface IProps {
  report: Report;
  tags?: GeneratedTags;
  showCount?: number;
  tempHoverCSS?: string;
}
const GeneratedTagsList = ({ report, tags, showCount = 2 }: IProps) => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const doSetAIFeedback = useMutation(setAITagsFeedback, {
    onSuccess: () => {
      setFeedbackOpen(false);
    },
  });

  if (!tags) return <></>;

  const tagsList = Object.entries(tags).filter(
    ([key, value]) => !key.includes("rationale") && !key.includes("confidence")
  );

  if (!tagsList) return <></>;

  const booleanTagsList = tagsList
    .filter(
      ([key, value]) =>
        isBoolean(value) && value && !key.includes("contentType")
    )
    .slice(0, showCount);
  const moreTagsLength = tagsList.length - booleanTagsList.length;
  const defaultFormValues = tagsList.reduce(
    (a, v) => ({ ...a, [v[0]]: null }),
    {}
  );
  return (
    <>
      {booleanTagsList?.map(([key, value]) => (
        <GeneratedTag
          name={startCase(key).replaceAll("_", " ")}
          key={key.replaceAll("_", " ")}
        >
          <span className='block p-3 text-sm max-w-md '>
            {`${key}_rationale` in tags && tags[`${key}_rationale`]}
          </span>
        </GeneratedTag>
      ))}
      {moreTagsLength > 0 && (
        <GeneratedTag
          name={`+${moreTagsLength}`}
          className='rounded-full hover:bg-purple-100 dark:hover:bg-purple-100 dark:saturate-[0.7] text-xs text-purple-700 font-medium border border-purple-300'
        >
          <div className='flex gap-2 flex-col py-2'>
            <div className='flex gap-2 px-2 justify-between items-center text-sm'>
              <h2 className='font-medium'>All Generated Tags</h2>
              {/* <AggieButton
                variant='secondary'
                onClick={() => setFeedbackOpen(true)}
                className='rounded-full  text-xs'
                icon={faFilePen}
              >
                Submit Feedback
              </AggieButton> */}
            </div>
            {tagsList.map(([key, value]) => (
              <GeneratedTagDescription
                k={key}
                key={key}
                v={value}
                tags={tags}
              />
            ))}
          </div>
        </GeneratedTag>
      )}
      <div className='pointer-events-none'>
        <AggieDialog
          isOpen={feedbackOpen}
          onClose={() => setFeedbackOpen(false)}
          className='max-w-2xl w-full p-4 pointer-events-auto'
        >
          <Formik
            initialValues={defaultFormValues}
            onSubmit={(e) =>
              doSetAIFeedback.mutate({ report: report, aitags_feedback: e })
            }
            validateOnBlur={false}
          >
            <Form className='flex flex-col gap-3'>
              <div className='divide-y divide-purple-400'>
                {tagsList.map(([key, value]) => (
                  <div
                    key={key}
                    className='py-1 flex justify-between items-center'
                  >
                    <div className='max-w-md w-full'>
                      <span className='flex gap-2 items-center'>
                        {isBoolean(value) ? (
                          <span className='rounded-full px-2 bg-purple-600 dark:bg-purple-600 dark:saturate-[0.7] font-medium text-white dark:text-gray-300 text-sm'>
                            {`${value}`}
                          </span>
                        ) : (
                          <span className='block font-medium'>{value}</span>
                        )}
                        {startCase(key).replaceAll("_", " ")}{" "}
                      </span>
                      <span className='block mb-1 text-xs italic max-w-prose'>
                        {`${key}_rationale` in tags && tags[`${key}_rationale`]}
                      </span>
                    </div>
                    <div>
                      <AIFeedbackScale
                        name={key}
                        labelLeft={"not useful"}
                        labelRight={"useful"}
                        size={5}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className='flex justify-between'>
                <AggieButton
                  variant='secondary'
                  type='button'
                  onClick={() => setFeedbackOpen(false)}
                >
                  Cancel
                </AggieButton>
                <AggieButton
                  variant='primary'
                  disabled={doSetAIFeedback.isLoading}
                  loading={doSetAIFeedback.isLoading}
                  type={"submit"}
                >
                  Submit
                </AggieButton>
              </div>
            </Form>
          </Formik>
        </AggieDialog>
      </div>
    </>
  );
};

export default GeneratedTagsList;
