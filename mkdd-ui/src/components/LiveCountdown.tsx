import { useEffect, useState } from "react";

type Props = {
  resetsAt: number;
  language: "ar" | "en";
};

/**
 * Live countdown to a real timestamp (BUGS_AND_FIXES.md #172) - the
 * owner asked to see exactly how much time is left, ticking down live,
 * instead of a static "roughly N hours" text computed once when
 * health-check.sh ran and never updated again. Updates every second
 * via its own timer, independent of the parent's own 30s refresh
 * interval, so the countdown itself never feels stale even between
 * parent refreshes.
 *
 * BUGS_AND_FIXES.md #206: also shows the real actual date/time it'll
 * come back at (e.g. "الاثنين، 5:32 م"), not just the relative
 * countdown - some usage limits reset many hours away, and a bare
 * countdown alone doesn't answer "so what time is that, exactly?"
 * without mental math.
 */
export default function LiveCountdown({ resetsAt, language }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remainingMs = resetsAt - now;

  // BUGS_AND_FIXES.md #172: ar-EG on its own produces Arabic-Indic
  // numerals (e.g. "٧:٣٨") - explicitly forcing latn numerals keeps the
  // Arabic day name ("الأربعاء") while the time itself stays in plain,
  // universally-readable digits, exactly the same fix already applied
  // elsewhere for this identical locale quirk.
  const resetDateLabel = new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-GB", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    numberingSystem: "latn",
  }).format(new Date(resetsAt));

  if (remainingMs <= 0) {
    return (
      <span className="live-countdown live-countdown-done">
        {language === "ar" ? " - المفروض يكون رجع يشتغل دلوقتي" : " - should be back now"}
      </span>
    );
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  const display =
    hours > 0
      ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;

  return (
    <span className="live-countdown">
      {" "}
      ({language === "ar" ? "متبقي" : "remaining"}: {display}
      {" - "}
      {language === "ar" ? "هيرجع" : "back at"} {resetDateLabel})
    </span>
  );
}
