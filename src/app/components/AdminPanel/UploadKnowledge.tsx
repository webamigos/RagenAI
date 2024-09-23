'use client';

import { useState, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Card } from '@salesyy/common-ui/Card';
import { UploadInboxIcon, XMarkIcon } from '@salesyy/common-ui/icons';

export const UploadKnowledge = () => {
  const [files, setFiles] = useState<File[]>([]);
  const { isOver, setNodeRef } = useDroppable({
    id: 'droppable',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFiles = Array.from(event.dataTransfer.files).filter((file) =>
      file.name.endsWith('.md')
    ) as File[];
    setFiles((prevFiles) => [...prevFiles, ...droppedFiles]);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []).filter((file) =>
      file.name.endsWith('.md')
    );
    setFiles((prevFiles) => [...prevFiles, ...selectedFiles]);
  };

  const handleFileRemove = (index: number) => {
    setFiles((prevFiles) => {
      const newFiles = [...prevFiles];
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card size="full">
      <div
        className="mb-5 p-5 text-center border-2 border-dashed rounded-md"
        ref={setNodeRef}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="flex justify-center items-center cursor-pointer">
          <p className="mr-2">Przeciągnij i upuść pliki tutaj</p>
          <UploadInboxIcon />
        </div>
        <p>lub</p>
        <p className="text-blue-600 cursor-pointer" onClick={handleClick}>
          Wybierz pliki
        </p>
        <input
          ref={fileInputRef}
          style={{ display: 'none' }}
          type="file"
          accept=".md"
          multiple
          onChange={handleFileSelect}
        />
      </div>
      {files.length > 0 && (
        <div>
          <h3>Wybrane pliki:</h3>
          <ul>
            {files.map((file, index) => (
              <li key={index}>
                <div className="flex">
                  <span className="mr-2">•</span>
                  <span>{file.name}</span>
                  <button
                    onClick={() => handleFileRemove(index)}
                    className="ml-auto"
                    aria-label={`Usuń plik ${file.name}`}
                  >
                    <XMarkIcon />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};
