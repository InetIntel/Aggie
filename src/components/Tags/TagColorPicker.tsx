import { Popover } from "@headlessui/react";
import { useState } from "react";
import { HexColorPicker } from "react-colorful";

export default function TagColorPicker({ value, onChange, disabled = false }: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const color = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#7c3aed";
  const [draft, setDraft] = useState(color);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  const rgb = [1, 3, 5].map((index) => parseInt((valid ? draft : color).slice(index, index + 2), 16));
  return (
    <Popover className='relative text-slate-600 dark:text-gray-400'>
      <span className='mb-1 block'>Color</span>
      <div className='flex items-center gap-3'>
        <Popover.Button type='button' disabled={disabled} aria-label='Choose tag color'
          onClick={() => setDraft(color)}
          className='focus-theme h-10 w-16 shrink-0 rounded border border-slate-300 bg-slate-50 p-1 disabled:opacity-60 dark:bg-gray-900'>
          <span className='block h-full w-full rounded-sm' style={{ backgroundColor: color }} />
        </Popover.Button>
        <span className='font-mono text-sm'>{color.toUpperCase()}</span>
      </div>
      <Popover.Panel className='absolute left-0 z-20 mt-2 w-64 max-w-full space-y-3 rounded-lg border border-slate-300 bg-white p-3 shadow-lg dark:bg-gray-800'>
        {({ close }) => <>
          <HexColorPicker color={valid ? draft : color}
            onChange={(next) => { if (!disabled) setDraft(next); }}
            aria-label='Tag color' aria-disabled={disabled}
            style={{ width: "100%", height: 180, pointerEvents: disabled ? "none" : undefined }} />
          <div className='grid grid-cols-3 gap-2'>
            {["R", "G", "B"].map((label, index) => <label key={label} className='text-xs'>{label}
              <input type='number' aria-label={{ R: "Red", G: "Green", B: "Blue" }[label]}
                min={0} max={255} value={rgb[index]} disabled={disabled}
                onChange={(event) => {
                  if (event.target.value === "") return;
                  const next = [...rgb];
                  next[index] = Math.max(0, Math.min(255, Math.round(Number(event.target.value))));
                  if (Number.isFinite(next[index])) setDraft(`#${next.map((n) => n.toString(16).padStart(2, "0")).join("")}`);
                }}
                className='focus-theme mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 dark:bg-gray-900' />
            </label>)}
          </div>
          <label className='block text-sm'>
            Hex color
            <input aria-label="Hex color" value={draft} disabled={disabled} maxLength={7} spellCheck={false}
              onChange={(event) => setDraft(event.target.value)}
              aria-invalid={!valid}
              className='focus-theme mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 font-mono dark:bg-gray-900' />
          </label>
          {!valid && <p className='text-xs text-red-700 dark:text-red-300'>Use a color like #7C3AED.</p>}
          <div className='flex items-center gap-2'>
            <span aria-label='Color preview' className='h-7 w-7 rounded border border-slate-300'
              style={{ backgroundColor: valid ? draft : color }} />
            <button type='button' disabled={!valid || disabled}
              onClick={() => { onChange(draft.toLowerCase()); close(); }}
              className='focus-theme rounded bg-sky-700 px-3 py-1 text-sm text-white disabled:opacity-50'>Save color</button>
            <button type='button' onClick={() => close()}
              className='focus-theme rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-gray-700'>Cancel</button>
          </div>
        </>}
      </Popover.Panel>
    </Popover>
  );
}
