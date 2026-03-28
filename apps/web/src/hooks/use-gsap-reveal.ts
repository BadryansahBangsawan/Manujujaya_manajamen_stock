import gsap from "gsap";
import * as React from "react";

export function useGsapReveal<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);

  React.useEffect(() => {
    if (!ref.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.from("[data-reveal-item]", {
        duration: 0.7,
        opacity: 0,
        y: 18,
        ease: "power3.out",
        stagger: 0.06,
      });
    }, ref);

    return () => ctx.revert();
  }, []);

  return ref;
}
