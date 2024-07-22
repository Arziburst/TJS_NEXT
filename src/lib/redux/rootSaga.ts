// Core
import { all } from 'redux-saga/effects';

import { watchCart } from '@/bus/cart/saga';
import { watchProducts } from '@/bus/products/saga';
import { watchProfile } from '@/bus/profile/saga';
import { watchGallery } from '@/bus/gallery/saga';
import { watchNewPost } from '@/bus/newPost/saga';
import { watchOrders } from '@/bus/orders/saga';

export function* rootSaga() {
    yield all([
        watchCart(),
        watchProducts(),
        watchProfile(),
        watchGallery(),
        watchNewPost(),
        watchOrders(),
    ]);
}
