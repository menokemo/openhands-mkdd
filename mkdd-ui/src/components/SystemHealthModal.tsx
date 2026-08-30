import { useEffect, useState } from "react";
import { FaXmark, FaCircleCheck, FaCircleXmark, FaCircleQuestion } from "react-icons/fa6";
import { fetchSystemHealth, type SystemHealthStatus } from "../api/client";
import { formatMessageTime } from "../utils/formatMessageTime";

type Props = {
  language: "ar" | "en";
  onClose: () => void;
};

/**
 * Shows the current result of deploy/health-check.sh's last run
 * (BUGS_AND_FIXES.md #158) - opened from Sidebar.tsx's "System Health"
 * item. This exists specifically to close the "zero proactive
 * monitoring" gap identified after a long session of manual live
 * debugging: instead of only finding out something is broken by
 * hitting it, or only via a push notification, there's now a real
 * place inside the app to check current status at any time.
 *
 * Refreshes every 30s while open (last-known-good: on a failed
 * fetch, keeps showing the previous result rather than blanking the
 * screen - same principle used throughout the rest of the app for
 * background data).
 */
export default function SystemHealthModal({ language, onClose }: Props) {
  const [status, setStatus] = useState<SystemHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function load() {
      fetchSystemHealth()
        .then((data) => {
          if (cancelled) return;
          setStatus(data);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }

    load();
    const interval = setInterval(load, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const t =
    language === "ar"
      ? {
          title: "صحة النظام",
          notCheckedYet:
            "لسه معملش أي فحص. استنى دقيقة كام لأول تشغيل، أو شغّل health-check.sh يدويًا.",
          lastChecked: "آخر فحص:",
          allHealthy: "كل حاجة شغالة تمام",
          someFailed: "في مشاكل محتاجة انتباه",
        }
      : {
          title: "System Health",
          notCheckedYet:
            "No check has run yet. Wait a few minutes for the first run, or run health-check.sh manually.",
          lastChecked: "Last checked:",
          allHealthy: "Everything is healthy",
          someFailed: "Something needs attention",
        };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal list-modal" onClick={(e) => e.stopPropagation()}>
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

        {!loading && status?.checkedAt === null && (
          <p className="domain-settings-description">{t.notCheckedYet}</p>
        )}

        {status?.checkedAt && (
          <>
            <div
              className={
                status.ok
                  ? "system-health-summary system-health-ok"
                  : "system-health-summary system-health-fail"
              }
            >
              {status.ok ? <FaCircleCheck /> : <FaCircleXmark />}
              <span>{status.ok ? t.allHealthy : t.someFailed}</span>
            </div>
            <p className="system-health-timestamp">
              {t.lastChecked} {formatMessageTime(status.checkedAt, language)}
            </p>

            <div className="list-modal-items">
              {status.checks.map((check) => (
                <div key={check.name} className="system-health-check-row">
                  {check.ok === true && (
                    <FaCircleCheck className="system-health-icon-ok" />
                  )}
                  {check.ok === false && (
                    <FaCircleXmark className="system-health-icon-fail" />
                  )}
                  {check.ok === null && (
                    <FaCircleQuestion className="system-health-icon-skip" />
                  )}
                  <span>{check.message}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
