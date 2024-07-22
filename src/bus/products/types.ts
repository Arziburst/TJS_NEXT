// Core
import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';

// Types of Entities
export type Product = {
    title: string;
    description: string;
    type: string;
    available: boolean;
    price: number;
    images: string[];
    weight: number;
};

export type ExtendedProduct = Product & {
    views: number;
    isProductNew: boolean;
    created: string;
    _id: string;
};
export type Products = ExtendedProduct[];

// State
export type ProductsState = {
    products: null | Products;
    currentProduct: null | ExtendedProduct;
    total: number;
    totalShowed: number;
    limit: number;
    page: number;
}

// Actions
export type SetCurrentProductAction = ProductsState['currentProduct']

// Contracts
export type BaseContact<T = any> = CaseReducer<ProductsState, PayloadAction<T>>;
