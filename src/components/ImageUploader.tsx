import React, { useCallback, useEffect, useRef, useState } from 'react';

import { faImage } from "@fortawesome/free-solid-svg-icons";
import { Formik, Field, FieldProps, Form } from "formik";

import AggieButton from "./AggieButton";

export class FilePickerManager {
  private file: File | null = null;
  private previewUrl: string | null = null;
  private listeners: Set<() => void> = new Set();

  setFile(file: File) {
    this.file = file;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(file);
    this.notify();
  }

  clear() {
    this.file = null;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    this.notify();
  }

  getFile(): File | null {
    return this.file;
  }

  getPreviewUrl(): string | null {
    return this.previewUrl;
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
      form.setFieldValue('image', file); // ensure value gets to Formik
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
        accept='application/pdf, image/jpeg, image/png'
        ref={fileInputRef}
        onChange={handleFileChange}
        className='hidden'
      />
    </AggieButton>
  );
};

export const ImagePreview: React.FC<{ manager: FilePickerManager }> = ({ manager }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(manager.getPreviewUrl());

  useEffect(() => {
    const handleUpdate = () => setPreviewUrl(manager.getPreviewUrl());
    manager.subscribe(handleUpdate);
    return () => manager.unsubscribe(handleUpdate);
  }, [manager]);

  if (!previewUrl) return null;
  return (
    <img
      src={previewUrl}
      alt={previewUrl}
      height='200'
      width='200'
    />
  );
};

export const NamePreview: React.FC<{ manager: FilePickerManager }> = ({ manager }) => {
  const [previewName, setPreviewName] = useState(manager.getFile()?.name);

  useEffect(() => {
    const handleUpdate = () => setPreviewName(manager.getFile()?.name);
    manager.subscribe(handleUpdate);
    return () => manager.unsubscribe(handleUpdate);
  }, [manager]);

  if (!previewName) return null;
  return <p>{previewName}</p>
};
