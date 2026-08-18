import { useEffect, useState } from "react";
import { FaXmark, FaTrash, FaTriangleExclamation } from "react-icons/fa6";
import {
  fetchAllowedHosts,
  addAllowedHostSetting,
  removeAllowedHostSetting,
} from "../api/client";

type Props = {
  language: "ar" | "en";
  onClose: () => void;
};

/**
 * Domain (allowedHosts) settings - BUGS_AND_FIXES.md #109. This is
 * deliberately NOT a "live" settings panel: Vite only reads the
 * persisted domain list at server startup, so every save/remove here
 * shows an explicit, impossible-to-miss restart notice rather than
 * implying the change took effect immediately.
 */
export default function DomainSettingsModal({ language, onClose }: Props) {
  const [hosts, setHosts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHost, setNewHost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restartNotice, setRestartNotice] = useState(false);

  const t =
    language === "ar"
      ? {
          title: "الدومينات المسموحة",
          description:
            "الدومينات اللي مسموح للتطبيق يتفتح منها. أي دومين جديد محتاج إعادة تشغيل الحاوية عشان يتفعّل.",
          placeholder: "مثال: mkdd.example.com",
          add: "إضافة",
          empty: "مفيش دومينات مضافة حاليًا.",
          restartNotice:
            "تم الحفظ — الدومين مش هيشتغل إلا بعد إعادة تشغيل حاوية mkdd-ui:\ndocker compose up -d --build mkdd-ui",
          loadFailed: "فشل تحميل الدومينات المحفوظة",
          saveFailed: "فشل الحفظ، حاول تاني",
          removeFailed: "فشل الحذف، حاول تاني",
        }
      : {
          title: "Allowed Domains",
          description:
            "Domains the app is allowed to be opened from. Any new domain requires restarting the container to take effect.",
          placeholder: "e.g. mkdd.example.com",
          add: "Add",
          empty: "No domains added yet.",
          restartNotice:
            "Saved — the domain won't work until the mkdd-ui container is restarted:\ndocker compose up -d --build mkdd-ui",
          loadFailed: "Failed to load saved domains",
          saveFailed: "Save failed, try again",
          removeFailed: "Remove failed, try again",
        };

  useEffect(() => {
    fetchAllowedHosts()
      .then(setHosts)
      .catch(() => setError(t.loadFailed))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newHost.trim() || saving) return;

    setSaving(true);
    setError(null);
    try {
      const result = await addAllowedHostSetting(newHost.trim());
      setHosts(result.allowedHosts);
      setNewHost("");
      setRestartNotice(true);
    } catch {
      setError(t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(host: string) {
    setError(null);
    try {
      const result = await removeAllowedHostSetting(host);
      setHosts(result.allowedHosts);
      setRestartNotice(true);
    } catch {
      setError(t.removeFailed);
    }
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

        {restartNotice && (
          <p className="domain-settings-restart-notice">
            <FaTriangleExclamation />
            {t.restartNotice}
          </p>
        )}

        {error && <p className="modal-error">{error}</p>}

        {!loading && (
          <ul className="domain-settings-list">
            {hosts.length === 0 && <li className="domain-settings-empty">{t.empty}</li>}
            {hosts.map((host) => (
              <li key={host} className="domain-settings-item">
                <span>{host}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(host)}
                  aria-label={language === "ar" ? "حذف" : "Remove"}
                >
                  <FaTrash />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="domain-settings-form" onSubmit={handleAdd}>
          <input
            type="text"
            value={newHost}
            onChange={(e) => setNewHost(e.target.value)}
            placeholder={t.placeholder}
            disabled={saving}
          />
          <button type="submit" disabled={saving || !newHost.trim()}>
            {t.add}
          </button>
        </form>
      </div>
    </div>
  );
}
