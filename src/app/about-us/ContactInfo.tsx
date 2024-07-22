// Core
import { cn } from '@/tools/lib/utils';
import React, { FC } from 'react';

// Types
interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
    title: string;
    link: string;
    linkText: string;
}

export const ContactInfo: FC<PropTypes> = ({
    title,
    link,
    linkText,
    className,
    ...props
}) => {
    return (
        <div
            { ...props }
            className = { cn('flex flex-col sb:gap-[4px]', className) }>
            <p className = 'text-sm text-quaternary font-tertiary font-medium capitalize'>
                {title}:
            </p>
            <a
                className = { `text-sm text-quaternary font-secondary font-medium tracking-[1.4px] uppercase
                    hover:underline` }
                href = { link }>
                {linkText}
            </a>
        </div>
    );
};
