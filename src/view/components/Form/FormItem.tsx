// Core
import * as React from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

// Contexts
import { FormItemContext } from './contexts';

export const FormItem = React.forwardRef<
HTMLDivElement,
React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
    const id = React.useId();

    return (
        <FormItemContext.Provider value = {{ id }}>
            <div
                className = { cn('space-y-2', className) }
                ref = { ref }
                { ...props }
            />
        </FormItemContext.Provider>
    );
});
FormItem.displayName = 'FormItem';
