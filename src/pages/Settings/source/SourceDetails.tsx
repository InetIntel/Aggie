import { useParams } from "react-router-dom";

import SourceDetailsView from "./SourceDetailsView";

// Standalone source-details page (direct URL). The content lives in
// SourceDetailsView so it can also be shown in a popup from the sources list.
const SourceDetails = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className=''>
      <SourceDetailsView id={id} />
    </div>
  );
};

export default SourceDetails;
