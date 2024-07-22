/* eslint-disable react/display-name */
// Core
import React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cva, type VariantProps } from 'class-variance-authority';

// Elements
import { Root } from './Root';
import { Image } from './Image';
import { Fallback } from './Fallback';
import { cn } from '@/tools/lib/utils';


const avatarVariants = cva(
    'active:scale-[0.8] transition cursor-pointer',
    {
        variants: {
            variant: {
                outline: `bg-transparent text-secondary-100
                    hover:bg-secondary-100 hover:text-background
                    focus-visible:bg-transparent focus-visible:text-secondary-100
                `,
            },
        },
        defaultVariants: {
            variant: 'outline',
        },
    },
);

// Types
interface PropTypes extends
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>, VariantProps<typeof avatarVariants>
{
    src?: string;
    alt?: string;
    fallback: string;
}

export const Avatar = React.forwardRef<
React.ElementRef<typeof AvatarPrimitive.Root>,
PropTypes
>(({
    className,
    variant,
    src,
    alt,
    fallback,
    ...props
}, ref) => {
    if (fallback.length > 2) {
        throw new Error('Fallback must be 2 characters or less');
    }
    if (src && !alt) {
        throw new Error('Alt must be provided if using an image avatar');
    }

    return (
        <Root
            className = { cn(avatarVariants({ variant, className }), { 'border-2 border-secondary-100': !src }) }
            ref = { ref }
            { ...props }>
            <Image
                alt = { alt }
                src = { src }
            />
            <Fallback>
                {fallback}
            </Fallback>
        </Root>
    );
});
