// Core
// import { useEffect } from 'react';

// Tools
import { useDispatch, useSelector } from '../../tools/hooks'; /* Typed selector */

// Slice
import { newPostActions } from './slice';

// Types
import * as types from './types';

// MarkerGen middleware
import { useNewPostSaga } from './saga'; /* Choose one technology, Saga or Thunk */

export const useNewPost = () => {
    // MarkerGen api hook
    const newPostSagas = useNewPostSaga();  /* Saga api hook */

    const dispatch = useDispatch();
    const newPost = useSelector((state) => state.newPost);

    return {
        newPost,
        setCitiesNewPost:     (payload: types.NewPostState['cities']) => dispatch(newPostActions.setCitiesNewPost(payload)),
        setWarehousesNewPost: (payload: types.NewPostState['warehouses']) => dispatch(newPostActions.setWarehousesNewPost(payload)),
        resetNewPost:         () => dispatch(newPostActions.resetNewPost()),
        ...newPostSagas,
    };
};
