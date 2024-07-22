// Core
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

// Tools
import { cn } from '@/tools/lib/utils';

const DialogDescription = React.forwardRef<
React.ElementRef<typeof DialogPrimitive.Description>,
React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        className = { cn('text-sm text-slate-500 dark:text-slate-400', className) }
        ref = { ref }
        { ...props }
    />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { DialogDescription };
