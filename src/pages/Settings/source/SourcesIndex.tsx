import SourcesSection from "./SourcesSection";

// Standalone Sources page. The list/create logic lives in SourcesSection so it
// can be reused inside the consolidated Connections page.
const SourcesIndex = () => (
  <div className='mt-3'>
    <SourcesSection />
  </div>
);

export default SourcesIndex;
