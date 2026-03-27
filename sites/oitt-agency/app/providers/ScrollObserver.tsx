"use client";

import { useEffect } from "react";

export function ScrollObserver() {
  useEffect(() => {
    // Mark body as ready for animations — content is visible by default
    // until this class is added, so no content is ever hidden.
    document.body.classList.add("animate-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
    );

    function observeAll() {
      document
        .querySelectorAll(
          ".fade-in:not(.visible), .fade-in-left:not(.visible), .fade-in-right:not(.visible)"
        )
        .forEach((el) => observer.observe(el));
    }

    // Small delay to let elements render, then start observing
    requestAnimationFrame(() => {
      observeAll();
      // Re-observe after a tick to catch any late-rendered elements
      setTimeout(observeAll, 200);
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
