// Types
import * as types from '../types';
import { Products } from '@/bus/products/types';

// Check Cart
export type FetchCheckCartRequest = types.Cart;
export type FetchCheckCartResponse = [] | string[];

// Fetch Product
export type FetchProductCartRequest = types.Cart;
export type FetchProductCartResponse = Products;
