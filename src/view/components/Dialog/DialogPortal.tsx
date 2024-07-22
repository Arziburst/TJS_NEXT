// Core
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

export const DialogPortal = ({
    // className,
    ...props
}: DialogPrimitive.DialogPortalProps) => (
    <DialogPrimitive.Portal
        // className = { cn(className) }
        { ...props }
    />
);
DialogPortal.displayName = DialogPrimitive.Portal.displayName;
