// Core
import React, { FC } from 'react';
import NextLink, { LinkProps } from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';

// Tools
import { cn } from '@/tools/lib/utils';

const linkVariants = cva(
    '',
    {
        variants: {
            variant: {
                default: `hover:opacity-70
                    focus-visible:opacity-70
                    active:opacity-100`,
                none: '',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

export interface LinkPropTypes extends LinkProps, VariantProps<typeof linkVariants> {
    children: any
    className?: any
}

export const Link: FC<LinkPropTypes> = ({ children, className, variant, ...props }) => {
    return (
        <NextLink
            className = { cn(linkVariants({ variant, className })) }
            { ...props }>
            {children}
        </NextLink>
    );
};
