// Core
import React, { FC } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { TFunction } from 'i18next';

// Init
import { INPUT_VALIDATION_VALUES } from '@/lib';

// Bus
import { useProfile } from '@/bus/profile';
import { useTogglesRedux } from '@/bus/client/toggles';

// Containers
import { InputGroup } from '@/view/containers';

// Components
import { Form } from '@/view/components';

// Elements
import { Button, FormTitle, Input } from '@/view/elements';

// Static
import { validationForm, defaultValues } from './static';
import { redirect } from 'next/navigation';

// Types
type PropTypes = {
    t: TFunction;
}

export const SignIn: FC<PropTypes> = ({ t }) => {
    const form = useForm({
        resolver: yupResolver(validationForm),
        defaultValues,
    });

    const { togglesRedux: { isLoadingLoginProfile }} = useTogglesRedux();

    const { fetchLoginProfile } = useProfile();

    const onSubmit = (values: typeof defaultValues) => {
        fetchLoginProfile({
            ...values,
            redirect,
        });
    };

    return (
        <Form.Root { ...form }>
            <InputGroup
                onSubmit = { form.handleSubmit(onSubmit) }>
                <FormTitle className = 'text-center'>
                    {t('pages.signInAndUp.signIn.title')}
                </FormTitle>
                <Form.FormField
                    control = { form.control }
                    name = 'email'
                    render = { ({ field, fieldState }) => (
                        <Form.FormItem>
                            <Form.FormControl>
                                <Input
                                    autoCapitalize = 'off'
                                    isValidate = { fieldState.invalid }
                                    placeholder = { t('placeholders.email') }
                                    { ...field }
                                />
                            </Form.FormControl>
                            <Form.FormMessage t = { t } />
                        </Form.FormItem>
                    ) }
                />
                <Form.FormField
                    control = { form.control }
                    name = 'password'
                    render = { ({ field, fieldState }) => (
                        <Form.FormItem>
                            <Form.FormControl>
                                <Input
                                    autoCapitalize = 'off'
                                    isValidate = { fieldState.invalid }
                                    placeholder = { t('placeholders.password') }
                                    type = 'password'
                                    { ...field }
                                />
                            </Form.FormControl>
                            <Form.FormMessage
                                options = {{ index: INPUT_VALIDATION_VALUES.PASSWORD }}
                                t = { t }
                            />
                        </Form.FormItem>
                    ) }
                />
                <Button
                    isLoading = { isLoadingLoginProfile }
                    type = 'submit'
                    variant = 'contain'>
                    {t('buttons.submit')}
                </Button>
            </InputGroup>
        </Form.Root>
    );
};
