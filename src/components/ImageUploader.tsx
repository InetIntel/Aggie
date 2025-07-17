import React, { useCallback, useEffect, useRef, useState } from 'react';

import { faImage } from "@fortawesome/free-solid-svg-icons";
import { Formik, Field, FieldProps, Form } from "formik";

import AggieButton from "./AggieButton";
import { GroupCommentAttachment, MIME_TYPES } from "../api/groups/types";

export class FilePickerManager {
  private file: File | GroupCommentAttachment | null = null;
  private path: string | null = null;
  private name: string | null = null;
  private listeners: Set<() => void> = new Set();

  setFile(file: File | GroupCommentAttachment) {
    if (file instanceof File) {
      this.file = file;
      if (this.path) URL.revokeObjectURL(this.path);
      this.path = URL.createObjectURL(file);
      this.name = file.name;
      this.notify();
    } else {
      this.file = file;
      if (this.path) URL.revokeObjectURL(this.path);
      this.path = file.path;
      this.name = file.fileName;
      this.notify();
    }
  }

  clear() {
    this.file = null;
    if (this.path) URL.revokeObjectURL(this.path);
    this.path = null;
    this.name = null;
    this.notify();
  }

  getFile(): File | GroupCommentAttachment | null {
    return this.file;
  }

  getPath(): string | null {
    return this.path;
  }

  getName(): string | null {
    return this.name;
  }

  subscribe(callback: () => void) {
    this.listeners.add(callback);
  }

  unsubscribe(callback: () => void) {
    this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }
}

export interface ImageUploadButtonProps {
  manager: FilePickerManager;
  form: FieldProps['form'];
}

export const ImageUploadButton: React.FC<ImageUploadButtonProps> = ({ manager, form }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      manager.setFile(file);
      e.target.value = ''; // Allow re-selecting the same file
      form.setFieldValue('attachments', file); // ensure value gets to Formik
    }
  }, []);

  return (
    <AggieButton
      variant='transparent'
      icon={faImage}
      onClick={() => fileInputRef.current?.click()}
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
      />
    </AggieButton>
  );
};
