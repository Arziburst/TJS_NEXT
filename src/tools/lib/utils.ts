import { type ClassValue, clsx as clsxCore } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsxCore(inputs));
}

export const clsx = clsxCore;
