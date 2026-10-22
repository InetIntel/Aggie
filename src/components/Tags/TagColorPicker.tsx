export default function TagColorPicker({ value, onChange, disabled = false }: {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  const color = /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#7c3aed";
  return (
    <label className='flex flex-col gap-1 text-slate-600 dark:text-gray-400'>
      <span>Color</span>
      <span className='flex items-center gap-3'>
        <input
          type='color'
          value={color}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className='focus-theme h-10 w-16 shrink-0 cursor-pointer rounded border border-slate-300 bg-slate-50 p-1 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-900'
        />
        <span className='font-mono text-sm'>{color.toUpperCase()}</span>
      </span>
    </label>
  );
}
