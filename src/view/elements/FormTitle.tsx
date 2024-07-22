// Core
import React, { FC } from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

// Types
interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement> {}

export const FormTitle: FC<PropTypes> = ({ children, className, ...props }) => {
    return (
        <p
            className = { cn(
                `text-2xl mb-[18px] tracking-[10%]
                    sb:mb-[24px]`,
                className,
            ) }
            { ...props }>
            {children}
        </p>
    );
};
