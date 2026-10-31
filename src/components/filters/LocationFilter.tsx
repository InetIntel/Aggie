import { useState } from "react";
import FilterDropdown from "./FilterDropdown";

export interface LocationOption { key: string; label: string }
interface Props {
  label: string;
  options: LocationOption[];
  value: string[];
  onChange: (value: string[]) => void;
  loading: boolean;
  error: boolean;
}
export default function LocationFilter({ label, options, value, onChange, loading, error }: Props) {
  const [search, setSearch] = useState("");
  const allOptions = [...options, ...value.filter(key => !options.some(o => o.key === key)).map(key => ({ key, label: key }))];
  const visible = allOptions.filter(o => `${o.key} ${o.label}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <FilterDropdown label={value.length ? `${label} (${value.length})` : label} persistLabel value={value.length ? `${value.length} selected` : undefined}
    onReset={() => onChange([])} onOpenChange={() => setSearch("")} panelClassName="w-80"
    headerChild={<input aria-label={`Search ${label}`} placeholder={`Search ${label.toLowerCase()}…`}
      className="focus-theme border rounded px-2 py-1 w-full" value={search} onChange={e => setSearch(e.target.value)} />}>
    {() => <div className="max-h-72 overflow-y-auto p-2">
      {value.length > 0 && <div className="flex flex-wrap gap-1 mb-2">{value.map(key => <button key={key}
        className="border rounded px-2 py-1 text-xs" aria-label={`Remove ${allOptions.find(o => o.key === key)?.label}`}
        onClick={() => onChange(value.filter(v => v !== key))}>{allOptions.find(o => o.key === key)?.label} ×</button>)}</div>}
      {loading ? <p>Loading options…</p> : error ? <p>Unable to load options.</p> : visible.length === 0 ? <p>No matching options.</p> :
        visible.map(option => <label key={option.key} className="flex items-center gap-2 py-1 cursor-pointer">
          <input type="checkbox" checked={value.includes(option.key)} onChange={() => onChange(value.includes(option.key)
            ? value.filter(v => v !== option.key) : [...value, option.key])} />
          <span>{option.label}</span>
        </label>)}
    </div>}
  </FilterDropdown>;
}
