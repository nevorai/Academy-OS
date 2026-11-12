import { useEffect, useState } from "react";

/**
 * useBodyLock — prevents the background from scrolling on mobile.
 * Reference-counted to support multiple overlapping shells.
 */
export function useBodyLock(active: boolean) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!active || !isMobile) return;

    // Only stop the page behind from scrolling. We never make the body position:fixed:
    // on an iPhone home-screen app that shifted the whole screen up and left a strip at the bottom.
    const win = window as any;
    win.__bodyLockCount = (win.__bodyLockCount || 0) + 1;
    if (win.__bodyLockCount === 1) {
      win.__previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "none";
    }
    return () => {
      win.__bodyLockCount--;
      if (win.__bodyLockCount === 0) {
        document.documentElement.style.overflow = win.__previousOverflow || "";
        document.body.style.overscrollBehavior = "";
      }
    };
  }, [active, isMobile]);
}
