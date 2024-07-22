// Core
import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { VariantProps, cva } from 'class-variance-authority';
import { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';

// Tools
import { cn } from '@/tools/lib/utils';

const variants = cva(
    '',
    {
        variants: {
            variant: {
                default: '',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

// Styles
import S from './styles.module.css';

// Types
interface PropTypes
    extends React.AllHTMLAttributes<HTMLDivElement>, VariantProps<typeof variants> {
    t: TFunction;
    asChild?: boolean;
    count?: number;
    isLoading: boolean;
    firstElement?: React.ReactNode;
    textIfNotData?: string;
}


const NotData = React.forwardRef<HTMLDivElement, PropTypes>(
    ({
        children,
        className,
        variant,
        t,
        count = 1,
        isLoading,
        asChild = false,
        firstElement,
        textIfNotData,
        ...props
    }, ref) => {
        const Comp = asChild ? Slot : 'div';

        const childCount = React.Children.count(children);

        if (isLoading) {
            return (
                <div className = { cn(S.root, className) }>
                    <Loader2 className = 'mr-2 h-[100px] w-[100px] animate-spin stroke-quaternary' />
                </div>
            );
        }

        if (childCount < count) {
            return (
                <div className = { cn('flex flex-col items-center', className) }>
                    <div className = { S.root }>
                        {textIfNotData || t('components.notData') }
                    </div>
                    {firstElement}
                </div>
            );
        }

        return (
            <Comp
                className = { cn(variants({ variant, className })) }
                ref = { ref }
                { ...props }>
                {firstElement}
                {children}
            </Comp>
        );
    },
);
NotData.displayName = 'NotData';

export { NotData };
