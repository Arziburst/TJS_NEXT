// Core
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';

// Hooks
import { useFormField } from './hooks';

export const FormControl = React.forwardRef<
React.ElementRef<typeof Slot>,
React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

    return (
        <Slot
            aria-describedby = {
                !error
                    ? `${formDescriptionId}`
                    : `${formDescriptionId} ${formMessageId}`
            }
            aria-invalid = { !!error }
            id = { formItemId }
            ref = { ref }
            { ...props }
        />
    );
});
FormControl.displayName = 'FormControl';
