// Core
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

// Tools
import { cn } from '@/tools/lib/utils';

export const Separator = React.forwardRef<
React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Separator
        className = { cn('-mx-1 my-1 h-px bg-border', className) }
        ref = { ref }
        { ...props }
    />
));
Separator.displayName = DropdownMenuPrimitive.Separator.displayName;
