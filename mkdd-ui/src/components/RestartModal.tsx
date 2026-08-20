import { useState } from "react";
import { FaXmark, FaRotateRight } from "react-icons/fa6";
import { restartContainer } from "../api/client";

type Props = {
  language: "ar" | "en";
  onClose: () => void;
};

/**
 * Restart the mkdd-ui container (BUGS_AND_FIXES.md #110, simplified in
 * #126). This used to also manage an "allowed domains" list, but that
 * setting only ever affected Vite's DEV server - since #123 switched
 * to a real production build (no dev server running at all anymore),
 * that management UI had no real effect and was misleadingly still
 * shown as if it did something. Removed; only the still-genuinely-
 * useful restart action remains.
 */
export default function RestartModal({ language, onClose }: Props) {
  const [restarting, setRestarting] = useState(false);

  const t =
    language === "ar"
      ? {
          title: "إعادة تشغيل الحاوية",
          description: "أعد تشغيل حاوية mkdd-ui — مفيد بعد أي تحديث إعدادات.",
          restartButton: "إعادة تشغيل الآن",
          restarting: "جاري إعادة التشغيل…",
          restartingMessage:
            "استنى نص دقيقة تقريبًا، وبعدها حدّث الصفحة. لو الصفحة معملتش رد، افتحها تاني بعد شوية.",
        }
      : {
          title: "Restart Container",
          description:
            "Restart the mkdd-ui container — useful after any settings update.",
          restartButton: "Restart now",
          restarting: "Restarting…",
          restartingMessage:
            "Wait about half a minute, then refresh the page. If it doesn't respond, reopen it in a bit.",
        };

  async function handleRestart() {
    setRestarting(true);
    try {
      await restartContainer();
    } catch {
      // The container may die mid-response once Docker accepts the
      // restart request - a failed fetch here is expected, not a real
      // error, since we only care that the request was sent.
    }
    // Deliberately never reset restarting - the container is genuinely
    // restarting, nothing meaningful left to do until a manual refresh.
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal domain-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gate-reports-modal-header">
          <h2>{t.title}</h2>
          <button
            type="button"
            className="modal-close-button"
            onClick={onClose}
            aria-label={language === "ar" ? "إغلاق" : "Close"}
          >
            <FaXmark />
          </button>
        </div>

        <p className="domain-settings-description">{t.description}</p>

        {!restarting && (
          <button
            type="button"
            className="domain-settings-restart-button"
            onClick={handleRestart}
          >
            <FaRotateRight />
            {t.restartButton}
          </button>
        )}

        {restarting && (
          <div className="domain-settings-restart-notice domain-settings-restarting">
            <FaRotateRight className="domain-settings-spin" />
            <div>
              <p>
                <strong>{t.restarting}</strong>
              </p>
              <p>{t.restartingMessage}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
