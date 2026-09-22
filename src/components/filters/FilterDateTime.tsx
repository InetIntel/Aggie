import { FloatingTree } from "@floating-ui/react";
import { useEffect, useState, type CSSProperties } from "react";
import { DayPicker, getDefaultClassNames, TZDate } from "react-day-picker";
import AggieButton from "../AggieButton";
import FilterDropdown from "./FilterDropdown";
import { useFormatters } from "../../utils/useFormatters";

interface IProps {
  before: string;
  onSetBefore: (item: string) => void;
  after: string;
  onSetAfter: (item: string) => void;
  label?: string;
}

function withTime(day: Date, previous: string, timeZone: string) {
  const next = new TZDate(day, timeZone);
  const time = previous ? new TZDate(previous, timeZone) : undefined;
  next.setHours(time?.getHours() ?? 0, time?.getMinutes() ?? 0, 0, 0);
  return new Date(next.getTime()).toISOString();
}

function timeValue(value: string, timeZone: string) {
  if (!value) return "";
  const date = new TZDate(value, timeZone);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const FilterDateTime = ({ before, onSetBefore, after, onSetAfter, label = "Date Range" }: IProps) => {
  const [beforeDate, setBefore] = useState(before || "");
  const [afterDate, setAfter] = useState(after || "");
  const [choosingEnd, setChoosingEnd] = useState(false);
  const [localZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [timeZone, setTimeZone] = useState(localZone);
  const [zoneSearch, setZoneSearch] = useState("");
  const [showZoneSearch, setShowZoneSearch] = useState(false);
  const [timeError, setTimeError] = useState("");
  const [zones] = useState(() => Array.from(new Set([
    localZone, "UTC", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
    "Europe/London", "Europe/Paris", "Asia/Shanghai", "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney"
  ])));
  const { formatDate } = useFormatters();
  const zoneQuery = zoneSearch.trim().toLowerCase();
  const matchingZones = zones.filter((zone) => {
    const name = zone.replace(/_/g, " ").toLowerCase();
    return !zoneQuery || name.startsWith(zoneQuery) || name.split(/[ /]+/).some((part) => part.startsWith(zoneQuery))
      || name.split("/").some((part) => part.startsWith(zoneQuery));
  });
  const classes = getDefaultClassNames();
  const invalid = !!(afterDate && beforeDate && new Date(afterDate) > new Date(beforeDate));
  const zoneLabel = (value?: string) => new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: "short" })
    .formatToParts(value ? new Date(value) : new Date()).find((part) => part.type === "timeZoneName")?.value;

  useEffect(() => {
    setBefore(before || "");
    setAfter(after || "");
    setChoosingEnd(false);
  }, [before, after]);

  function selectDay(day: Date) {
    setTimeError("");
    const start = afterDate ? new TZDate(afterDate, timeZone) : undefined;
    start?.setHours(0, 0, 0, 0);
    if (!choosingEnd || !start || day < start) {
      setAfter(withTime(day, afterDate, timeZone));
      setBefore("");
      setChoosingEnd(true);
    } else {
      setBefore(withTime(day, before || "", timeZone));
      setChoosingEnd(false);
    }
  }

  function changeTime(value: string, current: string, set: (value: string) => void) {
    if (!value || !current) return;
    const [hours, minutes] = value.split(":").map(Number);
    const date = new TZDate(current, timeZone);
    date.setHours(hours, minutes, 0, 0);
    if (date.getHours() !== hours || date.getMinutes() !== minutes) {
      setTimeError("This time does not exist because of a daylight-saving change. Choose another time.");
      return;
    }
    setTimeError("");
    set(new Date(date.getTime()).toISOString());
  }

  const rangeLabel = after && before ? `${formatDate(after)} - ${formatDate(before)}`
    : after ? `After ${formatDate(after)}` : before ? `Before ${formatDate(before)}` : "";

  return (
    <FloatingTree>
      <FilterDropdown
        label={label}
        persistLabel
        value={rangeLabel}
        panelClassName='w-max max-w-[calc(100vw-2rem)]'
        onReset={() => {
          setAfter(""); setBefore(""); setChoosingEnd(false); setTimeError("");
          onSetAfter(""); onSetBefore("");
        }}
        onOpenChange={(open) => {
          if (open) {
            setAfter(after || ""); setBefore(before || ""); setChoosingEnd(false); setTimeError(""); setZoneSearch(""); setShowZoneSearch(false);
          }
        }}
      >
        {({ close }) => (
          <div className='max-h-[70vh] overflow-auto p-4 text-sm bg-white text-slate-900 dark:bg-gray-800 dark:text-gray-100'>
            <div className='flex items-center gap-3 mb-3 text-base font-semibold' aria-live='polite'>
              <span className={`flex-1 pb-2 border-b-2 ${!choosingEnd ? "border-blue-600" : "border-transparent"}`}>
                {afterDate ? new Date(afterDate).toLocaleDateString(undefined, { timeZone, weekday: "short", month: "short", day: "numeric" }) : "Start date"}
              </span>
              <span aria-hidden='true'>→</span>
              <span className={`flex-1 pb-2 border-b-2 ${choosingEnd ? "border-blue-600" : "border-transparent"}`}>
                {beforeDate ? new Date(beforeDate).toLocaleDateString(undefined, { timeZone, weekday: "short", month: "short", day: "numeric" }) : "End date"}
              </span>
            </div>
            <p className='text-xs text-slate-600 dark:text-gray-300 mb-2' aria-live='polite'>
              {choosingEnd ? "Select an end date" : "Select a start date, then an end date"}
            </p>
            <DayPicker
              mode='range'
              captionLayout='dropdown'
              navLayout='around'
              timeZone={timeZone}
              numberOfMonths={1}
              selected={afterDate ? { from: new TZDate(afterDate, timeZone), to: beforeDate ? new TZDate(beforeDate, timeZone) : undefined } : undefined}
              onDayClick={(day, modifiers) => { if (!modifiers.disabled) selectDay(day); }}
              defaultMonth={new TZDate(new Date(), timeZone)}
              disabled={{ after: new TZDate(new Date(), timeZone) }}
              endMonth={new TZDate(new Date(), timeZone)}
              style={{
                "--rdp-accent-color": "#2563eb",
                "--rdp-accent-background-color": "#eff6ff",
                "--rdp-range_middle-color": "#172554",
                "--rdp-selected-border": "2px solid transparent",
              } as CSSProperties}
              classNames={{
                root: `${classes.root} relative text-center bg-white dark:bg-gray-800 rounded p-2`,
                caption_label: `${classes.caption_label} text-sm font-semibold gap-1`,
                month_caption: `${classes.month_caption} justify-center`,
                chevron: `${classes.chevron} fill-blue-600`,
                today: "font-bold underline",
                selected: `${classes.selected} font-semibold`,
                range_start: classes.range_start,
                range_end: classes.range_end,
                range_middle: classes.range_middle,
                button_previous: `${classes.button_previous} rounded-full shadow-sm bg-white dark:bg-gray-700`,
                button_next: `${classes.button_next} rounded-full shadow-sm bg-white dark:bg-gray-700`,
              }}
            />
            <div className='block border-t border-slate-200 mt-2 pt-3 text-xs text-slate-600 dark:text-gray-300'>
              <div className='flex items-center justify-between max-w-[308px]'>
                <span>Time zone {timeZone === localZone ? "(browser default)" : ""}</span>
                <button type='button' aria-label={showZoneSearch ? "Hide time zone search" : "Show time zone search"}
                  aria-expanded={showZoneSearch} aria-controls='outage-zone-search'
                  className='p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700 focus-theme'
                  onClick={() => { setShowZoneSearch(!showZoneSearch); setZoneSearch(""); }}>
                  <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' aria-hidden='true'>
                    <circle cx='10.5' cy='10.5' r='6.5' /><path d='m16 16 5 5' />
                  </svg>
                </button>
              </div>
              {showZoneSearch && <input id='outage-zone-search' type='search' aria-label='Search time zones' autoComplete='off' autoFocus
                placeholder='Search city or region (e.g. Sh, Lo, UTC)'
                value={zoneSearch} onChange={(event) => setZoneSearch(event.target.value)}
                className='block w-full max-w-[308px] mt-1 p-2 rounded border border-slate-300 bg-white dark:bg-gray-700' />}
              <select aria-label='Time zone' value={timeZone} onChange={(event) => { setTimeZone(event.target.value); setTimeError(""); }}
                className='block w-full max-w-[308px] mt-1 p-2 rounded border border-slate-300 bg-white dark:bg-gray-700'>
                {!matchingZones.includes(timeZone) && <option value={timeZone}>{timeZone.replace(/_/g, " ")} — Current</option>}
                {matchingZones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}{zone === localZone ? " — Local" : ""}</option>)}
              </select>
              {zoneQuery && <span className='block mt-1' role='status'>{matchingZones.length ? `${matchingZones.length} matching time zones` : "No matching time zones. Try another city or region."}</span>}
            </div>
            <div className='grid grid-cols-2 gap-3 mt-2 pt-1'>
              {([{ label: "Start", value: afterDate, set: setAfter }, { label: "End", value: beforeDate, set: setBefore }]).map((field) => (
                <label key={field.label} className='text-xs text-slate-600 dark:text-gray-300'>
                  <span className='block font-medium'>{field.label}</span>
                  <span className='block my-1'>{field.value ? new Date(field.value).toLocaleDateString(undefined, { timeZone }) : "Not selected"}</span>
                  Time ({zoneLabel(field.value)})
                  <input type='time' aria-label={`${field.label} time`} value={timeValue(field.value, timeZone)}
                    disabled={!field.value} onChange={(event) => changeTime(event.target.value, field.value, field.set)}
                    className='block w-full mt-1 px-2 py-1 bg-white dark:bg-gray-700 border border-slate-300 rounded disabled:opacity-50' />
                </label>
              ))}
            </div>
            {invalid && <p role='alert' className='text-xs text-red-700 mt-2'>End time must be at or after start time.</p>}
            {timeError && <p role='alert' className='text-xs text-red-700 mt-2'>{timeError}</p>}
            <div className='flex justify-end gap-2 mt-3'>
              <AggieButton type='button' variant='secondary' padding='px-2 py-1' onClick={close}>Cancel</AggieButton>
              <AggieButton type='button' padding='px-4 py-1.5' className='rounded-full bg-blue-600 text-white hover:bg-blue-700' disabled={invalid || !!timeError || !afterDate || !beforeDate}
                onClick={() => { onSetBefore(beforeDate); onSetAfter(afterDate); close(); }}>Done</AggieButton>
            </div>
          </div>
        )}
      </FilterDropdown>
    </FloatingTree>
  );
};

export default FilterDateTime;
