// Core
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

// Tools
import { cn } from '@/tools/lib/utils';

const titlePageVariants = cva(
    '',
    {
        variants: {
            variant: {
                default: `mb-[24px] text-[40px] leading-[54px] uppercase text-center
                    sb:mb-[40px] sb:text-[56px] sb:leading-[76px] sb:text-left`,
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

export interface TitlePageProps
    extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof titlePageVariants> {
    asChild?: boolean;
}

const TitlePage = React.forwardRef<HTMLHeadingElement, TitlePageProps>(
    ({ children, className, variant, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'h2';

        return (
            <Comp
                className = { cn(
                    titlePageVariants({ variant, className }),
                ) }
                ref = { ref }
                { ...props }>
                {children}
            </Comp>
        );
    },
);
TitlePage.displayName = 'TitlePage';

export { TitlePage, titlePageVariants };
