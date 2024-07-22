// Core
import * as React from 'react';

// Tools
import { getInputClassName } from './Input';
import { cn } from '@/tools/lib/utils';

// Types
export interface TextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    isValidate?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, isValidate, ...props }, ref) => {
        return (
            <textarea
                className = { cn('min-h-[44px] max-h-[150px]', getInputClassName({ className, isValidate })) }
                ref = { ref }
                { ...props }
            />
        );
    },
);
Textarea.displayName = 'Textarea';

export { Textarea };
