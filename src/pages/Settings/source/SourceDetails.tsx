import { useParams } from "react-router-dom";

import SourceDetailsView from "./SourceDetailsView";

const SourceDetails = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className=''>
      <SourceDetailsView id={id} />
    </div>
  );
};

export default SourceDetails;
