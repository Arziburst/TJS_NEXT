// Core
import React, { FC } from 'react';
import { TFunction } from 'i18next';

// Book
import { BOOK } from '@/lib/book';

// Tools
import { cn } from '@/tools/lib/utils';

// Components
import { NavItem, NavItemPropTypes } from '@/view/components/Nav/NavItem';
// import { useCart } from '@/bus/cart';

// Types
interface PropTypes extends Omit<NavItemPropTypes, 'children' | 'href'> {
    t: TFunction;
}

export const ButtonCart: FC<PropTypes> = ({ className, t, ...props }) => {
    // const { cart } = useCart();

    // const getNumber = () => {
    //     if (cart && cart.length > 0) {
    //         if (cart.length < 9) {
    //             return `(0${cart.length})`;
    //         }

    //         return `(${cart.length})`;
    //     }

    //     return '';
    // };

    return (
        <NavItem
            classNameNavItemText = { cn(
                'text-xs capitalize not-italic',
                className,
            ) }
            href = { BOOK.CART }
            { ...props }>
            {`${t('pages.cart.root')} ${/* getNumber() */0}`}
        </NavItem>
    );
};
