// Core
import React, { FC } from 'react';
// import { useNavigate } from 'react-router-dom';
import { TFunction } from 'i18next';

// Book
import { BOOK } from '@/lib/book';

// Bus
// import { useTogglesRedux } from '@/bus/client/toggles';
// import { useProfile } from '@/bus/profile';

// Components
import { NavItem, NavItemPropTypes } from '@/view/components/Nav/NavItem';
import { DropdownMenu } from '../DropdownMenu';
import { Avatar } from '../Avatar';

// Types
interface PropTypes extends Omit<NavItemPropTypes, 'children' | 'href'> {
    isMobile: boolean;
    t: TFunction;
}

export const ButtonSignInAndUp: FC<PropTypes> = ({
    className,
    t,
    isMobile,
    ...props
}) => {
    // const navigate = useNavigate();

    // const { togglesRedux: { isLoggedIn, isLoadingLogoutProfile }, setToggleAction } = useTogglesRedux();
    // const { profile, fetchLogoutProfile } = useProfile();

    const closeSideBar = () => {
        // isMobile && setToggleAction({
        //     type:  'isOpenSideBar',
        //     value: false,
        // });
    };

    const onClickLogoutHandler = () => {
        // fetchLogoutProfile();
        closeSideBar();
    };

    // if (isLoggedIn) {
    //     return (
    //         <li className = { className }>
    //             <DropdownMenu.Root modal>
    //                 <DropdownMenu.Trigger asChild>
    //                     <Avatar
    //                         fallback = { profile ? profile.name.slice(0, 2) : 'XX' }
    //                     />
    //                 </DropdownMenu.Trigger>
    //                 <DropdownMenu.Content side = { isMobile ? 'top' : 'right' }>
    //                     <DropdownMenu.Label>
    //                         {t('components.header.textSettings')}
    //                     </DropdownMenu.Label>
    //                     <DropdownMenu.Separator />
    //                     {profile?.role === 'admin' && (
    //                         <>
    //                             <DropdownMenu.Item onClick = { () => navigate(BOOK.ADD_ITEM) }>
    //                                 {t('components.header.buttonAddProduct')}
    //                             </DropdownMenu.Item>
    //                             <DropdownMenu.Item onClick = { () => navigate(BOOK.ORDERS) }>
    //                                 {t('components.header.buttonOrders')}
    //                             </DropdownMenu.Item>
    //                         </>
    //                     )}
    //                     <DropdownMenu.Item
    //                         propsButton = {{
    //                             isLoading: isLoadingLogoutProfile,
    //                         }}
    //                         onClick = { onClickLogoutHandler }>
    //                         {t('components.header.buttonLogout')}
    //                     </DropdownMenu.Item>
    //                 </DropdownMenu.Content>
    //             </DropdownMenu.Root>
    //         </li>
    //     );
    // }

    return (
        <NavItem
            className = { className }
            href = { BOOK.SIGN_IN_AND_UP }
            onClick = { () => closeSideBar() }
            { ...props }>
            {t('pages.signInAndUp.root')}
        </NavItem>
    );
};
