import { faMinusCircle, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Group } from "../../../api/groups/types";
import AggieButton from "../../../components/AggieButton";
import PlaceholderDiv from "../../../components/PlaceholderDiv";
import TagsList from "../../../components/Tags/TagsList";
import UserToken from "../../../components/UserToken";
import VeracityToken from "../../../components/VeracityToken";

interface IProps {
  group?: Group;
  isLoading: boolean;
  onEdit: () => void;
}
const IncidentInfo = ({ group, isLoading, onEdit }: IProps) => {
  return (
    <header className='text-slate-600 border-b border-slate-300 py-2'>
      <div className='flex justify-between'>
        <div>
          <div className='flex gap-1 flex-wrap'>
            <VeracityToken value={group?.veracity} />
            {group?.closed && (
              <span className='px-1 bg-purple-200 text-purple-700 font-medium inline-flex gap-1 items-center'>
                <FontAwesomeIcon icon={faMinusCircle} />
                Closed
              </span>
            )}
            <TagsList values={group?.smtcTags} />
          </div>
          <PlaceholderDiv
            loading={isLoading}
            className='text-black text-3xl font-medium my-2'
            loadingClass='mt-1 bg-slate-200 rounded-lg'
            width='12em'
          >
            <h1>
              {group?.title}{" "}
              {group?.escalated && (
                <span className='px-1 bg-orange-700 text-white font-medium text-base inline-flex gap-1 items-center no-underline'>
                  <FontAwesomeIcon icon={faWarning} />
                  Escalated
                </span>
              )}
            </h1>
          </PlaceholderDiv>
        </div>
      </div>
      <div className='flex gap-12 my-2'>
        <PlaceholderDiv as='p' width='7em' loading={isLoading}>
          Id #{group?.idnum}
        </PlaceholderDiv>
        <PlaceholderDiv as='p' width='7em' loading={isLoading}>
          <span className='font-medium'>{group?._reports.length}</span> reports
          attached
        </PlaceholderDiv>

        <PlaceholderDiv as='p' width='7em' loading={isLoading}>
          {group?.locationName && (
            <>
              located at{" "}
              <span className='font-medium'>{group?.locationName}</span>
            </>
          )}
        </PlaceholderDiv>
        <PlaceholderDiv as='p' width='7em' loading={isLoading}>
          created by{" "}
          <span className='font-medium'>{group?.creator?.username}</span>
        </PlaceholderDiv>
      </div>
      <div className='border-t border-slate-300 flex gap-2 items-center py-2'>
        <span className='whitespace-nowrap'>Assigned To:</span>
        <PlaceholderDiv
          loading={isLoading}
          className='flex flex-wrap gap-x-2 gap-y-1 items-center '
        >
          {group?.assignedTo?.map((user) => (
            <UserToken
              id={user._id}
              className='bg-white border border-slate-300 rounded-full px-2 text-sm font-medium'
            />
          ))}
          <AggieButton
            className='hover:underline text-blue-600 text-xs '
            onClick={() => onEdit()}
          >
            Change
          </AggieButton>
        </PlaceholderDiv>
      </div>

      <div className='flex gap-2'>
        <p>Description:</p>

        {group?.notes ? (
          <div className='px-2 py-1 border border-slate-200 rounded w-full bg-white overflow-y-auto max-h-40'>
            <p className='whitespace-pre-line max-w-prose '>{group?.notes}</p>
          </div>
        ) : (
          <p className='italic text-slate-600'>No Description Set</p>
        )}
      </div>
    </header>
  );
};

export default IncidentInfo;
