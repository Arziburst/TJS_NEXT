// Core
import * as React from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

const DialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className = { cn(
            '',
            className,
        ) }
        { ...props }
    />
);
DialogFooter.displayName = 'DialogFooter';

export { DialogFooter };
