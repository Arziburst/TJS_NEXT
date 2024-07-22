// Core
import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { VariantProps, cva } from 'class-variance-authority';

// Tools
import { cn } from '@/tools/lib/utils';

const moveUnderlineVariants = cva(
    `transition relative overflow-hidden pb-1 inline-block
        hover:text-quaternary
        after:content-[\'\'] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-quaternary after:translate-x-[-150%] after:transition after:duration-500
            hover:after:translate-x-[0%]`,
    {
        variants: {
            variant: {
                move: `before:content-[\'\'] before:absolute before:bottom-0 before:left-0 before:w-full before:h-[2px] before:bg-quaternary before:transition before:duration-500
                    hover:before:translate-x-[150%]`,
                skipFirstLine: '',
            },
        },
        defaultVariants: {
            variant: 'move',
        },
    },
);

// Types
export interface PropTypes
    extends React.AllHTMLAttributes<HTMLButtonElement>, VariantProps<typeof moveUnderlineVariants> {
    asChild?: boolean;
}


const MoveUnderline = React.forwardRef<HTMLSpanElement, PropTypes>(
    ({ children, className, variant, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'span';

        return (
            <Comp
                className = { cn(moveUnderlineVariants({ variant, className })) }
                ref = { ref }
                { ...props }>
                {children}
            </Comp>
        );
    },
);
MoveUnderline.displayName = 'Span';

export { MoveUnderline };
