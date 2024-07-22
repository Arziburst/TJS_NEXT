// Core
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { cva, type VariantProps } from 'class-variance-authority';

// Tools
import { cn } from '@/tools/lib/utils';

const selectContentVariants = cva(
    'flex w-full items-center justify-between transition bg-background',
    {
        variants: {
            variant: {
                outline: 'border-2 border-secondary-100',
                ghost:   'top-2',
                shadow:  'shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]',
            },
        },
        defaultVariants: {
            variant: 'shadow',
        },
    },
);

interface SelectContentPropTypes extends
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>, VariantProps<typeof selectContentVariants> {

}

export const SelectContent = React.forwardRef<
React.ElementRef<typeof SelectPrimitive.Content>,
SelectContentPropTypes
>(({ className, variant, children, position = 'popper', ...props }, ref) => (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content
            className = { cn(
                'relative z-50 overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
                position === 'popper'
                && 'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
                selectContentVariants({ variant, className }),
            ) }
            position = { position }
            ref = { ref }
            { ...props }>
            <SelectPrimitive.Viewport
                className = { cn(
                    'flex flex-col gap-2',
                    position === 'popper'
                    && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
                ) }>
                {children}
            </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

