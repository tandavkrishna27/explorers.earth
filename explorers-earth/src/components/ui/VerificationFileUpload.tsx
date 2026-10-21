import React, { useRef, useState } from "react";
import { formatFileSize } from "../../utils/fileValidation";
import { keyboardActivation } from "../../utils/keyboardActivation";

interface VerificationFileUploadProps {
  label: string;
  placeholder?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  disabled?: boolean;
}

const VerificationFileUpload: React.FC<VerificationFileUploadProps> = ({
  label,
  placeholder = "Click to upload or drag and drop",
  value,
  onChange,
  error,
  disabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
  ];

  const maxSize = 5 * 1024 * 1024; // 5MB

  const validateFile = (file: File): string | null => {
    if (!allowedTypes.includes(file.type)) {
      return "Only PDF, DOC, DOCX, JPG, PNG files are allowed";
    }
    if (file.size > maxSize) {
      return `File size must be less than ${formatFileSize(maxSize)}`;
    }
    return null;
  };

  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) {
      // You might want to show a toast here
      console.error(error);
      return;
    }
    onChange(file);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    
    if (disabled) return;
    
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const removeFile = () => {
    onChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="block text-xs sm:text-sm font-poppins text-dashboard-light font-semibold mb-1">
        {label}
      </label>
      
      <div
        className={`
          relative border-2 border-dashed rounded-lg p-4 sm:p-6 text-center cursor-pointer transition-colors
          ${isDragOver ? "border-dashboard-accent bg-dashboard-muted" : "border-dashboard hover:border-dashboard-accent"}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${error ? "border-dashboard-danger" : ""}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        {...keyboardActivation(handleClick)}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={allowedTypes.join(",")}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />
        
        {value ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-xs sm:text-sm text-dashboard">
              <p className="font-medium break-words">{value.name}</p>
              <p className="text-dashboard-light">{formatFileSize(value.size)}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeFile();
              }}
              className="text-dashboard-danger hover:text-dashboard-danger text-xs sm:text-sm underline"
            >
              Remove file
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-center">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-dashboard-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div className="text-xs sm:text-sm text-dashboard-light">
              <p className="font-medium break-words">{placeholder}</p>
              <p className="text-xs text-dashboard-light mt-1">
                PDF, DOC, DOCX, JPG, PNG up to {formatFileSize(maxSize)}
              </p>
            </div>
          </div>
        )}
      </div>
      
      {error && (
        <span className="text-xs font-poppins text-dashboard-danger">
          {error}
        </span>
      )}
    </div>
  );
};

export default VerificationFileUpload;
