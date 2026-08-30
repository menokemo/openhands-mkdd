import { useEffect, useState } from "react";
import {
  FaXmark,
  FaCircleCheck,
  FaCircleXmark,
  FaCircleQuestion,
  FaArrowTrendUp,
  FaArrowTrendDown,
} from "react-icons/fa6";
import {
  fetchSystemHealth,
  fetchSystemHealthHistory,
  type SystemHealthStatus,
  type SystemHealthHistoryEvent,
} from "../api/client";
import { formatMessageTime } from "../utils/formatMessageTime";
import LiveCountdown from "./LiveCountdown";

type Props = {
  language: "ar" | "en";
  onClose: () => void;
};

type Tab = "live" | "history";

/**
 * Shows the current live result of deploy/health-check.sh (BUGS_AND_
 * FIXES.md #158), plus a history log of past incidents (#159) - opened
 * from Sidebar.tsx's "System Health" item. Two tabs, per explicit
 * request: "الحالة الحية و السجل" - a live status view alone only
 * shows what's true right now, not what already happened and got
 * fixed, so the owner asked for both.
 *
 * Both tabs refresh every 30s while open (last-known-good: on a failed
 * fetch, keeps showing the previous result rather than blanking the
 * screen - same principle used throughout the rest of the app for
 * background data).
 */
export default function SystemHealthModal({ language, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("live");
  const [status, setStatus] = useState<SystemHealthStatus | null>(null);
  const [history, setHistory] = useState<SystemHealthHistoryEvent[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    function load() {
      Promise.all([fetchSystemHealth(), fetchSystemHealthHistory()])
        .then(([statusData, historyData]) => {
          if (cancelled) return;
          setStatus(statusData);
          setHistory(historyData.events);
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
          liveTab: "الحالة الحية",
          historyTab: "السجل",
          notCheckedYet:
            "لسه معملش أي فحص. استنى دقيقة كام لأول تشغيل، أو شغّل health-check.sh يدويًا.",
          lastChecked: "آخر فحص:",
          allHealthy: "كل حاجة شغالة تمام",
          someFailed: "في مشاكل محتاجة انتباه",
          noHistory: "مفيش أي حوادث مسجَّلة لحد دلوقتي.",
          becameUnhealthy: "توقفت عن العمل",
          recovered: "رجعت تشتغل",
        }
      : {
          title: "System Health",
          liveTab: "Live Status",
          historyTab: "History",
          notCheckedYet:
            "No check has run yet. Wait a few minutes for the first run, or run health-check.sh manually.",
          lastChecked: "Last checked:",
          allHealthy: "Everything is healthy",
          someFailed: "Something needs attention",
          noHistory: "No incidents recorded yet.",
          becameUnhealthy: "Went down",
          recovered: "Recovered",
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

        <div className="system-health-tabs">
          <button
            type="button"
            className={
              tab === "live"
                ? "system-health-tab system-health-tab-active"
                : "system-health-tab"
            }
            onClick={() => setTab("live")}
          >
            {t.liveTab}
          </button>
          <button
            type="button"
            className={
              tab === "history"
                ? "system-health-tab system-health-tab-active"
                : "system-health-tab"
            }
            onClick={() => setTab("history")}
          >
            {t.historyTab}
          </button>
        </div>

        {tab === "live" && (
          <>
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
                      <span>
                        {check.message}
                        {check.meta?.resetsAt && (
                          <LiveCountdown
                            resetsAt={check.meta.resetsAt}
                            language={language}
                          />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {tab === "history" && (
          <div className="list-modal-items">
            {!loading && (history === null || history.length === 0) && (
              <p className="domain-settings-description">{t.noHistory}</p>
            )}
            {history?.map((event, i) => (
              <div
                key={`${event.at}-${event.name}-${i}`}
                className="system-health-history-row"
              >
                {event.transition === "became_unhealthy" ? (
                  <FaArrowTrendDown className="system-health-icon-fail" />
                ) : (
                  <FaArrowTrendUp className="system-health-icon-ok" />
                )}
                <div className="system-health-history-details">
                  <strong>
                    {event.transition === "became_unhealthy"
                      ? t.becameUnhealthy
                      : t.recovered}
                  </strong>
                  <span>{event.message}</span>
                  <span className="system-health-timestamp">
                    {formatMessageTime(event.at, language)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
