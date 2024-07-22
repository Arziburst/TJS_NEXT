// Slice
import { initialState } from './slice';

// Types
import * as types from './types';

export const setProducts: types.BaseContact<types.Products> = (state, action) => ({
    ...state,
    products: action.payload,
});

export const setProductsAtEnd: types.BaseContact<types.Products> = (state, action) => ({
    ...state,
    products: state.products ? [ ...state.products, ...action.payload ] : action.payload,
});

export const setLimitOfProducts: types.BaseContact<types.ProductsState['limit']> = (state, action) => ({
    ...state,
    limit: action.payload,
});

export const setTotalOfProducts: types.BaseContact<types.ProductsState['total']> = (state, action) => ({
    ...state,
    total: action.payload,
});

export const setTotalShowedOfProducts: types.BaseContact<types.ProductsState['totalShowed']> = (state, action) => ({
    ...state,
    totalShowed: action.payload,
});

export const setPageOfProducts: types.BaseContact<types.ProductsState['page']> = (state, action) => ({
    ...state,
    page: action.payload,
});

export const setProduct: types.BaseContact<types.ExtendedProduct> = (state, action) => {
    if (state.products) {
        return {
            ...state,
            products: [ action.payload, ...state.products ],
        };
    }

    return {
        ...state,
        products: [ action.payload ],
    };
};

export const setCurrentProduct: types.BaseContact<types.SetCurrentProductAction> = (state, action) => ({
    ...state,
    currentProduct: action.payload,
});

export const setDeleteProduct: types.BaseContact<string> = (state, action) => {
    if (state.products) {
        state.products.filter(({ _id }) => _id !== action.payload);
    }
};

export const setEditedProduct: types.BaseContact<types.ExtendedProduct> = (state, action) => {
    if (state.products) {
        const newItems = state.products.map((product) => {
            if (product._id === action.payload._id) {
                return {
                    ...product,
                    ...action.payload,
                };
            }

            return product;
        });

        return {
            ...state,
            items: newItems,
        };
    }

    return state;
};

export const resetProducts: types.BaseContact<void> = () => initialState;
