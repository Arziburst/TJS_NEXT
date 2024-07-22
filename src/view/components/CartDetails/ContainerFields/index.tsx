// Core
import React, { FC } from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

// Types
interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> {}

export const ContainerFields: FC<PropTypes> = ({ className, ...props }) => {
    return (
        <div
            { ...props }
            className = { cn(
                `flex flex-col flex-wrap gap-[16px]
                    3xl:flex-row 3xl:gap-[20px]
                    3xl:[&>*]:w-[calc(50%-10px)]`,
                className,
            ) }>

        </div>

    );
};
