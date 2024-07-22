// Core
import { useDispatch as useReduxDispatch } from 'react-redux';

// Types
import { AppDispatch } from '../../lib/redux/store';

export const useDispatch = useReduxDispatch.withTypes<AppDispatch>();