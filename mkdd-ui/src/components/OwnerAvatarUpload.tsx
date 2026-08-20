import { useRef, useState } from "react";
import { FaCamera, FaSpinner, FaTriangleExclamation } from "react-icons/fa6";
import { uploadOwnerAvatar } from "../api/client";
import AvatarPositioner from "./AvatarPositioner";

type Props = {
  username: string;
  avatarUrl: string | null;
  language: "ar" | "en";
  onAvatarChange: (avatarUrl: string | null) => void;
};

type UploadStatus = "idle" | "uploading" | "error";

/**
 * The logged-in user's own avatar circle + upload control
 * (BUGS_AND_FIXES.md #128) - same interaction pattern as
 * EmployeeAvatarUpload.tsx (real button + hidden file input +
 * AvatarPositioner for drag/zoom framing before upload), reused here
 * for the owner's own profile photo instead of an employee's.
 */
export default function OwnerAvatarUpload({
  username,
  avatarUrl,
  language,
  onAvatarChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [pendingImage, setPendingImage] = useState<string | null>(null);

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("file_read_failed"));
      };
      reader.onerror = () => reject(reader.error ?? new Error("file_read_failed"));
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPendingImage(dataUrl);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const handlePositionerConfirm = async (finalImageDataUrl: string) => {
    setPendingImage(null);
    setStatus("uploading");

    try {
      const newAvatarUrl = await uploadOwnerAvatar(finalImageDataUrl);
      onAvatarChange(newAvatarUrl);
      setStatus("idle");
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <div className="employee-avatar-wrap owner-avatar-wrap">
      <div className="employee-avatar owner-avatar">
        {avatarUrl ? (
          <img src={avatarUrl} alt={username} />
        ) : (
          (username.slice(0, 1).toUpperCase() ?? "?")
        )}
      </div>

      <button
        type="button"
        className={`employee-avatar-upload${status !== "idle" ? ` ${status}` : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        aria-label={language === "ar" ? "تغيير صورتك" : "Change your photo"}
      >
        {status === "uploading" ? (
          <FaSpinner className="spin-icon" />
        ) : status === "error" ? (
          <FaTriangleExclamation />
        ) : (
          <FaCamera />
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={handleFileChange}
      />

      {pendingImage && (
        <AvatarPositioner
          imageDataUrl={pendingImage}
          language={language}
          onConfirm={handlePositionerConfirm}
          onCancel={() => setPendingImage(null)}
        />
      )}
    </div>
  );
}
