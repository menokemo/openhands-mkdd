import { useRef, useState } from "react";
import { FaCamera, FaSpinner, FaTriangleExclamation } from "react-icons/fa6";
import type { AgentProfile } from "../types";
import AvatarPositioner from "./AvatarPositioner";

type Props = {
  employee: AgentProfile;
  label: string | null;
  language: "ar" | "en";
  onUpload: (employeeSlug: string, imageDataUrl: string) => Promise<void>;
};

type UploadStatus = "idle" | "uploading" | "error";

/**
 * Avatar circle + photo upload control for one employee.
 *
 * Deliberately uses a real <button> + useRef + programmatic .click() on a
 * hidden <input type="file"> instead of the more common <label> wrapping
 * an <input> pattern. The label pattern relies on the browser's native
 * label-to-input click forwarding, which turned out to be unreliable in
 * this app's actual mobile testing (BUGS_AND_FIXES.md #31): the file
 * picker opened correctly, but selecting a photo produced no visible
 * result and no way to tell whether anything had gone wrong. The
 * ref+button approach is more explicit and, critically, this component
 * always shows the user what's happening (uploading / error) instead of
 * failing silently.
 *
 * After selecting a file, the raw image is NOT uploaded immediately -
 * it's handed to AvatarPositioner first, so the owner can drag/zoom to
 * choose exactly which part of the photo becomes the avatar
 * (BUGS_AND_FIXES.md #73), instead of a silent center-crop with no
 * control over framing.
 */
export default function EmployeeAvatarUpload({
  employee,
  label,
  language,
  onUpload,
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
      await onUpload(employee.name, finalImageDataUrl);
      setStatus("idle");
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <div className="employee-avatar-wrap">
      <div className="employee-avatar">
        {employee.avatarUrl ? (
          <img src={employee.avatarUrl} alt={label ?? employee.name} />
        ) : (
          (label?.slice(0, 1) ?? "?")
        )}
      </div>

      <button
        type="button"
        className={`employee-avatar-upload${status !== "idle" ? ` ${status}` : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        aria-label={language === "ar" ? "تغيير صورة الموظف" : "Change employee photo"}
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
