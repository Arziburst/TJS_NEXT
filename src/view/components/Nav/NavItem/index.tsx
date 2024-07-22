// Core
import React, { FC } from 'react';

// Tools
import { cn } from '@/tools/lib/utils';

// Elements
import { NavLink, NavLinkPropTypes } from '@/view/elements';
import { NavItemText, NavItemTextPropTypes } from './NavItemText';

// Types
export interface NavItemPropTypes extends
    React.DetailedHTMLProps<React.LiHTMLAttributes<HTMLLIElement>, HTMLLIElement> {
    href: string;
    onClickCloseSidebarHandler?: () => void;
    classNameNavLink?: NavLinkPropTypes['className'];
    classNameNavItemText?: NavItemTextPropTypes['className'];
}

export const NavItem: FC<NavItemPropTypes> = ({
    children,
    className,
    classNameNavLink,
    classNameNavItemText,
    href,
    onClickCloseSidebarHandler,
    ...props
}) => {
    return (
        <li
            { ...props }
            className = { cn('text-center', className) }>
            <NavLink
                className = { classNameNavLink }
                href = { href }
                variant = 'underline'
                onClick = { onClickCloseSidebarHandler }>
                <NavItemText className = { classNameNavItemText }>
                    {children}
                </NavItemText>
            </NavLink>
        </li>
    );
};
