// Types
import { CartState } from '@/bus/cart/types';

type CheckIsProductAddedToCart = {
  cart: CartState;
  productId: string | undefined;
};

export const checkIsProductAddedToCart = ({ cart, productId }: CheckIsProductAddedToCart) => {
    if (cart && productId && cart.includes(productId)) {
        return true;
    }

    return false;
};
