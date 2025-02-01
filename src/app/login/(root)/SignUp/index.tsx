'use client'

// Core
import React, { FC, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { TFunction } from 'i18next';
import { redirect } from 'next/navigation';

// Init
import { BOOK, INPUT_VALIDATION_VALUES } from '@/lib';

// Bus
import { useTogglesRedux } from '@/bus/client/toggles';
import { useProfile } from '@/bus/profile';

// Containers
import { InputGroup } from '@/view/containers';

// Components
import { Form } from '@/view/components';

// Elements
import { Button, FormTitle, Input } from '@/view/elements';

// Static
import { validationForm, defaultValues } from './static';

// Types
type PropTypes = {
    t: TFunction;
}

export const SignUp: FC<PropTypes> = ({ t }) => {
    const form = useForm({
        resolver: yupResolver(validationForm),
        defaultValues,
    });

    const { togglesRedux: { isLoadingRegistrationProfile } } = useTogglesRedux();

    const { fetchRegistrationProfile } = useProfile();

    const onSubmit = (values: typeof defaultValues) => {
        fetchRegistrationProfile({
            body: {
                name: values.name,
                phone: values.phone,
                email: values.email,
                password: values.password,
            }
        });
    };

    return (
        <Form.Root {...form}>
            <InputGroup
                onSubmit={form.handleSubmit(onSubmit)}>
                <FormTitle className='text-center'>
                    {t('pages.signInAndUp.signUp.title')}
                </FormTitle>
                <Form.FormField
                    control={form.control}
                    name='name'
                    render={({ field, fieldState }) => (
                        <Form.FormItem>
                            <Form.FormControl>
                                <Input
                                    autoCapitalize='words'
                                    isValidate={fieldState.invalid}
                                    placeholder={t('placeholders.nameAndSurname')}
                                    {...field}
                                />
                            </Form.FormControl>
                            <Form.FormMessage
                                options={{ index: INPUT_VALIDATION_VALUES.NAME }}
                                t={t}
                            />
                        </Form.FormItem>
                    )}
                />
                <Form.FormField
                    control={form.control}
                    name='email'
                    render={({ field, fieldState }) => (
                        <Form.FormItem>
                            <Form.FormControl>
                                <Input
                                    autoCapitalize='off'
                                    isValidate={fieldState.invalid}
                                    placeholder={t('placeholders.email')}
                                    {...field}
                                />
                            </Form.FormControl>
                            <Form.FormMessage t={t} />
                        </Form.FormItem>
                    )}
                />
                <Form.FormField
                    control={form.control}
                    name='phone'
                    render={({ field, fieldState }) => (
                        <Form.FormItem>
                            <Form.FormControl>
                                <Input
                                    autoCapitalize='off'
                                    isValidate={fieldState.invalid}
                                    placeholder={t('placeholders.phone')}
                                    {...field}
                                />
                            </Form.FormControl>
                            <Form.FormMessage t={t} />
                        </Form.FormItem>
                    )}
                />
                <Form.FormField
                    control={form.control}
                    name='password'
                    render={({ field, fieldState }) => (
                        <Form.FormItem>
                            <Form.FormControl>
                                <Input
                                    autoCapitalize='off'
                                    isValidate={fieldState.invalid}
                                    placeholder={t('placeholders.password')}
                                    type='password'
                                    {...field}
                                />
                            </Form.FormControl>
                            <Form.FormMessage
                                options={{ index: INPUT_VALIDATION_VALUES.PASSWORD }}
                                t={t}
                            />
                        </Form.FormItem>
                    )}
                />
                <Form.FormField
                    control={form.control}
                    name='passwordAgain'
                    render={({ field, fieldState }) => (
                        <Form.FormItem>
                            <Form.FormControl>
                                <Input
                                    autoCapitalize='off'
                                    isValidate={fieldState.invalid}
                                    placeholder={t('placeholders.passwordAgain')}
                                    type='password'
                                    {...field}
                                />
                            </Form.FormControl>
                            <Form.FormMessage t={t} />
                        </Form.FormItem>
                    )}
                />
                <Button
                    isLoading={isLoadingRegistrationProfile}
                    type='submit'
                    variant='contain'>
                    {t('buttons.submit')}
                </Button>
            </InputGroup>
        </Form.Root>
    );
};
