// Native form controls styled like the shadcn Input: a native <select> and <textarea> give the phone its own
// pickers and keyboard, which a custom popup cannot match for one-handed use.
export const controlClass =
  "w-full min-w-0 rounded-none border-2 border-input bg-transparent px-2.5 font-input text-base text-foreground outline-none transition focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sb:text-sm";

export const inputClass = `${controlClass} h-12 sb:h-11`;
export const selectClass = `${controlClass} h-12 appearance-auto sb:h-11`;
export const textareaClass = `${controlClass} min-h-28 py-2.5`;
export const labelClass = "font-sans text-sm font-semibold";
