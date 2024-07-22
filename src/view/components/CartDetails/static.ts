// Core
import * as yup from 'yup';

// Init
import { ERRORS, VALIDATIONS } from '@/lib';

// Types
export type DefaultValues = {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    city: string;
    warehouse: string;
    comment: string;
};

export const validationForm = yup.object({
    firstName: yup.string()
        .required(ERRORS.REQUIRED),
    lastName: yup.string()
        .required(ERRORS.REQUIRED),
    phone: yup.string().required(ERRORS.REQUIRED)
        .matches(VALIDATIONS.PHONE, ERRORS.INVALID_PHONE),
    email: yup.string().required(ERRORS.REQUIRED)
        .email(ERRORS.INVALID_EMAIL),
    city:      yup.string().required(ERRORS.REQUIRED),
    warehouse: yup.string()
        .required(ERRORS.REQUIRED),
    comment: yup.string().optional(),
});

export const defaultValues: DefaultValues = {
    firstName: '',
    lastName:  '',
    phone:     '',
    email:     '',
    city:      '',
    warehouse: '',
    comment:   '',
};
