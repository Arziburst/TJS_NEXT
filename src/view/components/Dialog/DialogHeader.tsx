// Core
import * as React from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className = { cn(
            'flex flex-col space-y-1.5 text-center sm:text-left',
            className,
        ) }
        { ...props }
    />
);
DialogHeader.displayName = 'DialogHeader';

export { DialogHeader };
