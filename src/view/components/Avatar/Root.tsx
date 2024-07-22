// Core
import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

// Tools
import { cn } from '@/tools/lib/utils';

export const Root = React.forwardRef<
React.ElementRef<typeof AvatarPrimitive.Root>,
React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
    <AvatarPrimitive.Root
        className = { cn(
            'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full transition',
            className,
        ) }
        ref = { ref }
        { ...props }
    />
));
Root.displayName = AvatarPrimitive.Root.displayName;
