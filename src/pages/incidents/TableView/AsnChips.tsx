interface IProps {
  asns?: string[];
  max?: number;
}

const AsnChips = ({ asns, max = 6 }: IProps) => {
  if (!asns || asns.length === 0) {
    return <span className='text-slate-500 dark:text-gray-400'>—</span>;
  }

  const visible = asns.slice(0, max);
  const overflow = asns.length - visible.length;

  return (
    <div className='grid grid-cols-2 gap-x-1 gap-y-1 w-fit justify-items-start'>
      {visible.map((asn) => (
        <span
          key={asn}
          className='inline-block bg-teal-50 text-teal-900 border border-teal-700 text-[13px] font-medium px-2 py-0.5 rounded-sm dark:bg-teal-100 dark:saturate-[0.7]'
        >
          {asn}
        </span>
      ))}
      {overflow > 0 && (
        <span className='inline-block bg-slate-100 text-slate-700 border border-slate-300 text-[13px] font-medium px-2 py-0.5 rounded-sm dark:bg-gray-700 dark:text-gray-300'>
          +{overflow}
        </span>
      )}
    </div>
  );
};

export default AsnChips;
