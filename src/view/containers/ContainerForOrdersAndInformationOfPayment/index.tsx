// Core
import React, { FC } from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

// Types
interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
    /* type props here */
}

export const ContainerForOrdersAndInformationOfPayment: FC<PropTypes> = ({ children, className, ...props }) => {
    return (
        <div
            { ...props }
            className = { cn(
                `flex flex-col gap-[32px]
                    sb:flex-row sb:gap-10
                    xl:gap-[100px]`,
                className,
            ) }>
            {children}
        </div>
    );
};
