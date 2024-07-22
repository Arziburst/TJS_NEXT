// Init
import { STATUS_OF_PRODUCT } from '@/lib';

export const returnStylesStatus = (status: number | string) => {
    return {
        'bg-[#FF614A]':  status === STATUS_OF_PRODUCT.CANCELED,
        'bg-[#FFD600]':  status === STATUS_OF_PRODUCT.IN_PROGRESS,
        'bg-[#00C853]':  status === STATUS_OF_PRODUCT.ACCEPTED,
        'bg-background': status === STATUS_OF_PRODUCT.CLOSED,
    };
};
