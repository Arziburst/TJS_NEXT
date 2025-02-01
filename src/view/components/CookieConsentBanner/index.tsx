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

const IS_AGREES_TO_USE_COOKIES = ls.get(LOCAL_STORAGE.IS_AGREES_TO_USE_COOKIES)

export const CookieConsentBanner: FC<PropTypes> = ({ t, width }) => {
    const refCookieConsentBanner = useRef<null | HTMLDivElement>(null);

    const [isAgreesState, setIsAgreesState] = useState<boolean>(IS_AGREES_TO_USE_COOKIES);
    console.log("🚀 ~ isAgreesState:", isAgreesState)

    const onClickGotItHandler = () => {
        if (isAgreesState) {
            return;
        }

        ls.set(LOCAL_STORAGE.IS_AGREES_TO_USE_COOKIES, true);
        setIsAgreesState(true);
    };

    useEffect(() => {


    });

    if (isAgreesState) {
        return null;
    }

    return (
        <div
            className={cn('fixed bottom-0 left-0 right-0 py-[14px] border border-secondary-100 bg-background')}
            ref={refCookieConsentBanner}>
            <Wrapper className={`flex flex-col gap-[24px]
                    sb:flex-row sb:gap-[60px]` }>
                <p className='font-secondary'>
                    {t('components.cookieConsentBanner.text')}
                </p>
                <Button
                    className='w-[180px] py-[8px] uppercase'
                    onClick={onClickGotItHandler}>
                    {t('components.cookieConsentBanner.gotIt')}
                </Button>
            </Wrapper>
        </div>
    );
};
