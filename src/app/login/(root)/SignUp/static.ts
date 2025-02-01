// Core
import * as yup from 'yup';

// Init
import { ERRORS, INPUT_VALIDATION_VALUES, VALIDATIONS } from '@/lib';

// Types
type DefaultValues = {
    name: string;
    email: string;
    phone: string;
    password: string;
    passwordAgain: string;
}

export const validationForm = yup.object({
    name: yup.string().required(ERRORS.REQUIRED)
        .min(INPUT_VALIDATION_VALUES.NAME, ERRORS.NAME_MIN_LENGTH),
    email: yup.string().required(ERRORS.REQUIRED)
        .email(ERRORS.INVALID_EMAIL),
    phone: yup.string().required(ERRORS.REQUIRED)
        .matches(VALIDATIONS.PHONE, ERRORS.INVALID_PHONE),
    password: yup.string().required(ERRORS.REQUIRED)
        .min(INPUT_VALIDATION_VALUES.PASSWORD, ERRORS.PASSWORD_MIN_LENGTH),
    passwordAgain: yup.string().required(ERRORS.REQUIRED)
        .min(INPUT_VALIDATION_VALUES.PASSWORD, ERRORS.PASSWORD_MIN_LENGTH),
});

export const defaultValues: DefaultValues = process.env.NODE_ENV === 'development' ? {
    name:          `TEST TEST`,
    email:         `test_admin@email.com`,
    phone:         `+380666666666`,
    password:      'test',
    passwordAgain: 'test',
} : {
    name:          '',
    email:         '',
    phone:         '',
    password:      '',
    passwordAgain: '',
};

