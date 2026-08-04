import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getUserPermissions,
  updateUserPermissions,
} from "../../../../api/permissions";
import type { Permission } from "../../../../api/session/types";
import type { PermissionOverride } from "../../../../api/permissions/types";
import AggieButton from "../../../../components/AggieButton";

const permissionLabels: Record<Permission, string> = {
  "manage trends": "Manage trends",
  "view data": "View reports and incidents",
  "edit data": "Edit reports and incidents",
  "change settings": "Change system settings",
  "manage sources": "Manage sources",
  "view users": "View users",
  "view other users": "View other user profiles",
  "update users": "Update user profiles",
  "delete users": "Delete users",
  "admin users": "Administer users",
  "change admin password": "Change administrator passwords",
  "edit tags": "Create, edit, and delete tags",
};

interface IProps {
  userId: string;
}

const PermissionEditor = ({ userId }: IProps) => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    ["permissions", userId],
    () => getUserPermissions(userId)
  );
  const [overrides, setOverrides] = useState<Record<string, PermissionOverride>>({});

  useEffect(() => {
    if (!data) return;
    setOverrides(
      Object.fromEntries(
        data.permissions.map((item) => [item.permission, item.override])
      )
    );
  }, [data]);

  const doSave = useMutation(updateUserPermissions, {
    onSuccess: (updated) => {
      queryClient.setQueryData(["permissions", userId], updated);
      queryClient.invalidateQueries(["users", userId]);
    },
  });

  if (isLoading) {
    return <p className='text-sm text-slate-600 dark:text-gray-300'>Loading permissions…</p>;
  }

  if (!data || !data.editable) return null;

  return (
    <div className='border-t border-slate-300 mt-3 pt-3'>
      <h3 className='font-medium text-lg'>Permissions</h3>
      <p className='text-sm text-slate-600 dark:text-gray-300 mb-3'>
        The {data.role} role supplies the defaults. Use an exception only when
        this user should differ from that role.
      </p>

      <div className='divide-y divide-slate-200 border border-slate-300 rounded'>
        {data.permissions.map((item) => {
          const selected = overrides[item.permission] || "default";
          const effective = selected === "allow"
            ? true
            : selected === "deny"
              ? false
              : item.roleDefault;

          return (
            <label
              key={item.permission}
              className='grid grid-cols-[1fr_220px] gap-3 items-center px-3 py-2 text-sm'
            >
              <span>
                <span className='font-medium'>{permissionLabels[item.permission]}</span>
                <span className={`ml-2 ${effective ? "text-green-700" : "text-slate-500"}`}>
                  {effective ? "Allowed" : "Not allowed"}
                </span>
              </span>
              <select
                className='px-2 py-1 rounded border border-slate-300 dark:bg-gray-700'
                value={selected}
                onChange={(event) =>
                  setOverrides((current) => ({
                    ...current,
                    [item.permission]: event.target.value as PermissionOverride,
                  }))
                }
              >
                <option value='default'>Use role default</option>
                <option value='allow'>Always allow</option>
                <option value='deny'>Always deny</option>
              </select>
            </label>
          );
        })}
      </div>

      <div className='mt-3'>
        <AggieButton
          variant='primary'
          disabled={doSave.isLoading}
          loading={doSave.isLoading}
          onClick={() => {
            const allow = Object.entries(overrides)
              .filter(([, value]) => value === "allow")
              .map(([permission]) => permission as Permission);
            const deny = Object.entries(overrides)
              .filter(([, value]) => value === "deny")
              .map(([permission]) => permission as Permission);

            doSave.mutate({ userId, allow, deny });
          }}
        >
          Save Permissions
        </AggieButton>
      </div>
    </div>
  );
};

export default PermissionEditor;
