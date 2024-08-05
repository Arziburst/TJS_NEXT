// Core
import React, { FC } from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

// Types
interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement> {}

export const Label: FC<PropTypes> = ({ children, className, ...props }) => {
    return (
        <p
            { ...props }
            className = { cn('text-sm text-[15px] font-secondary font-semibold opacity-50', className) }>
            {children}
        </p>
    );
};
