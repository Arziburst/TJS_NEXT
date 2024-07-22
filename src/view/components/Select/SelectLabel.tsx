// Core
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';

// Tools
import { cn } from '@/tools/lib/utils';

export const SelectLabel = React.forwardRef<
React.ElementRef<typeof SelectPrimitive.Label>,
React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
    <SelectPrimitive.Label
        className = { cn('py-1.5 pl-8 pr-2 text-sm font-semibold', className) }
        ref = { ref }
        { ...props }
    />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;
