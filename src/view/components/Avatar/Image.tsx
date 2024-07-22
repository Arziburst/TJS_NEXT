// Core
import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

// Tools
import { cn } from '@/tools/lib/utils';

export const Image = React.forwardRef<
React.ElementRef<typeof AvatarPrimitive.Image>,
React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
    <AvatarPrimitive.Image
        className = { cn('aspect-square h-full w-full', className) }
        ref = { ref }
        { ...props }
    />
));
Image.displayName = AvatarPrimitive.Image.displayName;
