"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Ask the server again for a page the browser brought back from its own store.
 *
 * Going back does not have to mean fetching anything: a browser will re-show
 * the document it already has, from the back/forward cache or from the http
 * cache, and it does so for a history navigation even when the response said
 * not to store it. Nothing on the server runs, so the session gate that would
 * have turned this page into the sign-in page never gets asked — and the
 * product stays on screen after signing out.
 *
 * Both ways back are covered, because they are told apart differently: a
 * document restored whole announces itself with `persisted`, while one rebuilt
 * from the cache is an ordinary load whose navigation type is `back_forward`.
 * The answer to either is `refresh()`, which re-runs this route on the server,
 * redirect and all, without discarding the page.
 */
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
