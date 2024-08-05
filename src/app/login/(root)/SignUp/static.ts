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

const getTimeForDevelopmentMode = new Date().getTime();

export const defaultValues: DefaultValues = process.env.NODE_ENV === 'development' ? {
    name:          `user_${getTimeForDevelopmentMode}`,
    email:         `email${getTimeForDevelopmentMode}@gmail.com`,
    phone:         `+3809${getTimeForDevelopmentMode.toString().slice(-8) }`,
    password:      '12345678',
    passwordAgain: '12345678',
} : {
    name:          '',
    email:         '',
    phone:         '',
    password:      '',
    passwordAgain: '',
};

