"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { onToasterRequest } from "./toast";

const Toaster = dynamic(() => import("@/components/ui/sonner").then((module) => module.Toaster), { ssr: false });

/*
 * The toast region, loaded after the page (#105): it mounts on the first toast of ./toast, or once the page has
 * loaded and the browser is idle, for the toasts that call sonner directly (the admin forms).
 */
export function LazyToaster() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mount = () => setMounted(true);
    const unsubscribe = onToasterRequest(mount);
    let idle: number | undefined;
    const scheduleIdle = () => {
      idle = typeof requestIdleCallback === "function" ? requestIdleCallback(mount, { timeout: 2000 }) : window.setTimeout(mount, 200);
    };
    if (document.readyState === "complete") scheduleIdle();
    else window.addEventListener("load", scheduleIdle, { once: true });
    return () => {
      unsubscribe();
      window.removeEventListener("load", scheduleIdle);
      if (idle === undefined) return;
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  return mounted ? <Toaster /> : null;
}
