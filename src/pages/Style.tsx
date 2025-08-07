import { useState } from "react";

import AggieButton from "../components/AggieButton";
import AggieCheck from "../components/AggieCheck";
import AggieDialog from "../components/AggieDialog";
import AggieSwitch from "../components/AggieSwitch";
import AggieToken from "../components/AggieToken";

function voidFunc() {return;}
function voidFuncParam(e: any) {return;}

export default function Style() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  return (<>
    <div className='flex flex-wrap'>
      <AggieButton>default AggieButton</AggieButton>
      <AggieButton variant='primary'>primary AggieButton</AggieButton>
      <AggieButton variant='secondary'>secondary AggieButton</AggieButton>
      <AggieButton variant='transparent'>transparent AggieButton</AggieButton>
      <AggieButton variant='danger'>danger AggieButton</AggieButton>
      <AggieButton variant='warning'>warning AggieButton</AggieButton>
    </div>
    <div className='flex flex-wrap'>
      <AggieButton variant='light:green'>light:green AggieButton</AggieButton>
      <AggieButton variant='light:lime'>light:lime AggieButton</AggieButton>
      <AggieButton variant='light:amber'>light:amber AggieButton</AggieButton>
      <AggieButton variant='light:rose'>light:rose AggieButton</AggieButton>
    </div>
    <div className='flex flex-wrap'>
      <AggieCheck onClick={voidFuncParam} active={true} />
      <AggieCheck onClick={voidFuncParam} active={false} />
    </div>
    <div className='flex flex-wrap'>
      <AggieButton onClick={() => setIsDialogOpen(true)}>click to open dialog</AggieButton>
      <AggieDialog isOpen={isDialogOpen} onClose={voidFunc} data={{title: "data.title", description: "data.description"}}>
        <AggieButton onClick={() => setIsDialogOpen(false)}>close</AggieButton>
      </AggieDialog>
    </div>
    <div className='flex flex-wrap'>
      <AggieSwitch checked={true} onChange={voidFunc}/>
      <AggieSwitch checked={false} onChange={voidFunc}/>
    </div>
    <div className='flex flex-wrap'>
      <AggieToken>default AggieToken</AggieToken>
      <AggieToken variant='light:red'>light:red AggieToken</AggieToken>
      <AggieToken variant='dark:red'>dark:red AggieToken</AggieToken>
      <AggieToken variant='light:amber'>light:amber AggieToken</AggieToken>
      <AggieToken variant='light:green'>light:green AggieToken</AggieToken>
    </div>
  </>);
}
