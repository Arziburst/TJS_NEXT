// Core
import * as React from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

export const Shortcut = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
    return (
        <span
            className = { cn('ml-auto text-xs tracking-widest opacity-60', className) }
            { ...props }
        />
    );
};
Shortcut.displayName = 'DropdownMenuShortcut';
