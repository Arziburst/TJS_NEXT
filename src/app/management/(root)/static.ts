// Core
import * as yup from 'yup';

// Init
import { CATEGORIES_ITEMS, ERRORS } from '@/lib';

// Types
import { Product } from '@/bus/products/types';

// Types
export type DefaultValues = Product;

const minLength = 3;

export const minLengthImages = 1;

export const minPrice = 1;

export const validationForm = yup.object({
    title: yup.string().min(minLength)
        .required(ERRORS.REQUIRED),
    description: yup.string().min(minLength)
        .required(ERRORS.REQUIRED),
    type:      yup.string().required(ERRORS.REQUIRED),
    available: yup.boolean().required(ERRORS.REQUIRED),
    price:     yup.number().min(minPrice, ERRORS.PRICE_MIN_LENGTH)
        .required(ERRORS.REQUIRED),
    images: yup.array(yup.string()).min(minLengthImages, ERRORS.FIELD_MUST_HAVE_AT_LEAST)
        .required(ERRORS.REQUIRED),
    weight: yup.number().required(ERRORS.REQUIRED),
});

export const defaultValues: DefaultValues = {
    title:       '',
    description: '',
    type:        CATEGORIES_ITEMS[ 0 ],
    available:   true,
    price:       0,
    images:      [],
    weight:      0,
};

