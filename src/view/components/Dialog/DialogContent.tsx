// Core
import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

// Tools
import { cn } from '@/tools/lib/utils';

// Components
import { DialogPortal } from './DialogPortal';
import { DialogOverlay } from './DialogOverlay';

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
            className={cn(
                `fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] gap-4 duration-200 
                    grid w-full max-w-lg p-6 bg-background
                    border-2 border-secondary-100
                    data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] 
                    md:w-full`,
                className,
            )}
            ref={ref}
            {...props}>
            {children}
            <DialogPrimitive.Close className='absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-slate-100 data-[state=open]:text-slate-500 dark:ring-offset-slate-950 dark:focus:ring-slate-300 dark:data-[state=open]:bg-slate-800 dark:data-[state=open]:text-slate-400'>
                <X className='h-4 w-4' />
                <span className='sr-only'>Close</span>
            </DialogPrimitive.Close>
        </DialogPrimitive.Content>
    </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export { DialogContent };
