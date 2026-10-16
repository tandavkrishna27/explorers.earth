import { useState, useEffect } from "react";
import Button from "../../../components/ui/Button";
import TiptapEditor from "../../Favorites/components/TiptapEditor";
import ImageCropper from "../../../components/ImageCropper";

interface CreateGuideStep3Props {
  initialTitle?: string;
  initialDescription?: string;
  initialMedia?: File | null;
  initialMediaPreview?: string | null;
  isFetchingLocationImage?: boolean;
  onBack: () => void;
  onSubmit: (data: {
    title: string;
    description: string;
    guideMedia: File | null;
  }) => void;
  onImageChange?: () => void;
  isSubmitting?: boolean;
  isEditMode?: boolean;
  totalSteps?: number;
}

const CreateGuideStep3: React.FC<CreateGuideStep3Props> = ({
  initialTitle = "",
  initialDescription = "",
  initialMedia = null,
  initialMediaPreview = null,
  isFetchingLocationImage = false,
  onBack,
  onSubmit,
  onImageChange,
  isSubmitting = false,
  isEditMode = false,
  totalSteps = 3,
}) => {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [guideMedia, setGuideMedia] = useState<File | null>(initialMedia);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initialMediaPreview
  );
  const [error, setError] = useState("");

  useEffect(() => {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setGuideMedia(initialMedia);
    setPreviewUrl(initialMediaPreview);
  }, [initialTitle, initialDescription, initialMedia, initialMediaPreview]);

  const handleMediaUpload = (file: File) => {
    setGuideMedia(file);
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Notify parent that image was manually changed
    if (onImageChange) {
      onImageChange();
    }
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
  };

  const handleSubmit = () => {
    setError("");

    if (!title.trim()) {
      setError("Please enter a title for your guide");
      return;
    }

    onSubmit({
      title: title.trim(),
      description,
      guideMedia,
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-0 space-y-4 md:space-y-6">
      {/* Cover Image Section */}
      <div
        className="relative flex flex-col justify-end h-48 md:h-64 w-full rounded-xl overflow-hidden shadow-lg border-2 border-dashboard-muted/30"
        style={{
          backgroundImage: previewUrl
            ? `url('${previewUrl}')`
            : "linear-gradient(135deg, hsl(var(--dash-accent)) 0%, hsl(var(--dash-secondary)) 100%)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-black/30 via-transparent to-black/40 z-0"></div>

        {/* Loading indicator for location image fetch */}
        {isFetchingLocationImage && !previewUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
            <svg
              className="animate-spin h-10 w-10 md:h-12 md:w-12 mb-3"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <p className="text-sm md:text-base font-medium">Loading location image...</p>
          </div>
        )}

        {!previewUrl && !isFetchingLocationImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white z-10">
            <svg
              className="w-12 h-12 md:w-20 md:h-20 opacity-70 mb-2 md:mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <h3 className="text-base md:text-lg font-medium">Add Cover Image</h3>
          </div>
        )}

        <div className="absolute bottom-3 right-3 md:bottom-4 md:right-4 z-20">
          <ImageCropper
            onFileUpload={handleMediaUpload}
            cropType="guideCover"
            buttonTitle="Edit Guide Cover"
          />
        </div>
      </div>

      {/* Form Section */}
      <div className="bg-dashboard-sidebar p-4 md:p-6 rounded-lg shadow-dashboard-elevated border border-dashboard-muted">
        {/* Step Indicator */}
        <div className="mb-4 md:mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-dashboard-accent flex items-center justify-center text-white text-sm font-semibold">
                {totalSteps}
              </div>
              <span className="text-dashboard font-poppins font-semibold text-sm md:text-base">
                Guide Details
              </span>
            </div>
            <span className="text-dashboard-accent text-xs md:text-sm font-poppins font-medium">
              Step {totalSteps} of {totalSteps}
            </span>
          </div>
          <div className="w-full h-1.5 md:h-2 bg-dashboard-bg rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-dashboard-accent to-dashboard-secondary transition-all duration-500 ease-out w-full"></div>
          </div>
        </div>

        <div className="space-y-4 md:space-y-5">
          {/* Title Input */}
          <div className="group">
            <label className="text-dashboard font-semibold mb-2 font-poppins text-sm md:text-base flex items-center gap-1">
              <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full px-4 py-3 md:py-2.5 bg-dashboard-sidebar border-2 border-dashboard rounded-xl text-dashboard placeholder-dashboard-light focus:outline-none focus:ring-2 focus:ring-dashboard-accent focus:border-transparent transition-all duration-200 text-base hover:border-dashboard-accent/50"
              placeholder="Enter guide title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
            />
          </div>

          {/* Description Editor */}
          <div className="group">
            <label className="text-dashboard font-semibold mb-2 font-poppins text-sm md:text-base flex items-center gap-1">
              <svg className="w-4 h-4 text-dashboard-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              Description
            </label>
            <TiptapEditor
              value={description}
              onChange={handleDescriptionChange}
              placeholder="Describe your guide..."
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border-l-4 border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm font-poppins flex items-start gap-2 animate-in slide-in-from-top-2 duration-300">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse md:flex-row gap-3 md:gap-3 justify-between pt-5 border-t-2 border-dashboard-muted/50">
            <Button
              type="button"
              variant="ghost"
              btnText="Back"
              onClickHandler={onBack}
              disabled={isSubmitting}
            />
            <Button
              type="button"
              variant="primary"
              btnText={
                isSubmitting
                  ? isEditMode
                    ? "Updating Guide..."
                    : "Creating Guide..."
                  : isEditMode
                    ? "Update Guide"
                    : "Create Guide"
              }
              onClickHandler={handleSubmit}
              isLoading={isSubmitting}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateGuideStep3;

