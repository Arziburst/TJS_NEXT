'use client'

// Core
import React, { useEffect, useCallback } from 'react';
import type { Metadata } from "next";

// Init
import { CSS_VARIABLES, LOCAL_STORAGE } from '../lib';

// Assets
import { SCREENS_NUMBER } from '@/assets';

// Tools
import { ls, postcssViewportHeightCorrection, setValueToCSSVariable } from '@/tools/utils';
import { useCssPropertyValue, useCustomTranslation, useWindowWidth } from '@/tools/hooks';

// Bus
import { StoreProvider } from "./StoreProvider";
import { useTogglesRedux } from '@/bus/client/toggles'

// Containers
import { Wrapper, wrapperVariants } from '@/view/containers';

// Components
import { Alert, CookieConsentBanner, Footer, Header, SideBar } from '@/view/components';

// export const metadata: Metadata = {
//     title: {
//         template: '%s | TJS',
//         default: 'TREND JEWELRY STORE',
//     },
//     description: 'The official TREND JEWELRY STORE.',
//     metadataBase: new URL('https://www.google.com'),
// };


// I18N
import '@/lib/translations';

// Styles
import '@/assets/globalStyles/index.css';

export default function RootLayout({children}: Readonly<{ children: React.ReactNode; }>) {
    const refWrapper = React.useRef<null | HTMLDivElement>(null);

    const [paddingLeftWrapper] = useCssPropertyValue({
        ref: refWrapper,
        property: 'padding-left',
    });

    const { t, i18n } = useCustomTranslation();

    const [width] = useWindowWidth();

    // const { setToggleAction: setTogglerAction } = useTogglesRedux();
    // const { fetchAuthenticateProfile } = useProfileSaga();
    // const { fetchCheckCart } = useCartSaga();

    // const setOnlineStatusHandler = useCallback(() => void setTogglerAction({
    //     type: 'isOnline',
    //     value: navigator.onLine ?? false,
    // }), [setTogglerAction]);

    
    // useEffect(() => {
    //     // fetchAuthenticateProfile();
    //     setOnlineStatusHandler();

    //     if (window !== void 0) {
    //         window.addEventListener('online', setOnlineStatusHandler);
    //         window.addEventListener('offline', setOnlineStatusHandler);
    //     }

    //     // if (window.location.pathname !== BOOK.PAYMENT_SUCCESS) {
    //     //     fetchCheckCart(ls.get(LOCAL_STORAGE.CART) || []);
    //     // }
    // }, []);


    postcssViewportHeightCorrection();

    paddingLeftWrapper && setValueToCSSVariable(
        CSS_VARIABLES.WRAPPER_LEFT_PADDING,
        paddingLeftWrapper,
    );

    return (
        <html lang="en">
            <body>
                <StoreProvider>
                    {width < SCREENS_NUMBER.SB && (
                        <SideBar
                            i18n={i18n}
                            t={t}
                            variant={'close'}
                        />
                    )}
                    <Alert />
                    <Wrapper
                        className='grid grid-rows-[auto_1fr_auto] min-h-screen'
                        /* ref={refWrapper} */>
                        <div style={{
                            minHeight: `var(${CSS_VARIABLES.HEADER})`,
                        }}>
                            <Header
                                isSetHeightToCssVariable
                                className={wrapperVariants({ className: 'fixed inset-x-0' })}
                                i18n={i18n}
                                style={paddingLeftWrapper ? {
                                    paddingLeft: paddingLeftWrapper,
                                    paddingRight: paddingLeftWrapper,
                                } : {}}
                                t={t}
                                variant='open'
                            />
                        </div>
                        {children}
                        <Footer t={t} />
                    </Wrapper>
                    <CookieConsentBanner
                        t={t}
                        width={width}
                    />
                </StoreProvider>
            </body>
        </html>
    );
}