import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import AggieButton from "../../../../components/AggieButton";
import { updateUserPreferences } from "../../../../api/users";
import type { User } from "../../../../api/users/types";
import type { UserPreferences } from "../../../../api/session/types";
import { DEFAULT_PREFS, formatDateTime } from "../../../../utils/dateFormat";

interface IProps {
  user: User | undefined;
}

type Option<T extends string> = { value: T; label: string };

function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-4 py-1 items-center">
      <p className="col-span-1">{legend}</p>
      <div className="col-span-3 inline-flex rounded-lg border border-slate-300 dark:border-gray-600 overflow-hidden w-fit">
        {options.map((opt, i) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-3 py-1 text-sm ${
                i > 0 ? "border-l border-slate-300 dark:border-gray-600" : ""
              } ${
                selected
                  ? "bg-green-700 text-white dark:saturate-[0.7]"
                  : "bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-900"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const DisplayPreferencesSection = ({ user }: IProps) => {
  const queryClient = useQueryClient();
  const saved: UserPreferences = user?.preferences ?? DEFAULT_PREFS;

  const [prefs, setPrefs] = useState<UserPreferences>(saved);

  // Re-sync when the user record loads/changes.
  useEffect(() => {
    setPrefs(user?.preferences ?? DEFAULT_PREFS);
  }, [user?.preferences]);

  const doUpdate = useMutation(updateUserPreferences, {
    onSuccess: () => {
      // Refetch the session so every date/time in the app re-renders with the
      // new preference, plus this user's record.
      queryClient.invalidateQueries(["session"]);
      if (user?._id) queryClient.invalidateQueries(["users", user._id]);
    },
  });

  const dirty =
    prefs.timeFormat !== saved.timeFormat ||
    prefs.dateFormat !== saved.dateFormat ||
    prefs.timeZone !== saved.timeZone;

  const example = formatDateTime(new Date(Date.UTC(2026, 6, 20, 15, 45)), prefs);

  return (
    <div className="border-t border-slate-300 mt-3 pt-3">
      <h3 className="font-medium text-lg mb-2">Display preferences</h3>

      <Segmented
        legend="Clock"
        value={prefs.timeFormat}
        onChange={(timeFormat) => setPrefs((p) => ({ ...p, timeFormat }))}
        options={[
          { value: "12h", label: "12-hour" },
          { value: "24h", label: "24-hour" },
        ]}
      />
      <Segmented
        legend="Date format"
        value={prefs.dateFormat}
        onChange={(dateFormat) => setPrefs((p) => ({ ...p, dateFormat }))}
        options={[
          { value: "MDY", label: "MM/DD/YYYY" },
          { value: "DMY", label: "DD/MM/YYYY" },
        ]}
      />
      <Segmented
        legend="Time zone"
        value={prefs.timeZone}
        onChange={(timeZone) => setPrefs((p) => ({ ...p, timeZone }))}
        options={[
          { value: "local", label: "Local" },
          { value: "utc", label: "UTC" },
        ]}
      />

      <div className="grid grid-cols-4 py-1 items-center text-sm text-slate-600 dark:text-gray-400">
        <p className="col-span-1">Example</p>
        <p className="col-span-3 tabular-nums">{example}</p>
      </div>

      <div className="mt-3">
        <AggieButton
          variant="primary"
          disabled={!dirty || doUpdate.isLoading}
          loading={doUpdate.isLoading}
          onClick={() =>
            user?._id && doUpdate.mutate({ _id: user._id, preferences: prefs })
          }
        >
          Save Preferences
        </AggieButton>
      </div>
    </div>
  );
};

export default DisplayPreferencesSection;
