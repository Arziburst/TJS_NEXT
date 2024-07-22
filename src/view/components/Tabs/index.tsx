// Core
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/tools/lib/utils';

// const Root = TabsPrimitive.Root;

const Root = React.forwardRef<
React.ElementRef<typeof TabsPrimitive.Root>,
React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ children, className, ...props }, ref) => (
    <TabsPrimitive.Root
        className = { cn(
            'flex flex-col items-center justify-center',
            className,
        ) }
        ref = { ref }
        { ...props }>
        {children}
    </TabsPrimitive.Root>
));
Root.displayName = TabsPrimitive.Root.displayName;

const List = React.forwardRef<
React.ElementRef<typeof TabsPrimitive.List>,
React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
    <TabsPrimitive.List
        className = { cn(
            'inline-flex items-center justify-center p-1',
            className,
        ) }
        ref = { ref }
        { ...props }
    />
));
List.displayName = TabsPrimitive.List.displayName;

const Trigger = React.forwardRef<
React.ElementRef<typeof TabsPrimitive.Trigger>,
React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
    <TabsPrimitive.Trigger
        className = { cn(
            `inline-flex items-center justify-center 
                px-3 py-1.5 
                font-secondary font-semibold whitespace-nowrap
                ring-offset-background transition-all 
                hover:opacity-70
                active:opacity-100
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 
                disabled:pointer-events-none disabled:opacity-50 
                data-[state=active]:text-quaternary data-[state=active]:border-b-2 data-[state=active]:border-quaternary`,
            className,
        ) }
        ref = { ref }
        { ...props }
    />
));
Trigger.displayName = TabsPrimitive.Trigger.displayName;

const Content = React.forwardRef<
React.ElementRef<typeof TabsPrimitive.Content>,
React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
    <TabsPrimitive.Content
        className = { cn(
            'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            className,
        ) }
        ref = { ref }
        { ...props }
    />
));
Content.displayName = TabsPrimitive.Content.displayName;

export const Tabs = {
    Root,
    List,
    Trigger,
    Content,
};
