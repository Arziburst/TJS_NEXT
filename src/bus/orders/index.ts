// Tools
import { useDispatch, useSelector } from '../../tools/hooks';

// Slice
import { ordersActions } from './slice';

// Types
import * as types from './types';

import { useOrdersSaga } from './saga';

export const useOrders = () => {
    const ordersSagas = useOrdersSaga();

    const dispatch = useDispatch();
    const orders = useSelector((state) => state.orders);

    return {
        orders,
        setOrders:       (payload: types.Orders) => dispatch(ordersActions.setOrders(payload)),
        setCurrentOrder: (payload: types.Order | null) => dispatch(ordersActions.setCurrentOrder(payload)),
        reset:           () => dispatch(ordersActions.reset()),
        ...ordersSagas,
    };
};
