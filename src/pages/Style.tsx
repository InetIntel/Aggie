import { useEffect, useState } from "react";

import { Group } from "../api/groups/types";

import AggieButton from "../components/AggieButton";
import AggieCheck from "../components/AggieCheck";
import AggieDialog from "../components/AggieDialog";
import AggieSwitch from "../components/AggieSwitch";
import AggieToken from "../components/AggieToken";
import { IncidentStatuses } from "./incidents/IncidentStatuses";

const baseGroup = {"tags":[],"smtcTags":[],"status":"","escalated":false,"closed":false,"public":false,"reportsLength":0,"commentsLength":0,"_reports":[],"_id":"","title":"","locationName":"","incidentStartedAt":new Date("1970-01-01T00:00:00.000Z"),"incidentEndedAt":new Date("1970-01-01T00:00:00.000Z"),"creator":{"_id":"","username":""},"storedAt":"","updatedAt":"","idnum":0,"__v":0};

function voidFunc() {return;}
function voidFuncParam(e: any) {return;}

export default function Style() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const groupFalse = Object.assign({"verification_status":"false","confirmation_status":"false","publication_status":["Not Published"]}, baseGroup) as Group;
  const groupMaybe = Object.assign({"verification_status":"maybe","confirmation_status":"maybe","publication_status":["Shared with Networks"]}, baseGroup) as Group;
  const groupTrue = Object.assign({"verification_status":"true","confirmation_status":"true","publication_status":["Published"]}, baseGroup) as Group;
  useEffect(() => {document.title = "Style - Aggie"}, []);
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
    <IncidentStatuses group={groupFalse} className='px-2 py-1 rounded-full'/>
    <IncidentStatuses group={groupMaybe} className='px-2 py-1 rounded-full'/>
    <IncidentStatuses group={groupTrue} className='px-2 py-1 rounded-full'/>
  </>);
}
