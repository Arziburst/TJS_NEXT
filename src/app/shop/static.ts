// Types
import { InitialStateToggles } from '@/bus/client/toggles';
import { ExtendedProduct } from '@/bus/products/types';

interface SortByPrice extends Pick<InitialStateToggles, 'isFilterByLowToHigh'> {
    array: null | ExtendedProduct[];
}

// Constants
export enum ENUM_FILTERS_BY_PRICE {
    LOW_TO_HIGH = 'lowToHigh',
    HIGH_TO_LOW = 'highToLow',
}

export const ARRAY_FILTERS_BY_PRICE = Object.values(ENUM_FILTERS_BY_PRICE);

// Functions
export const sortByPriceLowToHigh = (array: ExtendedProduct[]) => array.slice().sort((a, b) => a.price - b.price);
export const sortByPriceHighToLow = (array: ExtendedProduct[]) => array.slice().sort((a, b) => b.price - a.price);

export const sortByPrice = ({
    array,
    isFilterByLowToHigh,
}: SortByPrice): null | ExtendedProduct[] => {
    if (array) {
        if (isFilterByLowToHigh) {
            return sortByPriceLowToHigh(array);
        } else if (typeof isFilterByLowToHigh === 'boolean' && !isFilterByLowToHigh) {
            return sortByPriceHighToLow(array);
        }
    }

    return array;
};

export const getValueOfSelectFilterByPrice = (isLowToHigh: InitialStateToggles['isFilterByLowToHigh']) => {
    if (typeof isLowToHigh === 'boolean') {
        if (isLowToHigh) {
            return ENUM_FILTERS_BY_PRICE.LOW_TO_HIGH;
        }

        return ENUM_FILTERS_BY_PRICE.HIGH_TO_LOW;
    }

    return 'init';
};
