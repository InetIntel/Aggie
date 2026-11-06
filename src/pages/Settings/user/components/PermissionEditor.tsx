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
  "view team kpis": "View team KPIs",
  "view all kpis": "View platform-wide KPIs",
  "export kpis": "Export KPI reports",
  "manage trends": "Manage trends",
  "view data": "View reports and incidents",
  "edit data": "Edit reports and incidents",
  "change settings": "Change system settings",
  "manage sources": "Manage sources",
  "manage incident access": "Manage incident access",
  "view users": "View users",
  "view other users": "View other user profiles",
  "update users": "Update user profiles",
  "delete users": "Delete users",
  "admin users": "Administer users",
  "change admin password": "Change administrator passwords",
  "edit tags": "Create, edit, and delete tags",
};

const permissionGroups: { label: string; permissions: Permission[] }[] = [
  { label: "KPIs and reporting", permissions: ["view team kpis", "view all kpis", "export kpis", "manage trends"] },
  { label: "Reports and incidents", permissions: ["view data", "edit data", "manage incident access"] },
  { label: "Sources and settings", permissions: ["manage sources", "change settings"] },
  { label: "Tags", permissions: ["edit tags"] },
  { label: "Users and profiles", permissions: ["view users", "view other users", "update users", "delete users"] },
];
const permissionHelp: Partial<Record<Permission, string>> = {
  "view team kpis": "Only teams this user belongs to or leads. Team limits and member denies still apply.",
  "view all kpis": "All teams and platform totals, including activity with no team recorded.",
  "export kpis": "Download KPI reports within this user's view access.",
  "manage trends": "Access platform-wide visualization totals.",
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
      queryClient.invalidateQueries(["session"]);
      queryClient.invalidateQueries(["kpis"]);
    },
  });

  if (isLoading) {
    return <p className='text-sm text-slate-600 dark:text-gray-300'>Loading permissions…</p>;
  }

  if (!data || !data.editable) return null;

  return (
    <div className='border-t border-slate-300 mt-3 pt-3'>
      <h3 className='font-medium text-lg'>Account permission exceptions</h3>
      <p className='text-sm text-slate-600 dark:text-gray-300 mb-3'>
        The {data.role} role supplies the defaults. Use an exception only when
        this user should differ from that role. Team roles and exceptions are managed under Teams → Advanced.
      </p>

      <div className='space-y-4'>
        {permissionGroups.map((group) => <fieldset key={group.label} className='border border-slate-300 dark:border-gray-600 rounded-lg overflow-hidden'>
          <legend className='px-2 ml-2 font-medium'>{group.label}</legend>
          {group.permissions.map((permission) => data.permissions.find((item) => item.permission === permission)).filter((item): item is NonNullable<typeof item> => !!item).map((item) => {
          const selected = overrides[item.permission] || "default";
          const effective = selected === "allow"
            ? true
            : selected === "deny"
              ? false
              : item.roleDefault;

          return (
            <label
              key={item.permission}
              className='grid sm:grid-cols-[1fr_220px] gap-3 items-center px-3 py-3 text-sm border-b border-slate-200 dark:border-gray-700 last:border-b-0'
            >
              <span>
                <span className='font-medium'>{permissionLabels[item.permission]}</span>
                <span className={`ml-2 ${effective ? "text-green-700 dark:text-green-300" : "text-slate-500 dark:text-gray-400"}`}>
                  {selected === "default" ? (effective ? "Account default: allowed" : "No account grant") : effective ? "Allowed" : "Denied"}
                </span>
                {permissionHelp[item.permission] && <span className='block mt-1 text-xs text-slate-600 dark:text-gray-300'>{permissionHelp[item.permission]}</span>}
              </span>
              <select
                className='px-2 py-1 rounded border border-slate-300 dark:bg-gray-700'
                value={selected}
                onChange={(event) => {
                  const choice = event.target.value as PermissionOverride;
                  setOverrides((current) => ({
                    ...current,
                    [item.permission]: choice,
                  }));
                }}
              >
                <option value='default'>Use role default</option>
                <option value='allow'>Always allow</option>
                <option value='deny'>Always deny</option>
              </select>
            </label>
          );
        })}</fieldset>)}
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
