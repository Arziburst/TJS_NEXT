// Core
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';

// Hooks
import { useFormField } from './hooks';

// Tools
import { cn } from '@/tools/lib/utils';

// Elements
import { Label } from '@/view/elements';

export const FormLabel = React.forwardRef<
React.ElementRef<typeof LabelPrimitive.Root>,
React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
    const { error, formItemId } = useFormField();

    return (
        <Label
            className = { cn(error && 'text-destructive', 'text-base tracking-[10%]', className) }
            htmlFor = { formItemId }
            ref = { ref }
            { ...props }
        />
    );
});
FormLabel.displayName = 'FormLabel';
