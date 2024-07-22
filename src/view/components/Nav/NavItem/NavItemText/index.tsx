// Core
import React, { FC } from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

// Types
export interface NavItemTextPropTypes extends
    React.DetailedHTMLProps<React.HTMLAttributes<HTMLSpanElement>, HTMLSpanElement> {}

export const NavItemText: FC<NavItemTextPropTypes> = ({
    children,
    className,
    ...props
}) => {
    return (
        <span
            { ...props }
            className = { cn(
                `text-center text-base font-secondary font-semibold capitalize tracking-[1.6px] italic
                sb:text-sm sb:not-italic`,
                className,
            ) }>
            {children}
        </span>
    );
};
