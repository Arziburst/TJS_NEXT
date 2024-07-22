// Tools
import { LowercaseKeys } from '@/tools/utils';

// Types
type Params = {
    CATEGORY: string,
    ID: string,
}
export type ParamsLowerCase = LowercaseKeys<Params>;

export enum PARAMS_VALUES {
    CATEGORY = 'category',
    ID = 'id',
}

export enum PARAMS {
    CATEGORY = `/:${PARAMS_VALUES.CATEGORY}`,
    ID = `/:${PARAMS_VALUES.ID}`,
}

export const BOOK = {
    ORDER: '/order',
    ORDERS: '/orders',
    PAYMENT_FAIL: '/payment-fail',
    PAYMENT_SUCCESS: '/payment-success',
    ORDER_DETAILS: '/order-details',
    PRODUCT: '/product',
    ADD_ITEM: '/add-item',
    EDIT_ITEM: '/edit-item',
    MANAGEMENT: '/management',
    SIGN_IN_AND_UP: '/sign-in-and-up',
    ABOUT_US: '/about-us',
    CART: '/cart',
    SHOP: '/shop',
    ROOT: '/',
}
