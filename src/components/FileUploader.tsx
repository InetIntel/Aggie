import React, { useCallback, useEffect, useRef, useState } from "react";

import { faPaperclip } from "@fortawesome/free-solid-svg-icons";
import { Formik, Field, FieldProps, Form } from "formik";

import AggieButton from "./AggieButton";
import { GroupCommentAttachment, MIME_TYPES } from "../api/groups/types";

export const MAX_ATTACHMENT_COUNT = 3;
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

export class FilePickerManager {
  private files: (File | GroupCommentAttachment)[] = [];
  private paths: string[] = [];
  private names: string[] = [];
  private listeners: Set<() => void> = new Set();

  constructor(fileList?: (File | GroupCommentAttachment)[]) {
    if (fileList && Array.isArray(fileList) && fileList.length > 0) {
      this.setFiles(fileList);
    }
  }

  setFiles(newFiles: (File | GroupCommentAttachment)[]) {
    this.clear();
    this.files = newFiles.slice(0, MAX_ATTACHMENT_COUNT);
    this.paths = this.files.map(f =>
      f instanceof File
      ? URL.createObjectURL(f)
      : f.hasOwnProperty("path")
        ? f.path
        : ""
    );
    this.names = this.files.map(f =>
      f instanceof File
      ? f.name
      : f.hasOwnProperty("fileName")
        ? f.fileName
        : ""
    );
    this.notify();
  }

  removeFileAt(i: number) {
    if (i < 0 || i >= this.files.length) return;
    if (this.files[i] instanceof File && this.paths[i]) {
      URL.revokeObjectURL(this.paths[i]);
    }
    this.files.splice(i, 1);
    this.paths.splice(i, 1);
    this.names.splice(i, 1);
    this.notify();
  }

  clear() {
    this.files = [];
    this.paths.forEach(url => URL.revokeObjectURL(url));
    this.paths = [];
    this.names = [];
    this.notify();
  }

  getFiles() {
    return this.files;
  }
  getPaths() {
    return this.paths;
  }
  getNames() {
    return this.names;
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
  }
  unsubscribe(cb: () => void) {
    this.listeners.delete(cb);
  }
  private notify() {
    this.listeners.forEach(cb => cb());
  }
}


export interface FileUploadButtonProps {
  manager: FilePickerManager;
  form: FieldProps["form"];
}

export const FileUploadButton: React.FC<FileUploadButtonProps> = ({
  manager,
  form
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  const handleClick = () => {
    setError("");
    fileInputRef.current?.click();
  };

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError("");
      const selectedFiles = e.target.files ?? [];
      for (const element of selectedFiles) {
        if (element.size > MAX_ATTACHMENT_SIZE) {
          setError(`file must be less than ${MAX_ATTACHMENT_SIZE / (1024 * 1024)} MiB`);
          return;
        }
      }
      const currentFiles = manager.getFiles();
      if ((selectedFiles.length + currentFiles.length) > MAX_ATTACHMENT_COUNT) {
        setError(`each comment can have maximum ${MAX_ATTACHMENT_COUNT} files`);
        return;
      }
      const combined = [...currentFiles, ...selectedFiles].slice(0, 3); // max 3
      manager.setFiles(combined);
      e.target.value = ""; // Allow re-selecting the same file
      form.setFieldValue("attachments", combined); // ensure value gets to Formik
    },
    [form, manager]
  );

  return (
    <AggieButton
      variant='transparent'
      icon={faPaperclip}
      onClick={handleClick}
      disabled={form.isSubmitting}
      type='button'
    >
      <input
        type='file'
        accept={MIME_TYPES.join(", ")}
        ref={fileInputRef}
        onChange={handleFileChange}
        className='hidden'
        multiple
        tabIndex={-1}
        aria-hidden
      />
      {error && <p className='text-sm text-rose-700 italic ml-2'>{error}</p>}
    </AggieButton>
  );
};
