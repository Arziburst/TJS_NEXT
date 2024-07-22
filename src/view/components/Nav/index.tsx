// Core
import React, { FC } from 'react';
import { TFunction, i18n } from 'i18next';

// Init
import { CATEGORIES_ITEMS, LANGUAGES, LOCAL_STORAGE } from '@/lib';

// BOOK
import { BOOK } from '@/lib/book';

// Tools
import { cn } from '@/tools/lib/utils';

// Components
import { NavItem } from './NavItem';
import { NavItemText } from './NavItem/NavItemText';

// Elements
import { Button, NavLink } from '@/view/elements';

// UI
import { ButtonSignInAndUp, Select } from '@/view/components';

// Static
import { NAV_LEFT, NAV_RIGHT } from './static';

// Styles
import S from './styles.module.css';
import { ls, transformPathToTranslation } from '@/tools/utils';

// Types
interface NavPropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
    variant: 'mobile' | 'desktop';
    t: TFunction;
    i18n: i18n;
    onClickCloseSideBar?: () => void;
}

export const Nav: FC<NavPropTypes> = ({
    className,
    variant,
    t,
    i18n,
    onClickCloseSideBar,
    ...props
}) => {
    const isMobile = variant === 'mobile';

    const onClickCloseSidebarHandler = () => {
        onClickCloseSideBar && onClickCloseSideBar();
    };

    const onClickLanguageHandler = (language: typeof LANGUAGES[number]) => {
        ls.set(LOCAL_STORAGE.LANGUAGE, language);
        i18n.changeLanguage(language);
    };

    const listPageRightNav = () => NAV_RIGHT.map((navItem) => (
        <NavItem
            className = { cn(
                {
                    'text-right': !isMobile,
                },
            ) }
            key = { navItem }
            href = { navItem }
            onClickCloseSidebarHandler = { onClickCloseSidebarHandler }>
            {t(`pages.${transformPathToTranslation(navItem)}.root`)}
        </NavItem>
    ));

    return (
        <nav
            className = { cn(
                'grow h-full',
                {
                    [ 'flex gap-x-between-items-of-header' ]: !isMobile,
                },
                className,
            ) }
            { ...props }>
            <ul className = { cn({
                'flex flex-col justify-evenly gap-[20px] h-full nav': isMobile,
                'flex justify-between w-full':                        !isMobile,
            }) }>
                <li>
                    <ul>
                        {NAV_LEFT.map((navItem) => (
                            <NavItem
                                key = { navItem }
                                href = { navItem }
                                onClickCloseSidebarHandler = { onClickCloseSidebarHandler }>
                                {t(`pages.${transformPathToTranslation(navItem)}.root`)}
                            </NavItem>
                        ))}
                        {isMobile && (
                            <li className = { 'flex justify-center' }>
                                <ul>
                                    {CATEGORIES_ITEMS.map((category) => {
                                        const rightCategory = t(`categories.${category}`);

                                        return (
                                            <li
                                                className = 'flex items-center'
                                                key = { category }>
                                                <svg
                                                    fill = 'none'
                                                    height = '20'
                                                    viewBox = '0 0 20 20'
                                                    width = '20'
                                                    xmlns = 'http://www.w3.org/2000/svg'>
                                                    <path
                                                        d = 'M4.99781 16.36C4.92315 16.36 4.80181 16.2293 4.63381 15.968L4.15781 15.184C3.87781 14.736 3.73781 14.4093 3.73781 14.204C3.73781 13.9987 3.83115 13.7933 4.01781 13.588C4.20448 13.364 4.29781 13.1867 4.29781 13.056C4.29781 12.832 4.18581 12.72 3.96181 12.72C3.83115 12.72 3.65381 12.8133 3.42981 13C3.22448 13.1867 3.01915 13.28 2.81381 13.28C2.60848 13.28 2.28181 13.14 1.83381 12.86L1.04981 12.384C0.788479 12.216 0.657813 12.0947 0.657813 12.02C0.657813 11.9453 0.788479 11.824 1.04981 11.656L1.83381 11.18C2.28181 10.9 2.60848 10.76 2.81381 10.76C3.01915 10.76 3.22448 10.8533 3.42981 11.04C3.65381 11.2267 3.83115 11.32 3.96181 11.32C4.18581 11.32 4.29781 11.208 4.29781 10.984C4.29781 10.8533 4.20448 10.6853 4.01781 10.48C3.83115 10.256 3.73781 10.0413 3.73781 9.836C3.73781 9.63067 3.87781 9.304 4.15781 8.856L4.63381 8.072C4.80181 7.81067 4.92315 7.68 4.99781 7.68C5.07248 7.68 5.19381 7.81067 5.36181 8.072L5.83781 8.856C6.11781 9.304 6.25781 9.63067 6.25781 9.836C6.25781 10.0413 6.16448 10.256 5.97781 10.48C5.79115 10.6853 5.69781 10.8533 5.69781 10.984C5.69781 11.208 5.80981 11.32 6.03381 11.32C6.16448 11.32 6.33248 11.2267 6.53781 11.04C6.76181 10.8533 6.97648 10.76 7.18181 10.76C7.38715 10.76 7.71381 10.9 8.16181 11.18L8.94581 11.656C9.20715 11.824 9.33781 11.9453 9.33781 12.02C9.33781 12.0947 9.20715 12.216 8.94581 12.384L8.16181 12.86C7.71381 13.14 7.38715 13.28 7.18181 13.28C6.97648 13.28 6.76181 13.1867 6.53781 13C6.33248 12.8133 6.16448 12.72 6.03381 12.72C5.80981 12.72 5.69781 12.832 5.69781 13.056C5.69781 13.1867 5.79115 13.364 5.97781 13.588C6.16448 13.7933 6.25781 13.9987 6.25781 14.204C6.25781 14.4093 6.11781 14.736 5.83781 15.184L5.36181 15.968C5.19381 16.2293 5.07248 16.36 4.99781 16.36ZM4.99781 12.664C5.16581 12.664 5.31515 12.608 5.44581 12.496C5.57648 12.3653 5.64181 12.2067 5.64181 12.02C5.64181 11.8333 5.57648 11.684 5.44581 11.572C5.31515 11.4413 5.16581 11.376 4.99781 11.376C4.82981 11.376 4.68048 11.4413 4.54981 11.572C4.41915 11.684 4.35381 11.8333 4.35381 12.02C4.35381 12.2067 4.41915 12.3653 4.54981 12.496C4.68048 12.608 4.82981 12.664 4.99781 12.664ZM33.392 9.556C34.68 9.85467 35.772 10.4707 36.668'
                                                        fill = '#635A59'
                                                    />
                                                </svg>
                                                <NavLink
                                                    className = { S.nav__item_category }
                                                    href = { `${BOOK.SHOP}/${category}` }
                                                    onClick = { onClickCloseSidebarHandler }>
                                                    <span>{rightCategory[ 0 ]}</span>{rightCategory.substring(1)}
                                                </NavLink>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </li>
                        )}
                    </ul>
                </li>
                {isMobile ? listPageRightNav() : (
                    <li>
                        <ul>
                            {listPageRightNav()}
                        </ul>
                    </li>
                )}
                {isMobile && (
                    <li className = { 'text-center' }>
                        <NavItemText>
                            {t('components.nav.language')}
                        </NavItemText>
                        <ul className = { 'flex justify-evenly' }>
                            {LANGUAGES.map((language) => (
                                <li key = { language }>
                                    <Button
                                        variant = 'default'
                                        onClick = { () => onClickLanguageHandler(language) }>
                                        <span className = { cn(
                                            'text-base font-secondary font-semibold uppercase',
                                            { 'text-quaternary': i18n.language === language },
                                        ) }>
                                            {language}
                                        </span>
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </li>
                )}
                {isMobile && (
                    <ButtonSignInAndUp
                        isMobile
                        className = 'flex justify-center'
                        t = { t }
                    />
                )}
            </ul>
            {!isMobile && (
                <div>
                    <Select.Root onValueChange = { onClickLanguageHandler }>
                        <Select.SelectTrigger
                            variant = 'ghost'>
                            <Select.SelectValue
                                placeholder = { i18n.language.toUpperCase() }
                            />
                        </Select.SelectTrigger>
                        <Select.SelectContent variant = 'ghost'>
                            {LANGUAGES.map((language) => (
                                <Select.SelectItem
                                    className = { cn('', {
                                        'text-quaternary': i18n.language === language,
                                    }) }
                                    key = { language }
                                    value = { language }>
                                    {language.toUpperCase()}
                                </Select.SelectItem>
                            ))}
                        </Select.SelectContent>
                    </Select.Root>
                </div>
            )}
        </nav>
    );
};

