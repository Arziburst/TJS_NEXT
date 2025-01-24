// Core
import React, { FC, useEffect, useRef } from 'react';
import { TFunction, i18n } from 'i18next';

// Init
import { CSS_VARIABLES } from '@/lib';

// Tools
import { cn } from '@/tools/lib/utils';

// Bus
import { useTogglesRedux } from '@/bus/client/toggles';

// Assets
import { SCREENS_NUMBER } from '@/assets';

// Tools
import { useWindowWidth } from '@/tools/hooks';

// Components
import {
    ButtonCart,
    ButtonSignInAndUp,
    Icons,
    Logo,
    Nav,
    SideBarPropTypes,
} from '@/view/components';

// Types
interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>, SideBarPropTypes {
    isSetHeightToCssVariable?: boolean;
    t: TFunction;
    i18n: i18n;
}

export const Header: FC<PropTypes> = ({
    variant,
    isSetHeightToCssVariable,
    t,
    i18n,
    className,
    ...props
}) => {
    const refHeader = useRef<null | HTMLElement>(null);

    const [width] = useWindowWidth();

    const isOpen = variant === 'open';
    const isSB = width < SCREENS_NUMBER.SB;

    const { setToggleAction } = useTogglesRedux();

    const onClickOpenSideBarHandler = () => {
        setToggleAction({
            type: 'isOpenSideBar',
            value: true,
        });
    };

    const onClickCloseSideBarHandler = () => {
        setToggleAction({
            type: 'isOpenSideBar',
            value: false,
        });
    };

    useEffect(() => {
        if (isSetHeightToCssVariable && refHeader.current && refHeader.current.clientHeight) {
            document.documentElement.style.setProperty(CSS_VARIABLES.HEADER, `${refHeader.current.clientHeight}px`);
        }
    }, [refHeader.current?.clientHeight, isSetHeightToCssVariable]);

    return (
        <header
            {...props}
            className={cn(
                `py-4 flex justify-between items-center bg-background z-10
                    sb:pt-[24px] sb:pb-[12px]
                    sb:items-start sb:gap-x-between-items-of-header`,
                className,
            )}
            ref={refHeader}>
            {isSB ? (
                <button
                    className='aspect-square transition-opacity hover:opacity-70'
                    onClick={isOpen ? onClickOpenSideBarHandler : onClickCloseSideBarHandler}>
                    {isOpen ? (
                        <Icons.SideBarOpen />
                    ) : (
                        <Icons.SideBarClose />
                    )}
                </button>
            ) : (
                <>
                    <Logo
                        className='whitespace-nowrap'
                        variant='desktop'
                    />
                    <Nav
                        i18n={i18n}
                        t={t}
                        variant='desktop'
                    />
                </>
            )}
            {isSB && (
                <Logo
                    variant='mobile'
                    onClick={onClickCloseSideBarHandler}
                />
            )}
            <ul className='flex flex-col items-end self-stretch'>
                <ButtonCart
                    className='whitespace-nowrap'
                    t={t}
                    onClick={onClickCloseSideBarHandler}
                />
                {isOpen && !isSB && (
                    <ButtonSignInAndUp
                        className='whitespace-nowrap'
                        isMobile={false}
                        t={t}
                        onClick={onClickCloseSideBarHandler}
                    />
                )}
            </ul>
        </header>
    );
};
