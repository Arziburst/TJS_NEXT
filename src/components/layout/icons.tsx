import type { SVGProps } from "react";

// Legacy hamburger: two bars, the second shifted right by 10px.
export function MenuBarsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="40" height="10" viewBox="0 0 40 10" fill="currentColor" aria-hidden {...props}>
      <rect width="30" height="2" />
      <rect x="10" y="8" width="30" height="2" />
    </svg>
  );
}

export function MenuCloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width="25" height="22" viewBox="0 0 25 22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden {...props}>
      <path d="M2 1l21 20M23 1L2 21" />
    </svg>
  );
}
