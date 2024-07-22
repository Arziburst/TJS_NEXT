// Core
import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

// Tools
import { cn } from '@/tools/lib/utils';

export const Fallback = React.forwardRef<
React.ElementRef<typeof AvatarPrimitive.Fallback>,
React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
    <AvatarPrimitive.Fallback
        className = { cn(
            'flex h-full w-full items-center justify-center rounded-full bg-transparent uppercase',
            className,
        ) }
        ref = { ref }
        { ...props }
    />
));
Fallback.displayName = AvatarPrimitive.Fallback.displayName;
