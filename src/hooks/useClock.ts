import { useEffect, useMemo, useState } from "react";

export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return useMemo(() => {
    const h24 = now.getHours();
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return {
      now,
      h24,
      hh: pad(h12),
      mm: pad(now.getMinutes()),
      ss: pad(now.getSeconds()),
      ampm: h24 < 12 ? "AM" : "PM",
      dateLong: now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
      greeting:
        h24 < 5 ? "Still awake" : h24 < 12 ? "Good morning" : h24 < 17 ? "Good afternoon" : h24 < 21 ? "Good evening" : "Good night",
    };
  }, [now]);
}
