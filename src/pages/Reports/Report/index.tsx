import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useUpdateQueryData } from "../../../hooks/useUpdateQueryData";
import { useReportMutations } from "../useReportMutations";
import { useQueryParams } from "../../../hooks/useQueryParams";

import { getReport } from "../../../api/reports";
import { getSources } from "../../../api/sources";
import * as Yup from "yup";

import type { ReportQueryState } from "../../../api/reports/types";

import AggieButton from "../../../components/AggieButton";
import AddReportsToIncidents from "../components/AddReportsToIncident";
import DropdownMenu from "../../../components/DropdownMenu";
import SocialMediaPost from "../../../components/SocialMediaPost";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCaretDown,
  faDotCircle,
  faEnvelope,
  faEnvelopeOpen,
  faFile,
  faFileEdit,
  faPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import FormikWithSchema from "../../../components/FormikWithSchema";
import FormikMultiCombobox from "../../../components/FormikMultiCombobox";
import TagsList from "../../../components/Tags/TagsList";
import { getTags } from "../../../api/tags";
import { Form, Formik } from "formik";

const tagsSchema = Yup.object().shape({
  smtcTags: Yup.array().of(Yup.string()).optional().default([]),
});

const Report = () => {
  let { id } = useParams();
  const { setParams, getParam } = useQueryParams<ReportQueryState>();

  const isBatchMode = getParam("batch") === "true";

  const navigate = useNavigate();
  const { setRead, setIrrelevance, doSetTags } = useReportMutations({
    key: isBatchMode ? ["batch"] : ["reports"],
  });

  const { data: tags } = useQuery(["tags"], getTags);

  const { data: report, isLoading } = useQuery(["reports", id], () =>
    getReport(id)
  );

  const sourcesQuery = useQuery(["sources"], getSources);

  function newIncidentFromReport() {
    const params = new URLSearchParams({
      reports: [id].toString(),
    });

    navigate("/incidents/new?" + params.toString());
  }
  //mark as read
  const [ranOnce, setRanOnce] = useState("");

  useEffect(() => {
    if (!report || !id || ranOnce === id) return;

    if (!report.read) {
      setRead.mutate({ reportIds: [id], read: true, currentPageId: id });
    }

    setRanOnce(id);
  }, [report, id]);

  function getSourceFromId(ids: string[]) {
    if (!sourcesQuery.data) return <>none</>;

    const names = ids.reduce((previous, currentId) => {
      const source = sourcesQuery.data?.find((i) => i._id === currentId);
      if (!source)
        return (
          <>
            {previous}
            {previous.props.children && ", "}
            <span>Unknown Source</span>
          </>
        );
      return (
        <>
          {previous}
          {previous.props.children && ", "}
          <button
            className='inline hover:bg-slate-100 rounded hover:underline px-1 text-left'
            onClick={() => setParams({ sourceId: source._id })}
          >
            {source.nickname}
          </button>
        </>
      );
    }, <></>);
    return names;
  }

  const [addReportModal, setAddReportModal] = useState(false);
  function addReportsToIncidents() {
    setAddReportModal(true);
  }
  // refactor to be more pretty and have placeholders
  if (isLoading)
    return (
      <span className='pt-4 sticky top-0 font-medium text-center'>
        ...loading
      </span>
    );
  if (!report || !id) return <> error loading page</>;
  return (
    <article className='pt-4 pr-2 sticky top-0 overflow-y-auto min-h-[70vh] max-h-[93vh]  '>
      <AddReportsToIncidents
        selection={report ? [report] : undefined}
        isOpen={addReportModal}
        queryKey={["reports"]}
        onClose={() => setAddReportModal(false)}
        addRemove={() => setAddReportModal(false)}
      />
      <nav className='sticky top-0 pl-3 pr-2 py-2 flex justify-between items-center rounded-lg text-xs border border-slate-300 mb-2 shadow-md bg-white'>
        <div className='flex   '>Actions</div>
        <div className='flex gap-1'>
          <AggieButton
            variant={report.read ? "light:lime" : "light:amber"}
            className='rounded-lg border border-slate-300 '
            onClick={(e) => {
              e.stopPropagation();

              setRead.mutate({
                reportIds: [report._id],
                read: !report.read,
                currentPageId: report._id,
              });
            }}
            loading={setRead.isLoading}
            disabled={!report || setRead.isLoading}
            icon={report.read ? faEnvelopeOpen : faEnvelope}
          >
            {report.read ? <> unread</> : <> read</>}
          </AggieButton>
          <div className='rounded-lg border border-slate-300 '>
            <AggieButton
              variant={"light:rose"}
              className='rounded-l-lg'
              onClick={(e) => {
                e.stopPropagation();
                setIrrelevance.mutate({
                  reportIds: [report._id],
                  irrelevant: "true",
                  currentPageId: report._id,
                });
              }}
              icon={faXmark}
              loading={setIrrelevance.isLoading}
              disabled={!report || setIrrelevance.isLoading}
            >
              irrelevant
            </AggieButton>
            <AggieButton
              variant={"light:green"}
              className='rounded-r-lg'
              onClick={(e) => {
                e.stopPropagation();
                setIrrelevance.mutate({
                  reportIds: [report._id],
                  irrelevant: "false",
                  currentPageId: report._id,
                });
              }}
              icon={faDotCircle}
              loading={setIrrelevance.isLoading}
              disabled={!report || setIrrelevance.isLoading}
            >
              relevant
            </AggieButton>
          </div>

          <div className='flex font-medium'>
            <AggieButton
              className='px-2 py-1 rounded-l-lg bg-slate-100 border border-slate-300 hover:bg-slate-200'
              onClick={addReportsToIncidents}
            >
              {!!report._group ? (
                <>
                  <FontAwesomeIcon icon={faFileEdit} />
                  Change Incident
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faPlus} />
                  Add to Incident
                </>
              )}
            </AggieButton>
            <DropdownMenu
              variant='secondary'
              buttonElement={
                <FontAwesomeIcon
                  icon={faCaretDown}
                  className='ui-open:rotate-180'
                />
              }
              className='px-2 py-1 rounded-r-lg border-y border-r'
              panelClassName='right-0'
            >
              <AggieButton
                className='px-3 py-2 hover:bg-slate-200'
                onClick={newIncidentFromReport}
              >
                <FontAwesomeIcon icon={faFile} />
                Create New Incident with Report
              </AggieButton>
            </DropdownMenu>
          </div>
        </div>
      </nav>
      <div className='flex flex-col gap-1 my-2'>
        <div className=''>
          <p className='font-medium text-sm '>Source</p>
          <p className=' '>{getSourceFromId(report._sources)}</p>
        </div>
        <div className=''>
          <Formik
            initialValues={{
              smtcTags: report?.smtcTags || [],
            }}
            validationSchema={tagsSchema}
            enableReinitialize
            onSubmit={(values) => {
              if (!id) return;
              doSetTags.mutate({
                tagIds: values.smtcTags,
                reportIds: [id],
                currentPageId: id,
              });
            }}
          >
            {({ isValid, resetForm, touched }) => (
              <Form className='flex flex-col gap-3'>
                <FormikMultiCombobox
                  name={"smtcTags"}
                  label={"Tags"}
                  unitLabel='Tag'
                  list={
                    tags?.map((i) => {
                      return { key: i._id, value: i.name };
                    }) || [{ key: "", value: "loading" }] ||
                    []
                  }
                />
                {!!touched.smtcTags && (
                  <div className='flex text-xs'>
                    <AggieButton
                      disabled={doSetTags.isLoading}
                      variant='transparent'
                      type='button'
                      onClick={() => resetForm()}
                    >
                      cancel
                    </AggieButton>
                    <AggieButton
                      variant='primary'
                      disabled={doSetTags.isLoading || !isValid}
                      loading={doSetTags.isLoading}
                      type={"submit"}
                    >
                      Save Changes
                    </AggieButton>
                  </div>
                )}
              </Form>
            )}
          </Formik>
        </div>
      </div>

      <SocialMediaPost report={report} showMedia />
    </article>
  );
};

export default Report;
