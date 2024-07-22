import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/tools/lib/utils';

const badgeVariants = cva(
    'inline-flex items-center rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 dark:border-slate-800 dark:focus:ring-slate-300',
    {
        variants: {
            variant: {
                contained:
                    'border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80',

            },
        },
        defaultVariants: {
            variant: 'contained',
        },
    },
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div
            className = { cn(badgeVariants({ variant }), className) }
            { ...props }
        />
    );
}

export { Badge, badgeVariants };
