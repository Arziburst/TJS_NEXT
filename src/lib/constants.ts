// Network
export const API_URL = process.env.API_URL || 'https://dev-api.tjstore.pp.ua';

// Local
export const APP_NAME = process.env.APP_NAME || 'TJS_NEXT';

export enum LOCAL_STORAGE {
    CART = 'cart',
    LANGUAGE = 'language',
    IS_AGREES_TO_USE_COOKIES = 'isAgreesToUseCookies',
}

export enum CSS_VARIABLES {
    HEADER = '--vh_header',
    WRAPPER_LEFT_PADDING = '--wrapper_left_padding',
    VH_COOKIE_CONSENT_BANNER = '--vh_cookie_consent_banner',
}

export enum ENUM_CATEGORIES {
    ALL = 'see-all',
    BROOCH = 'brooch',
    EARRINGS = 'earrings',
    BRACELETS = 'bracelets',
    NECKLACE = 'necklace',
    RINGS = 'rings',
}

export enum STATUS_OF_PRODUCT {
    CANCELED,
    IN_PROGRESS,
    ACCEPTED,
    CLOSED,
}

export const CATEGORIES_ITEMS = [
    ENUM_CATEGORIES.EARRINGS,
    ENUM_CATEGORIES.NECKLACE,
    ENUM_CATEGORIES.BRACELETS,
    ENUM_CATEGORIES.RINGS,
    ENUM_CATEGORIES.BROOCH,
];

export const LANGUAGES = [ 'en', 'ua', 'ru' ];

export const LINK_ARZIBURST = 'https://github.com/Arziburst';

export const LINK_INSTAGRAM = 'https://www.instagram.com/stories/trend_jewelry_store08/';

export const LINK_PHONE = 'tel:+38066-830-1029';
export const LINK_EMAIL = 'mailto:elena-arez@ukr.net';

export const typesOfImage: Array<string> = [ 'image/png', 'image/jpeg', 'image/gif' ];

export const VALUES_OF_STATUS = [
    'canceled',
    'inProcessing',
    'accepted',
    'closed',
];
