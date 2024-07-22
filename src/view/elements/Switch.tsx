// Core
import * as React from 'react';
import * as SwitchPrimitives from '@radix-ui/react-switch';

// Tools
import { cn } from '@/tools/lib/utils';

const Switch = React.forwardRef<
React.ElementRef<typeof SwitchPrimitives.Root>,
React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ children, className, ...props }, ref) => (
    <SwitchPrimitives.Root
        className = { cn(
            `peer inline-flex h-[44px] w-[250px] shrink-0 cursor-pointer items-center rounded-full border-2 border-secondary-100 transition
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 focus-visible:ring-offset-white 
                disabled:cursor-not-allowed disabled:opacity-50`,
            className,
        ) }
        { ...props }
        ref = { ref }>
        <SwitchPrimitives.Thumb
            className = { cn(
                `flex justify-center items-center pointer-events-none h-[40px] w-[110px] rounded-full ring-0 transition
                    data-[state=checked]:translate-x-0 data-[state=checked]:bg-quinary-100
                    data-[state=unchecked]:translate-x-[136px] data-[state=unchecked]:bg-quaternary`,
            ) }>
            <span className = 'px-2 text-sm text-background overflow-hidden text-ellipsis whitespace-nowrap'>
                {children}
            </span>
        </SwitchPrimitives.Thumb>
    </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
