import { useRef, useState } from "react";

type Props = {
  imageDataUrl: string;
  language: "ar" | "en";
  onConfirm: (finalImageDataUrl: string) => void;
  onCancel: () => void;
};

// The circular preview's diameter in the modal (CSS pixels).
const PREVIEW_SIZE = 220;
// The final exported image's resolution - independent of the preview
// size, scaled up for a reasonably sharp avatar.
const OUTPUT_SIZE = 320;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Lets the user drag (pan) and zoom their selected photo within a
 * circular preview before confirming, so they can choose exactly which
 * part of the photo becomes the avatar - rather than the previous
 * behavior of uploading the raw file and letting object-fit: cover
 * silently crop from the center with no control.
 *
 * Renders the final crop via <canvas> at OUTPUT_SIZE, replicating the
 * exact same pan/zoom transform shown in the live preview, scaled up
 * proportionally.
 */
export default function AvatarPositioner({
  imageDataUrl,
  language,
  onConfirm,
  onCancel,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });

  // The scale at which the image, at zoom=1, exactly covers the
  // circular preview with no gaps (same idea as object-fit: cover).
  const baseScale = naturalSize
    ? Math.max(PREVIEW_SIZE / naturalSize.width, PREVIEW_SIZE / naturalSize.height)
    : 1;
  const totalScale = baseScale * zoom;
  const displayWidth = naturalSize ? naturalSize.width * totalScale : PREVIEW_SIZE;
  const displayHeight = naturalSize ? naturalSize.height * totalScale : PREVIEW_SIZE;
  const maxOffsetX = Math.max(0, (displayWidth - PREVIEW_SIZE) / 2);
  const maxOffsetY = Math.max(0, (displayHeight - PREVIEW_SIZE) / 2);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    setDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;
    setOffset({
      x: clamp(dragStartRef.current.offsetX + dx, -maxOffsetX, maxOffsetX),
      y: clamp(dragStartRef.current.offsetY + dy, -maxOffsetY, maxOffsetY),
    });
  }

  function handleZoomChange(nextZoom: number) {
    setZoom(nextZoom);
    // Re-clamp the current offset against the new zoom level's bounds -
    // zooming out can make a previously valid offset exceed the new
    // (smaller) allowed range.
    const nextTotalScale = baseScale * nextZoom;
    const nextDisplayWidth = naturalSize
      ? naturalSize.width * nextTotalScale
      : PREVIEW_SIZE;
    const nextDisplayHeight = naturalSize
      ? naturalSize.height * nextTotalScale
      : PREVIEW_SIZE;
    const nextMaxOffsetX = Math.max(0, (nextDisplayWidth - PREVIEW_SIZE) / 2);
    const nextMaxOffsetY = Math.max(0, (nextDisplayHeight - PREVIEW_SIZE) / 2);
    setOffset((current) => ({
      x: clamp(current.x, -nextMaxOffsetX, nextMaxOffsetX),
      y: clamp(current.y, -nextMaxOffsetY, nextMaxOffsetY),
    }));
  }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !naturalSize) return;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Same transform as the live preview, scaled from preview pixel
    // space to the output canvas's pixel space.
    const ratio = OUTPUT_SIZE / PREVIEW_SIZE;
    const outDisplayWidth = displayWidth * ratio;
    const outDisplayHeight = displayHeight * ratio;
    const drawX = OUTPUT_SIZE / 2 - outDisplayWidth / 2 + offset.x * ratio;
    const drawY = OUTPUT_SIZE / 2 - outDisplayHeight / 2 + offset.y * ratio;

    ctx.drawImage(img, drawX, drawY, outDisplayWidth, outDisplayHeight);
    onConfirm(canvas.toDataURL("image/png"));
  }

  return (
    <div className="avatar-positioner-backdrop" dir={language === "ar" ? "rtl" : "ltr"}>
      <div className="avatar-positioner-modal">
        <h3>{language === "ar" ? "اضبط الصورة" : "Adjust photo"}</h3>
        <p>
          {language === "ar"
            ? "اسحب الصورة لتحريكها، واستخدم الشريط للتكبير"
            : "Drag to reposition, use the slider to zoom"}
        </p>

        <div
          className="avatar-positioner-viewport"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          <img
            ref={imgRef}
            src={imageDataUrl}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setNaturalSize({ width: el.naturalWidth, height: el.naturalHeight });
            }}
            style={{
              width: displayWidth,
              height: displayHeight,
              transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
        </div>

        <input
          type="range"
          className="avatar-positioner-zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
        />

        <div className="avatar-positioner-actions">
          <button type="button" className="avatar-positioner-cancel" onClick={onCancel}>
            {language === "ar" ? "إلغاء" : "Cancel"}
          </button>
          <button
            type="button"
            className="avatar-positioner-confirm"
            onClick={handleConfirm}
            disabled={!naturalSize}
          >
            {language === "ar" ? "حفظ" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
