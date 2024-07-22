// Core
import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

// Tools
import { cn } from '@/tools/lib/utils';
import { Button, ButtonProps } from '@/view/elements';

export const Item = React.forwardRef<
React.ElementRef<typeof DropdownMenuPrimitive.Item>,
React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    propsButton?: Omit<ButtonProps, 'className' | 'variant'>;
}
>(({
    children,
    className,
    propsButton,
    ...props
}, ref) => (
    <DropdownMenuPrimitive.Item
        asChild
        className = { cn(
            `relative flex justify-center items-center
                text-sm
                data-[disabled]:pointer-events-none data-[disabled]:opacity-50`,
            className,
        ) }
        ref = { ref }
        { ...props }>
        <Button
            className = 'text-xs py-1 sb:text-xs'
            variant = 'outline'
            { ...propsButton }>
            {children}
        </Button>
    </DropdownMenuPrimitive.Item>
));
Item.displayName = DropdownMenuPrimitive.Item.displayName;
