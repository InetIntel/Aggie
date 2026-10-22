import { Tag, tagColor, tagLabel } from "../../api/tags/types";

export default function TagBadge({ tag }: { tag: Tag }) {
  const color = tagColor(tag);
  return <span className='inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 font-medium text-slate-800 dark:bg-gray-700 dark:text-gray-100 whitespace-nowrap'
    style={{ border: `1px solid ${color}` }}>
    <span aria-hidden='true' className='inline-block h-2.5 w-2.5 shrink-0 rounded-full' style={{ backgroundColor: color }} />
    {tagLabel(tag)}
  </span>;
}
