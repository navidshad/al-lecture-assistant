import React from "react";
import { UploadCloudIcon, Loader2, Settings } from "lucide-react";

interface FileUploadBoxProps {
  isLoading: boolean;
  loadingText: string;
  disabled: boolean;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenSettings: () => void;
}

const FileUploadBox: React.FC<FileUploadBoxProps> = ({
  isLoading,
  loadingText,
  disabled,
  onFileChange,
  onOpenSettings,
}) => {
  return (
    <label
      htmlFor="pdf-upload"
      className={`relative block w-full h-64 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-300 bg-gray-800/50 ${
        !disabled
          ? "border-gray-600 hover:border-blue-500"
          : "border-gray-700 opacity-70 cursor-not-allowed"
      }`}
    >
      <div className="flex flex-col items-center justify-center h-full">
        {isLoading ? (
          <>
            <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />
            <p className="mt-4 text-lg text-gray-400 text-center">
              {loadingText}
            </p>
          </>
        ) : disabled ? (
          <>
            <Settings className="h-16 w-16 text-gray-500" />
            <p className="mt-4 text-lg text-gray-400 text-center">
              Add your{" "}
              <span className="font-semibold text-blue-400">
                Gemini API key
              </span>{" "}
              in Settings to enable uploads PDF file.
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onOpenSettings();
              }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              Open Settings
            </button>
          </>
        ) : (
          <>
            <UploadCloudIcon className="h-16 w-16 text-gray-500" />
            <p className="mt-4 text-lg text-gray-400">
              <span className="font-semibold text-blue-400">
                Click to upload
              </span>{" "}
              or drag and drop
            </p>
            <p className="text-sm text-gray-500">PDF files only</p>
          </>
        )}
      </div>
      <input
        id="pdf-upload"
        type="file"
        accept=".pdf"
        className="sr-only"
        onChange={onFileChange}
        disabled={isLoading || disabled}
      />
    </label>
  );
};

export default FileUploadBox;
