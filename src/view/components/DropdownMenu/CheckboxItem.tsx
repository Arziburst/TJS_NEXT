// Core
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check } from 'lucide-react';

// Tools
import { cn } from '@/tools/lib/utils';

export const CheckboxItem = React.forwardRef<
React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
    <DropdownMenuPrimitive.CheckboxItem
        checked = { checked }
        className = { cn(
            'relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
            className,
        ) }
        ref = { ref }
        { ...props }>
        <span className = 'absolute left-2 flex h-3.5 w-3.5 items-center justify-center'>
            <DropdownMenuPrimitive.ItemIndicator>
                <Check className = 'h-4 w-4' />
            </DropdownMenuPrimitive.ItemIndicator>
        </span>
        {children}
    </DropdownMenuPrimitive.CheckboxItem>
));
CheckboxItem.displayName
    = DropdownMenuPrimitive.CheckboxItem.displayName;
