import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { newSpecialTag } from "../../api/tags";
import { Tag } from "../../api/tags/types";
import AggieButton from "../AggieButton";
import TagColorPicker from "./TagColorPicker";

export default function SpecialTagForm({ onCreated, onCancel }: {
  onCreated: (tag: Tag) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7c3aed");
  const queryClient = useQueryClient();
  const create = useMutation(newSpecialTag, {
    onSuccess: (tag) => {
      queryClient.setQueryData<Tag[]>(["tags"], (current) =>
        [...(current || []).filter((item) => item._id !== tag._id), tag]);
      queryClient.invalidateQueries(["tags"]);
      onCreated(tag);
    },
  });
  return (
    <div className='space-y-3 rounded border border-slate-300 p-3'>
      <p className='text-sm'>Create a custom tag that everyone can use.</p>
      <label className='block'>
        Tag name
        <input value={name} maxLength={80} disabled={create.isLoading}
          onChange={(event) => setName(event.target.value)}
          className='focus-theme mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 dark:bg-gray-800' />
      </label>
      <TagColorPicker value={color} disabled={create.isLoading} onChange={setColor} />
      <p className='text-sm'>Preview: <span style={{ borderBottom: `3px solid ${color}` }}>✦ {name.trim() || "Tag name"} ✦</span></p>
      {create.isError && <p role='alert' className='text-sm text-red-700 dark:text-red-300'>
        {(create.error as AxiosError)?.response?.status === 422
          ? "A tag with this name already exists. Choose it from the list or use another name."
          : "The custom tag could not be created. Please try again."}
      </p>}
      <div className='flex gap-2'>
        <AggieButton type='button' variant='primary' disabled={!name.trim() || create.isLoading}
          loading={create.isLoading} onClick={() => create.mutate({ name: name.trim(), color })}>Create custom tag</AggieButton>
        <AggieButton type='button' variant='secondary' disabled={create.isLoading} onClick={onCancel}>Cancel</AggieButton>
      </div>
    </div>
  );
}
