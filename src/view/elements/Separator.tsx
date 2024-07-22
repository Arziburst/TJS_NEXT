// Core
import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';

// Tools
import { cn } from '@/tools/lib/utils';

const Separator = React.forwardRef<
React.ElementRef<typeof SeparatorPrimitive.Root>,
React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(
    (
        { className, orientation = 'horizontal', decorative = true, ...props },
        ref,
    ) => (
        <SeparatorPrimitive.Root
            className = { cn(
                'shrink-0 bg-slate-200 dark:bg-slate-800',
                orientation === 'horizontal' ? 'h-[1px] w-full' : 'h-full w-[1px]',
                className,
            ) }
            decorative = { decorative }
            orientation = { orientation }
            ref = { ref }
            { ...props }
        />
    ),
);
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
