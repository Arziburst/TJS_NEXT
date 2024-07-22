// Core
import { CaseReducer, PayloadAction } from '@reduxjs/toolkit';

// Types
import { ExtendedProduct } from '../products/types';

// State
export type ProductOfCart = ExtendedProduct['_id']

export type Cart = Array<ProductOfCart>
export type CartState = Cart | null

// Contracts
export type BaseContact<T = any> = CaseReducer<CartState, PayloadAction<T>>
