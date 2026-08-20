import React, { useRef } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
// Side-effect import: quill2-emoji self-registers `modules/emoji-toolbar` and
// `formats/emoji` onto the shared Quill instance at module load. (It does NOT
// provide the emoji-textarea or emoji-shortname modules that quill-emoji@1 had.)
import "quill2-emoji";
import "quill2-emoji/dist/style.css"; // Emoji CSS

interface TiptapEditorProps {
  value: string;
  initalValue?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  value,
  onChange,
  initalValue,
  placeholder = "Tell us about yourself...",
}) => {
  const quillRef = useRef<ReactQuill>(null);

  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }, { background: [] }],
      [{ list: "ordered" }, { list: "bullet" }],
    ],
    "emoji-toolbar": true, // Emoji toolbar button (only module quill2-emoji provides)
  };

  const formats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "list",
    "bullet",
    "emoji", // Add emoji to formats
  ];

  return (
    <div className="bio-editor">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .bio-editor .ql-editor {
            background-color: var(--dash-muted) !important;
            color: var(--dash-text) !important;
            border: 1px solid var(--dash-border) !important;
            border-radius: 0 0 0.375rem 0.375rem !important;
            min-height: 100px !important;
            margin-top: 0 !important;
            padding-top: 8px !important;
          }
          .bio-editor .ql-editor::before {
            color: var(--dash-light) !important;
            opacity: 0.6 !important;
          }
          .bio-editor .ql-toolbar {
            background-color: var(--dash-sidebar-bg) !important;
            border: 1px solid var(--dash-border) !important;
            border-bottom: none !important;
            border-radius: 0.375rem 0.375rem 0 0 !important;
            order: 1 !important;
            margin-bottom: 0 !important;
            padding: 8px 12px !important;
          }
          .bio-editor .ql-container {
            border: 1px solid var(--dash-border) !important;
            border-top: none !important;
            border-radius: 0 0 0.375rem 0.375rem !important;
            order: 2 !important;
          }
          .bio-editor .ql-editor:focus {
            outline: none !important;
          }
          .bio-editor .ql-stroke {
            stroke: var(--dash-text) !important;
          }
          .bio-editor .ql-fill {
            fill: var(--dash-text) !important;
          }
          .bio-editor .ql-picker-label {
            color: var(--dash-text) !important;
          }
          .bio-editor .ql-picker-options {
            background-color: var(--dash-sidebar-bg) !important;
            border: 1px solid var(--dash-border) !important;
          }
          /* Ensure proper order: toolbar above editor */
          .bio-editor .ql-container {
            display: flex !important;
            flex-direction: column !important;
            gap: 0 !important;
          }
          .bio-editor .ql-toolbar {
            position: relative !important;
            z-index: 1 !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
          .bio-editor {
            display: flex !important;
            flex-direction: column !important;
            gap: 0 !important;
          }
          /* Emoji tray styling - more specific selectors */
          .bio-editor .ql-emoji-toolbar,
          .bio-editor .ql-emoji-toolbar .ql-picker-options,
          .bio-editor .ql-emoji-toolbar .ql-picker-menu,
          .bio-editor .ql-emoji-toolbar .ql-emoji-picker,
          .bio-editor .ql-emoji-toolbar .ql-emoji-picker-menu {
            background-color: rgba(55, 65, 81, 0.95) !important;
            border: 1px solid rgb(75, 85, 99) !important;
            border-radius: 0.375rem !important;
            padding: 8px !important;
            z-index: 10000 !important;
            color: white !important;
            max-height: 300px !important;
            overflow-y: auto !important;
            position: fixed !important;
          }
          .bio-editor .ql-emoji-toolbar .ql-emoji-item,
          .bio-editor .ql-emoji-toolbar .ql-picker-item,
          .bio-editor .ql-emoji-toolbar .ql-emoji-picker-item {
            color: white !important;
            background-color: transparent !important;
            border: none !important;
            padding: 4px !important;
            margin: 2px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            pointer-events: auto !important;
          }
          .bio-editor .ql-emoji-toolbar .ql-emoji-item:hover,
          .bio-editor .ql-emoji-toolbar .ql-picker-item:hover,
          .bio-editor .ql-emoji-toolbar .ql-emoji-picker-item:hover {
            background-color: rgba(59, 130, 246, 0.2) !important;
          }
          .bio-editor .ql-emoji-toolbar .ql-emoji-item:active,
          .bio-editor .ql-emoji-toolbar .ql-picker-item:active,
          .bio-editor .ql-emoji-toolbar .ql-emoji-picker-item:active {
            background-color: rgba(59, 130, 246, 0.4) !important;
          }
          /* Global emoji picker styling */
          .ql-emoji-toolbar,
          .ql-emoji-toolbar .ql-picker-options,
          .ql-emoji-toolbar .ql-picker-menu,
          .ql-emoji-toolbar .ql-emoji-picker,
          .ql-emoji-toolbar .ql-emoji-picker-menu {
            background-color: rgba(55, 65, 81, 0.95) !important;
            border: 1px solid rgb(75, 85, 99) !important;
            border-radius: 0.375rem !important;
            padding: 8px !important;
            z-index: 10000 !important;
            color: white !important;
            max-height: 300px !important;
            overflow-y: auto !important;
            position: fixed !important;
          }
          .ql-emoji-toolbar .ql-emoji-item,
          .ql-emoji-toolbar .ql-picker-item,
          .ql-emoji-toolbar .ql-emoji-picker-item {
            color: white !important;
            background-color: transparent !important;
            border: none !important;
            padding: 4px !important;
            margin: 2px !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            pointer-events: auto !important;
          }
          .ql-emoji-toolbar .ql-emoji-item:hover,
          .ql-emoji-toolbar .ql-picker-item:hover,
          .ql-emoji-toolbar .ql-emoji-picker-item:hover {
            background-color: rgba(59, 130, 246, 0.2) !important;
          }
          .ql-emoji-toolbar .ql-emoji-item:active,
          .ql-emoji-toolbar .ql-picker-item:active,
          .ql-emoji-toolbar .ql-emoji-picker-item:active {
            background-color: rgba(59, 130, 246, 0.4) !important;
          }
          /* Prevent emoji picker from closing on click */
          .ql-emoji-toolbar,
          .ql-emoji-toolbar *,
          .bio-editor .ql-emoji-toolbar,
          .bio-editor .ql-emoji-toolbar * {
            pointer-events: auto !important;
          }
          /* Ensure emoji items are clickable and don't close the picker */
          .ql-emoji-toolbar .ql-emoji-item,
          .ql-emoji-toolbar .ql-picker-item,
          .ql-emoji-toolbar .ql-emoji-picker-item,
          .bio-editor .ql-emoji-toolbar .ql-emoji-item,
          .bio-editor .ql-emoji-toolbar .ql-picker-item,
          .bio-editor .ql-emoji-toolbar .ql-emoji-picker-item {
            pointer-events: auto !important;
            user-select: none !important;
          }
          /* Prevent emoji picker from auto-closing */
          .ql-emoji-toolbar .ql-picker-options {
            display: block !important;
          }
          /* Ensure emoji elements are properly clickable */
          .ql-fill,
          .ql-emoji-item,
          [data-emoji],
          #emoji-close-div,
          .ql-picker-options svg,
          .ql-picker-options circle,
          .ql-picker-options path {
            pointer-events: auto !important;
            cursor: pointer !important;
          }
          /* Prevent emoji picker from closing on emoji selection */
          .ql-picker-options {
            pointer-events: auto !important;
          }
          .ql-picker-options * {
            pointer-events: auto !important;
          }
          /* Make emoji picker scrollable with proper styling */
          .ql-emoji-toolbar .ql-picker-options,
          .bio-editor .ql-emoji-toolbar .ql-picker-options {
            max-height: 250px !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            scrollbar-width: thin !important;
            scrollbar-color: rgba(255, 255, 255, 0.3) transparent !important;
          }
          /* Custom scrollbar styling for webkit browsers */
          .ql-emoji-toolbar .ql-picker-options::-webkit-scrollbar,
          .bio-editor .ql-emoji-toolbar .ql-picker-options::-webkit-scrollbar {
            width: 6px !important;
          }
          .ql-emoji-toolbar .ql-picker-options::-webkit-scrollbar-track,
          .bio-editor .ql-emoji-toolbar .ql-picker-options::-webkit-scrollbar-track {
            background: transparent !important;
          }
          .ql-emoji-toolbar .ql-picker-options::-webkit-scrollbar-thumb,
          .bio-editor .ql-emoji-toolbar .ql-picker-options::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3) !important;
            border-radius: 3px !important;
          }
          .ql-emoji-toolbar .ql-picker-options::-webkit-scrollbar-thumb:hover,
          .bio-editor .ql-emoji-toolbar .ql-picker-options::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.5) !important;
          }
          #emoji-close-div {
            height: auto;
            left: 0;
            position: fixed;
            top: 0;
            width: 100%;
          }
        `,
        }}
      />
      <ReactQuill
        ref={quillRef}
        value={value || initalValue}
        onChange={(content) => {
          onChange(content);
        }}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        theme="snow"
      />
    </div>
  );
};

export default TiptapEditor;
