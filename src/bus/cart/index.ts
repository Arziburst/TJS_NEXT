// Tools
import { useDispatch, useSelector } from '../../tools/hooks'; /* Typed selector */

// Slice
import { cartActions } from './slice';

// Types
import * as types from './types';

// MarkerGen middleware
import { useCartSaga } from './saga'; /* Choose one technology, Saga or Thunk */

export const useCart = () => {
    // MarkerGen api hook
    const cartSagas = useCartSaga();  /* Saga api hook */

    const dispatch = useDispatch();
    const cart = useSelector((state) => state.cart);

    return {
        cart,
        setCart: (payload: types.Cart) => dispatch(cartActions.setCart(payload)),

        /**
         * @param _id - _id of product
         */
        setProductOfCart: (payload: types.ProductOfCart) => dispatch(cartActions.setProductOfCart(payload)),

        /**
         * @param _id - _id of product
         */
        removeProductOfCart: (payload: types.ProductOfCart) => dispatch(cartActions.removeProductOfCart(payload)),
        resetCart:           (payload?: types.CartState) => dispatch(cartActions.resetCart(payload)),
        ...cartSagas,
    };
};
