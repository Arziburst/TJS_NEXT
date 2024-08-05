"use client"

// Core
import React from 'react';

// Tools
import { useCustomTranslation } from '@/tools/hooks';

// Components
import { Tabs } from '@/view/components';
import { SignUp } from './(root)/SignUp';
import { SignIn } from './(root)/SignIn';

enum TABS_VALUES {
    IN = 'signIn',
    UP = 'signUp',
}

export default function SignInAndUp() {
    const { t } = useCustomTranslation();

    return (
        <div className = 'flex justify-center'>
            <Tabs.Root
                className = 'max-w-[400px]'
                defaultValue = { TABS_VALUES.IN }>
                <Tabs.List>
                    <Tabs.Trigger value = { TABS_VALUES.IN }>
                        {t(`pages.signInAndUp.${TABS_VALUES.IN}.root`)}
                    </Tabs.Trigger>
                    <Tabs.Trigger value = { TABS_VALUES.UP }>
                        {t(`pages.signInAndUp.${TABS_VALUES.UP}.root`)}
                    </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content
                    className = 'w-full'
                    value = { TABS_VALUES.IN }>
                    <SignIn t = { t } />
                </Tabs.Content>
                <Tabs.Content
                    className = 'w-full'
                    value = { TABS_VALUES.UP }>
                    <SignUp t = { t } />
                </Tabs.Content>
            </Tabs.Root>

        </div>
    );
};