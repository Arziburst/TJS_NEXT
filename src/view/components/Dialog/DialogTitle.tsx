// Core
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

// Tools
import { cn } from '@/tools/lib/utils';

const DialogTitle = React.forwardRef<
React.ElementRef<typeof DialogPrimitive.Title>,
React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        className = { cn(
            'text-lg font-semibold leading-none tracking-tight',
            className,
        ) }
        ref = { ref }
        { ...props }
    />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export { DialogTitle };
