/* eslint-disable react/display-name */ // TODO

// Core
import React, { forwardRef } from 'react';
import { cva } from 'class-variance-authority';

// Tools
import { cn } from '@/tools/lib/utils';

export const wrapperVariants = cva(
    'px-[16px] sm:px-[32px] md:px-[40px] sb:px-[56px] max-w-[2000px] mx-auto',
);

// Types
interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> {}

export const Wrapper = forwardRef<HTMLDivElement, PropTypes>(({
    children,
    className,
    ...props
}, ref) => {
    return (
        <div
            ref = { ref }
            { ...props }
            className = { cn(wrapperVariants({ className })) }>
            {children}
        </div>
    );
});
