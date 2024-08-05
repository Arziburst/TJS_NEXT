// Core
import React, { FC } from 'react';
import { LinkProps } from 'next/link'

// Tools
import { clsx, cn } from '@/tools/lib/utils';

// Book
import { BOOK } from '@/lib/book';

// Elements
import { Link } from '@/view/elements';

// Types
interface PropTypes extends Omit<LinkProps, 'href'> {
    variant: 'mobile' | 'desktop';
    className?: string
}

export const Logo: FC<PropTypes> = ({ variant, className, ...props }) => {
    const isMobile = variant === 'mobile';

    return (
        <Link
            className = { cn(
                [
                    `uppercase text-sm font-secondary font-bold text-secondary-100
                    hover:opacity-70`,
                ],
                { 'text-xs': isMobile },
                { 'text-sm': !isMobile },
                className,
            ) }
            { ...props }
            href = { BOOK.ROOT }>
            {isMobile ? 'TJS' : 'Trend Jewelry Store'}
        </Link>
    );
};

// export const Logo: FC<any> = forwardRef(({ variant, ...props }, forwardRefProp) => {
//     const isMobile = variant === 'mobile';

//     return (
//         <Link
//             className = { cn(
//                 [
//                     `uppercase text-sm font-secondary text-secondary-100
//                     hover:opacity-70`,
//                 ],
//                 { 'text-xs': isMobile },
//                 { 'text-sm': !isMobile },
//             ) }
//             { ...props }
//             ref = { forwardRefProp }
//             href = { BOOK.SHOP }>
//             {/* href = { BOOK.ROOT }> */}
//             {isMobile ? 'TJS' : 'Trend Jewelry Store'}
//         </Link>
//     );
// });
