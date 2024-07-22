// Core
import * as React from 'react';
import { TFunction } from 'i18next';

// Tools
import { cn } from '@/tools/lib/utils';

// Hooks
import { useFormField } from './hooks';

type Options = {
    [key: string]: string | number;
}

interface PropTypes extends React.HTMLAttributes<HTMLParagraphElement> {
    t: TFunction;
    options?: Options
}

export const FormMessage = React.forwardRef<
HTMLParagraphElement,
PropTypes
>(({
    className,
    children,
    t,
    options,
    ...props
}, ref) => {
    const { error, formMessageId } = useFormField();
    const body = error ? t(String(error?.message), options) : children;

    if (!body) {
        return null;
    }

    return (
        <p
            className = { cn('text-sm font-medium text-destructive', className) }
            id = { formMessageId }
            ref = { ref }
            { ...props }>
            {body}
        </p>
    );
});
FormMessage.displayName = 'FormMessage';
