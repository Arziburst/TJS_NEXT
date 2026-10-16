import { cva } from "class-variance-authority"

// The button classes on their own (#105): a Server Component that styles a link as a button imports these,
// not button.tsx, whose Base UI primitive would otherwise join the route's client JavaScript.
// A button disabled but focusable (`focusableWhenDisabled`) has no `disabled` attribute, only aria-disabled:
// it looks disabled the same way, with a not-allowed cursor, no hover change and no press-in (#126).
export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border-2 border-transparent bg-clip-padding font-sans text-sm font-medium whitespace-nowrap transition outline-none select-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:not-aria-disabled:scale-95 disabled:pointer-events-none disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // solid brown with beige text, inverting on hover / focus
        default:
          "border-primary bg-primary text-primary-foreground hover:bg-transparent hover:text-primary focus-visible:bg-transparent focus-visible:text-primary aria-disabled:hover:bg-primary aria-disabled:hover:text-primary-foreground",
        outline:
          "border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground aria-expanded:bg-primary aria-expanded:text-primary-foreground aria-disabled:hover:bg-transparent aria-disabled:hover:text-primary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary),var(--foreground)_10%)] aria-expanded:bg-secondary aria-disabled:hover:bg-secondary",
        ghost:
          "border-0 text-foreground hover:opacity-70 focus-visible:opacity-70 active:opacity-100 aria-expanded:opacity-70 aria-disabled:hover:opacity-50 aria-disabled:active:opacity-50",
        destructive:
          "border-destructive bg-transparent text-destructive hover:bg-destructive hover:text-primary-foreground aria-disabled:hover:bg-transparent aria-disabled:hover:text-destructive",
        link: "border-0 text-foreground underline-offset-4 hover:text-accent-text hover:underline aria-disabled:hover:text-foreground aria-disabled:hover:no-underline",
      },
      size: {
        default:
          "min-h-11 gap-2 px-6 py-5 sb:text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        xs: "h-7 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1.5 px-4 text-xs",
        lg: "min-h-14 gap-2 px-8 py-6 text-base",
        icon: "size-11",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
