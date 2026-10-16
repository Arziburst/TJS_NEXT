"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { onToasterRequest } from "./toast";

const Toaster = dynamic(() => import("@/components/ui/sonner").then((module) => module.Toaster), { ssr: false });

// The toast region, loaded with the first toast of ./toast (#105).
export function LazyToaster() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => onToasterRequest(() => setMounted(true)), []);
  return mounted ? <Toaster /> : null;
}
