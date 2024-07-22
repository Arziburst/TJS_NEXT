// Core
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';

// Tools
import { cn } from '@/tools/lib/utils';

export const SelectSeparator = React.forwardRef<
React.ElementRef<typeof SelectPrimitive.Separator>,
React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.Separator
        className = { cn('-mx-1 my-1 h-px bg-muted', className) }
        ref = { ref }
        { ...props }
    />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;
