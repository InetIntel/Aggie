import {
  faCompass,
  faFileLines,
  faMessage,
} from "@fortawesome/free-regular-svg-icons";
import {
  faMinusCircle,
  faUserEdit,
  faWarning,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "react-router-dom";
import { Groups, Group } from "../../../api/groups/types";
import TagsList from "../../../components/Tags/TagsList";
import UserToken from "../../../components/UserToken";
import VeracityToken from "../../../components/VeracityToken";

interface IProps {
  incidents?: Groups;
  selectedIncident?: Group;
  onIncidentClicked: (item: Group) => void;
}

const NestedIncidentsList = ({
  incidents,
  selectedIncident,
  onIncidentClicked,
}: IProps) => {
  const navigate = useNavigate();

  function onUserClick(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    e.preventDefault();
    navigate({ pathname: `/settings/user/${id}` });
  }

  return (
    <>
      {incidents &&
        incidents.results.map((item) => (
          <button
            key={item._id}
            className={`w-full text-left ${
              selectedIncident?._id === item._id
                ? "bg-blue-200"
                : "hover:bg-blue-100"
            }`}
            onClick={() => onIncidentClicked(item)}
          >
            <article className='grid grid-cols-4 lg:grid-cols-6 px-2 py-2 text-sm text-slate-500  group-hover:bg-slate-50 border-b border-slate-200'>
              <header className='col-span-3 flex flex-col'>
                <div className='flex gap-1 text-xs'>
                  <p className='font-medium'>#{item.idnum}</p>

                  <VeracityToken value={item.veracity} />
                  {item.closed && (
                    <span className='px-1 bg-purple-100 text-purple-600 font-medium flex gap-1 items-center'>
                      <FontAwesomeIcon icon={faMinusCircle} />
                      Closed
                    </span>
                  )}
                  <TagsList values={item.smtcTags} />
                </div>
                <h2 className=' text-black gap-2 items-center font-medium my-0.5'>
                  <span className='text-base  group-hover:text-blue-600 group-hover:underline'>
                    {item.title}
                  </span>
                  {item.escalated && (
                    <span className='px-1 bg-orange-700 w-fit ml-1 text-white font-medium text-xs inline-flex gap-1 items-center no-underline'>
                      <FontAwesomeIcon icon={faWarning} />
                      Escalated
                    </span>
                  )}
                </h2>
                <div className='grid grid-cols-4 flex-grow items-end text-xs font-medium'>
                  <p>
                    <FontAwesomeIcon icon={faFileLines} size='sm' />{" "}
                    {item._reports?.length}{" "}
                    {item._reports?.length === 1 ? "report" : "reports"}
                  </p>
                  <p className='line-clamp-2'>
                    {!!item.locationName && (
                      <>
                        <FontAwesomeIcon icon={faCompass} size='xs' />{" "}
                        {item.locationName}
                      </>
                    )}
                  </p>
                  <p>
                    {item.comments && item.comments?.length > 0 && (
                      <>
                        <FontAwesomeIcon icon={faMessage} size='sm' />{" "}
                        {item.comments?.length}
                      </>
                    )}
                  </p>
                  <p className=''>
                    {" "}
                    <FontAwesomeIcon icon={faUserEdit} size='sm' />{" "}
                    {item.creator && <UserToken id={item.creator._id} />}
                  </p>
                </div>
              </header>
              <div className='hidden lg:block col-span-2 text-xs '>
                <p className='px-2 py-1 bg-slate-50 h-[6em] text-slate-700 overflow-y-auto border border-slate-100 rounded whitespace-pre-line'>
                  {item.notes && item.notes}
                </p>
              </div>
              <footer className='col-span-1 flex justify-end gap-2 '>
                <div className='text-end flex flex-col items-end text-xs'>
                  <p className=''>
                    {item.assignedTo && item.assignedTo.length > 0
                      ? "Assigned To:"
                      : "Not Assigned"}
                  </p>
                  {item.assignedTo &&
                    item.assignedTo.length > 0 &&
                    item.assignedTo.map((user) => <UserToken id={user._id} />)}
                </div>
              </footer>
            </article>
          </button>
        ))}
    </>
  );
};

export default NestedIncidentsList;
