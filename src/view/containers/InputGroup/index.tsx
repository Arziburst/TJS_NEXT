// Core
import React, { FC } from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

// Types
interface PropTypes extends React.DetailedHTMLProps<React.FormHTMLAttributes<HTMLFormElement>, HTMLFormElement> {}

export const InputGroup: FC<PropTypes> = ({ children, className, ...props }) => {
    return (
        <form
            className = { cn('space-y-4 sb:space-y-5', className) }
            { ...props }>
            {children}
        </form>
    );
};
