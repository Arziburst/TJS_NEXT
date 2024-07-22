// Core
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

// Tools
import { cn } from '@/tools/lib/utils';

const buttonVariants = cva(
    `w-full inline-flex items-center justify-center text-sm font-primary ring-offset-background transition transaction
        focus-visible:outline-none
        hover:opacity-70
        focus-visible:opacity-70
        active:opacity-100 active:scale-[0.95]
        disabled:opacity-50`,
    {
        variants: {
            variant: {
                default: '',
                contain: `font-secondary text-sm py-5 border-2 border-secondary-100 
                    text-primary-200 bg-secondary-100 
                    hover:text-secondary-100 hover:bg-transparent hover:opacity-100
                    focus-visible:text-secondary-100 focus-visible:bg-transparent hover:opacity-100
                    active:scale-[0.95]
                    sb:text-base`,
                outline: `font-secondary text-sm py-5 border-2 border-secondary-100 
                    text-secondary-100 bg-transparent 
                    hover:text-background hover:bg-secondary-100 hover:opacity-100
                    focus-visible:text-background focus-visible:bg-secondary-100 hover:opacity-100
                    sb:text-base`,
            },
        },
        defaultVariants: {
            variant: 'contain',
        },
    },
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ children, disabled, className, variant, isLoading, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';

        const isDisabled = disabled || isLoading;

        return (
            <Comp
                className = { cn(
                    buttonVariants({ variant, className }),
                    {
                        'cursor-wait':        isLoading,
                        'cursor-not-allowed': disabled,
                    },
                ) }
                disabled = { isDisabled }
                ref = { ref }
                { ...props }>
                {isLoading && (
                    <Loader2 className = 'mr-2 h-4 w-4 animate-spin' />
                )}
                {children}
            </Comp>
        );
    },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
