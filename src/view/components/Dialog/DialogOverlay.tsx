// Core
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

// Tools
import { cn } from '@/tools/lib/utils';

const DialogOverlay = React.forwardRef<
React.ElementRef<typeof DialogPrimitive.Overlay>,
React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        className = { cn(
            `fixed inset-0 z-50 backdrop-blur-sm 
                data-[state=open]:animate-in data-[state=open]:fade-in-0
                data-[state=closed]:animate-out data-[state=closed]:fade-out-0`,
            className,
        ) }
        ref = { ref }
        { ...props }
    />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export { DialogOverlay };
