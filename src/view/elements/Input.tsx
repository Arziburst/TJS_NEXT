import * as React from 'react';

import { cn } from '@/tools/lib/utils';

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> {
    isValidate?: boolean;
}

type GetInputClassName = {
    className?: string;
    isValidate?: boolean;
}

export const getInputClassName = ({ className, isValidate }: GetInputClassName): string => {
    return cn(
        `flex w-full border-2 border-secondary-100 p-2.5 bg-transparent
            text-sm font-tertiary
            file:border-0 file:bg-transparent file:text-sm file:font-medium 
            placeholder:text-secondary-100 placeholder:opacity-50
            hover:opacity-70
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 
            disabled:cursor-not-allowed disabled:opacity-50`,
        { 'border-quaternary': isValidate },
        className,
    );
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, isValidate, type, ...props }, ref) => {
        return (
            <input
                className = { getInputClassName({ className, isValidate }) }
                ref = { ref }
                type = { type }
                { ...props }
            />
        );
    },
);
Input.displayName = 'Input';

export { Input };
