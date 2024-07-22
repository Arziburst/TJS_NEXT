// Core
import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

// Tools
import { cn } from '@/tools/lib/utils';

// Types
type PropTypesScrollArea = {
    propViewport: ScrollAreaPrimitive.ScrollAreaScrollbarProps;
}

const ScrollBar = React.forwardRef<
React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
        className = { cn(
            'flex touch-none select-none transition-colors',
            orientation === 'vertical'
            && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
            orientation === 'horizontal'
            && 'h-2.5 border-t border-t-transparent p-[1px]',
            className,
        ) }
        orientation = { orientation }
        ref = { ref }
        { ...props }>
        <ScrollAreaPrimitive.ScrollAreaThumb
            className = { cn(
                'relative rounded-full bg-quaternary',
                orientation === 'vertical' && 'flex-1',
            ) }
        />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

const ScrollArea = React.forwardRef<
React.ElementRef<typeof ScrollAreaPrimitive.Root>,
React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & PropTypesScrollArea
>(({
    propViewport: {
        className: classNamePropViewport,
        ...propViewport
    },
    className,
    children,
    ...props
}, ref) => (
    <ScrollAreaPrimitive.Root
        className = { cn('relative overflow-hidden', className) }
        ref = { ref }
        { ...props }>
        <ScrollAreaPrimitive.Viewport
            { ...propViewport }
            className = { cn('h-full w-full rounded-[inherit]', classNamePropViewport) }>
            {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export { ScrollArea, ScrollBar };
