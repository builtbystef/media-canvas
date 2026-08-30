"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RecheckOnRestore() {
  const router = useRouter();
  useEffect(() => {
    const [entry] = performance.getEntriesByType("navigation");
    if (entry instanceof PerformanceNavigationTiming && entry.type === "back_forward") {
      router.refresh();
    }
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) router.refresh();
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, [router]);
  return null;
}
