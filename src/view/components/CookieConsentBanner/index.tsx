// Core
import React, { FC, useEffect, useRef, useState } from 'react';
import { TFunction } from 'i18next';

// Init
import { CSS_VARIABLES, LOCAL_STORAGE } from '@/lib';

// Tools
import { cn } from '@/tools/lib/utils';
import { ls, setValueToCSSVariable } from '@/tools/utils';

// Containers
import { Wrapper } from '@/view/containers';

// Elements
import { Button } from '@/view/elements';

// Types
type PropTypes = {
    t: TFunction;
    width: number;
}

export const CookieConsentBanner: FC<PropTypes> = ({ t, width }) => {
    const refCookieConsentBanner = useRef<null | HTMLDivElement>(null);

    const [ isAgreesState, setIsAgreesState ] = useState(ls.get(LOCAL_STORAGE.IS_AGREES_TO_USE_COOKIES));

    const onClickGotItHandler = () => {
        ls.set(LOCAL_STORAGE.IS_AGREES_TO_USE_COOKIES, true);
        setIsAgreesState(true);
        setValueToCSSVariable(CSS_VARIABLES.VH_COOKIE_CONSENT_BANNER, '0px');
    };

    useEffect(() => {
        if (refCookieConsentBanner.current) {
            setValueToCSSVariable(CSS_VARIABLES.VH_COOKIE_CONSENT_BANNER, `${refCookieConsentBanner.current.clientHeight}px`);
        }
    }, [ refCookieConsentBanner.current, width ]);

    if (isAgreesState) {
        setValueToCSSVariable(CSS_VARIABLES.VH_COOKIE_CONSENT_BANNER, '0px');

        return null;
    }

    return (
        <div style = {{ height: `var(${CSS_VARIABLES.VH_COOKIE_CONSENT_BANNER})` }}>
            <div
                className = { cn('fixed bottom-0 left-0 right-0 py-[14px] border border-secondary-100 bg-background') }
                ref = { refCookieConsentBanner }>
                <Wrapper className = { `flex flex-col gap-[24px]
                    sb:flex-row sb:gap-[60px]` }>
                    <p className = 'font-secondary'>
                        {t('components.cookieConsentBanner.text')}
                    </p>
                    <Button
                        className = 'w-[180px] py-[8px] uppercase'
                        onClick = { onClickGotItHandler }>
                        {t('components.cookieConsentBanner.gotIt')}
                    </Button>
                </Wrapper>
            </div>
        </div>
    );
};
