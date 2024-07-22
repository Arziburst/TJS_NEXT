// Core
// Uncomment for using
import { all } from 'redux-saga/effects';

// MarkerGen tools imports
import { watchCart } from '@/bus/cart/saga';
import { watchProducts } from '@/bus/products/saga';
import { watchProfile } from '@/bus/profile/saga';
import { watchGallery } from '@/bus/gallery/saga';
import { watchNewPost } from '@/bus/newPost/saga';
import { watchOrders } from '@/bus/orders/saga';

export function* rootSaga() {
    // Uncomment for using
    yield all([
        // MarkerGen use watch
        watchCart(),
        watchProducts(),
        watchProfile(),
        watchGallery(),
        watchNewPost(),
        watchOrders(),
    ]);
}
