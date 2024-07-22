// Core
import React, { FC } from 'react';

// Assets
import { SCREENS_NUMBER } from '@/assets/themes';

// init
import { LINK_EMAIL, LINK_GOHARD, LINK_INSTAGRAM, LINK_PHONE } from '@/lib';

// Tools
import { useWindowWidth } from '@/tools/hooks';
import { cn } from '@/tools/lib/utils';
import { transformLinkEmail, transformLinkPhoneNumber } from '@/tools/utils';
import { TFunction } from 'i18next';

// Components
import { Icons, Logo } from '@/view/components';

// Elements
import { Link } from '@/view/elements';

// Styles
import S from './styles.module.css';

// Types
interface PropTypes extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> {
    t: TFunction;
}

export const SPACE_FOOTER = 'mt-6';

export const Footer: FC<PropTypes> = ({
    className,
    t,
    ...props
}) => {
    const [ width ] = useWindowWidth();

    return (
        <footer
            className = { cn(
                `${S.footer} ${SPACE_FOOTER} border-secondary-100/10`,
                className,
            ) }
            { ...props }>
            {width < SCREENS_NUMBER.SB && (
                <h2 className = 'footer_logo text-center'>
                    <Logo
                        className = 'max-sb:text-quaternary text-[12px] tracking-[2.4px]'
                        variant = 'desktop'
                    />
                </h2>
            )}
            <address className = { `${S.footer_address} flex justify-evenly items-end gap-4 flex-wrap not-italic text-quaternary
                sb:justify-center sb:items-center
                xl:gap-8` }>
                <div>
                    {width < SCREENS_NUMBER.SB && (
                        <p className = { S.contact_title }>{t('components.footer.textPhone')}:</p>
                    )}
                    <a
                        className = { S.contact_subtitle }
                        href = { LINK_PHONE }>
                        {transformLinkPhoneNumber(LINK_PHONE)}
                    </a>
                </div>
                <div>
                    <Link href = { LINK_INSTAGRAM }>
                        <Icons.Instagram />
                    </Link>
                </div>
                <div>
                    {width < SCREENS_NUMBER.SB && (
                        <p className = { S.contact_title }>{t('components.footer.textEmail')}:</p>
                    )}
                    <a
                        className = { `${S.contact_subtitle} uppercase` }
                        href = { LINK_EMAIL }>
                        {transformLinkEmail(LINK_EMAIL)}
                    </a>
                </div>
            </address>
            <div className = { `${S.footer_description_1}` }>
                <p className = { S.contact_small }>
                    Trend Jewelry Store 2023. All Rights Reserved
                </p>
            </div>
            <div className = { `${S.footer_description_2}` }>
                <p className = { S.contact_small }>
                    Developed by
                    <Link
                        className = 'font-bold underline'
                        href = { LINK_GOHARD }>
                        {' '} 
                        Arziburst*
                    </Link>
                </p>
            </div>
        </footer>
    );
};
