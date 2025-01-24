'use client'

// Core
import React, { FC, useEffect, useRef } from 'react';
import { cva } from 'class-variance-authority';

// Tools
import { cn } from '@/tools/lib/utils';
import { useCartSaga } from '@/bus/cart/saga';
import { useProfileSaga } from '@/bus/profile/saga';
import { BOOK, LOCAL_STORAGE } from '@/lib';
import { ls } from '@/tools/utils';
import { redirect, usePathname } from 'next/navigation';
import { useTogglesRedux } from '@/bus/client/toggles';

export const wrapperVariants = cva(
    'px-[16px] sm:px-[32px] md:px-[40px] sb:px-[56px] max-w-[2000px] mx-auto',
);

// Types
interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> { }

export const Wrapper: FC<PropTypes> = ({
    children,
    className,
    ...props
}) => {
    const { fetchAuthenticateProfile } = useProfileSaga();
    const { fetchCheckCart } = useCartSaga();
    const { togglesRedux: { isLoggedIn } } = useTogglesRedux();
    const pathname = usePathname();

    useEffect(() => {
        fetchAuthenticateProfile()
        if (pathname !== BOOK.PAYMENT_SUCCESS) {
            fetchCheckCart(ls.get(LOCAL_STORAGE.CART) || []);
        }
    }, []);

    useEffect(() => {
        if (isLoggedIn && pathname === BOOK.LOGIN) {
            redirect(BOOK.ROOT);
        }
    });

    return (
        <div
            {...props}
            className={cn(wrapperVariants({ className }))}>
            {children}
        </div>
    );
};
