/* eslint-disable react/display-name */

// Core
import { cn } from '@/tools/lib/utils';
import React, { forwardRef } from 'react';
import NextImage from 'next/image'

// Types
export interface ImagePropTypes {
    src: string;
    alt: string;
    className: string;
    fill?: boolean
}

export const Image = forwardRef<HTMLImageElement, ImagePropTypes>(({ src, className, ...props }, ref) => {
    return (
        <NextImage
            className = { cn('block max-w-full h-auto object-cover', className) }
            ref = { ref }
            src = { src }
            { ...props }
        />
    );
});
