/* eslint-disable react/display-name */

// Core
import { cn } from '@/tools/lib/utils';
import React, { forwardRef } from 'react';
import NextImage, { ImageProps } from 'next/image'
export interface ImagePropTypes
    extends React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> {
    src: string;
    alt: string;
}

export const Image = forwardRef<HTMLImageElement, ImageProps>(({ src, className, ...props }, ref) => {
    return (
        <NextImage
            width={0}
            height={0}
            unoptimized={true}
            className={cn('block max-w-full h-auto object-cover', className)}
            ref={ref}
            src={src}
            {...props}
        />
    );
});
