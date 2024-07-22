// Core
import * as React from 'react';
import {
    Controller,
    ControllerProps,
    FieldPath,
    FieldValues,
} from 'react-hook-form';

// Contexts
import { FormFieldContext } from './contexts';

export const FormField = <
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
        ...props
    }: ControllerProps<TFieldValues, TName>) => {
    return (
        <FormFieldContext.Provider value = {{ name: props.name }}>
            <Controller { ...props } />
        </FormFieldContext.Provider>
    );
};
