'use client';

import { useRef, useState, DragEvent, ChangeEvent } from 'react';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isLoading: boolean;
}

export default function FileUpload({ onFilesSelected, isLoading }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const harFiles = Array.from(files).filter((f) => f.name.endsWith('.har') || f.type === 'application/json');
    if (harFiles.length > 0) {
      onFilesSelected(harFiles);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => !isLoading && inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
        dragging
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30 scale-[1.01]'
          : 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800'
      } ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".har,application/json"
        multiple
        className="hidden"
        onChange={onChange}
        disabled={isLoading}
      />
      <div className="flex flex-col items-center gap-3">
        <svg className="w-12 h-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {isLoading ? (
          <p className="text-slate-600 dark:text-slate-300 font-medium">Processing files...</p>
        ) : (
          <>
            <p className="text-slate-700 dark:text-slate-200 font-semibold text-lg">Drop HAR files here</p>
            <p className="text-slate-600 dark:text-slate-500 dark:text-slate-400 text-sm">or click to browse — multiple files supported</p>
          </>
        )}
      </div>
    </div>
  );
}
