// Core
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cva, type VariantProps } from 'class-variance-authority';

// Tools
import { cn } from '@/tools/lib/utils';

const selectItemVariants = cva(
    `relative flex cursor-default select-none items-center text-sm outline-none transition
        hover:opacity-70
        focus-visible:opacity-70
        active:opacity-100
        data-[disabled]:pointer-events-none data-[disabled]:opacity-50`,
    {
        variants: {
            variant: {
                ghost: `font-secondary font-semibold 
                    data-[state=checked]:text-quaternary`,
                contain: `p-3 text-base font-tertiary font-medium
                    hover:text-background hover:bg-secondary-100
                    data-[state=checked]:text-background data-[state=checked]:bg-secondary-100`,
            },
        },
        defaultVariants: {
            variant: 'ghost',
        },
    },
);

interface SelectItemPropTypes extends
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>, VariantProps<typeof selectItemVariants> {

}

export const SelectItem = React.forwardRef<
React.ElementRef<typeof SelectPrimitive.Item>,
SelectItemPropTypes
>(({ variant, className, children, ...props }, ref) => (
    <SelectPrimitive.Item
        className = { cn(selectItemVariants({ variant, className })) }
        ref = { ref }
        { ...props }>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
