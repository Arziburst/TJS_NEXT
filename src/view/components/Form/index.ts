// Core
import { FormProvider } from 'react-hook-form';

// Hooks
export * from './hooks';

// Part of component
import { FormItem } from './FormItem';
import { FormLabel } from './FormLabel';
import { FormControl } from './FormControl';
import { FormDescription } from './FormDescription';
import { FormMessage } from './FormMessage';
import { FormField } from './FormField';

// export const Form = FormProvider;
export const Form = {
    Root: FormProvider,
    FormItem,
    FormLabel,
    FormControl,
    FormDescription,
    FormMessage,
    FormField,
};
