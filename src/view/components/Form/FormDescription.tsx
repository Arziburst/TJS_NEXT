// Core
import * as React from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

// Hooks
import { useFormField } from './hooks';

export const FormDescription = React.forwardRef<
HTMLParagraphElement,
React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
    const { formDescriptionId } = useFormField();

    return (
        <p
            className = { cn('text-sm text-muted-foreground', className) }
            id = { formDescriptionId }
            ref = { ref }
            { ...props }
        />
    );
});
FormDescription.displayName = 'FormDescription';
