import { useState } from "react";
import AggieButton from "../../../../components/AggieButton";
import { formatDate, shortenString } from "../../../../utils/format";
import type { WebAuthnDevice } from "../../../../api/session/types";

type Props = {
  device: WebAuthnDevice;
  onRename: (id: string, label: string) => void; 
  onDelete: (id: string) => void;                 
  renaming?: boolean;                             
  deleting?: boolean;
};

export default function WebAuthnDeviceRow({
  device,
  onRename,
  onDelete,
  renaming,
  deleting,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(device.label || "");

  const canSave = value.trim().length > 0 && value.trim() !== (device.label || "");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start sm:items-center py-2 px-3 sm:px-4 border-t border-slate-200 dark:border-gray-700">

      <div className="col-span-12 sm:col-span-5 truncate">
        {editing ? (
          <input
            className="px-2 py-1 rounded border w-full dark:bg-gray-800"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={50}
            placeholder="Device name"
          />
        ) : (
          <div className="font-medium truncate" title={device.label || "(unnamed device)"}>
            {device.label || "(unnamed device)"}
          </div>
        )}
      </div>
  
      <div className="col-span-12 sm:col-span-4 text-sm text-slate-500 sm:text-right mt-1 sm:mt-0 space-y-0.5 tabular-nums">
        <div>Added: {formatDate(device.createdAt)}</div>
        <div>Last used: {formatDate(device.lastUsedAt)}</div>
      </div>
  
      <div className="col-span-12 sm:col-span-3 flex justify-start sm:justify-end gap-2 mt-2 sm:mt-0">
        {editing ? (
          <>
            <AggieButton
              variant="primary"
              className='min-w-[60px] justify-center rounded-small hover:bg-slate-100 dark:hover:bg-gray-700 text-sm'
              onClick={() => { onRename(device.credentialID, value.trim()); setEditing(false); }}
              loading={renaming}
              disabled={!canSave}
            >
              Save
            </AggieButton>
            <AggieButton
              variant="secondary"
              className='min-w-[60px] justify-center rounded-small hover:bg-slate-100 dark:hover:bg-gray-700 text-sm'
              onClick={() => { setEditing(false); setValue(device.label || ""); }}
            >
              Cancel
            </AggieButton>
          </>
        ) : (
          <AggieButton 
            variant="secondary" 
            className='min-w-[60px] justify-center rounded-small hover:bg-slate-100 dark:hover:bg-gray-700 text-sm'
            onClick={() => setEditing(true)}
          >
            Rename
          </AggieButton>
        )}
        <AggieButton
          variant="danger"
          className='min-w-[60px] justify-center rounded-small hover:bg-slate-100 dark:hover:bg-gray-700 text-sm'
          onClick={() => {
            if (confirm("Remove this authenticator? You may lose access if this is your only device.")) {
              onDelete(device.credentialID);
            }
          }}
          loading={deleting}
        >
          Remove
        </AggieButton>
      </div>
    </div>
  );
}