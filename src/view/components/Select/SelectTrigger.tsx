// Core
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';

// Tools
import { cn } from '@/tools/lib/utils';

const selectTriggerVariants = cva(
    'flex w-full items-center justify-between transition',
    {
        variants: {
            variant: {
                outline: 'p-2.5 border-2 border-secondary-100',
                ghost:   `text-sm font-secondary font-semibold
                    hover:text-quaternary`,
            },
            // isArrow:
        },
        defaultVariants: {
            variant: 'outline',
        },
    },
);

interface SelectTriggerPropTypes extends
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>, VariantProps<typeof selectTriggerVariants> {
    isArrow?: true;
}

export const SelectTrigger = React.forwardRef<
React.ElementRef<typeof SelectPrimitive.Trigger>,
SelectTriggerPropTypes
>((
    {
        className,
        variant,
        isArrow,
        children,
        ...props
    },
    ref,
) => (
    <SelectPrimitive.Trigger
        className = { cn(selectTriggerVariants({ variant, className })) }
        ref = { ref }
        { ...props }>
        {children}
        {isArrow && (
            <SelectPrimitive.Icon asChild>
                <ChevronDown className = 'h-4 w-4 opacity-50' />
            </SelectPrimitive.Icon>
        )}
    </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
