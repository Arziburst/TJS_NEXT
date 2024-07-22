// Core
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

// Tools
import { cn } from '@/tools/lib/utils';

export const Label = React.forwardRef<
React.ElementRef<typeof DropdownMenuPrimitive.Label>,
React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
}
>(({ className, inset, ...props }, ref) => (
    <DropdownMenuPrimitive.Label
        className = { cn(
            'px-2 py-1.5 text-sm font-semibold',
            inset && 'pl-8',
            className,
        ) }
        ref = { ref }
        { ...props }
    />
));
Label.displayName = DropdownMenuPrimitive.Label.displayName;
