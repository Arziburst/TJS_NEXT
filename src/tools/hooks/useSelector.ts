// Core
import { useSelector as useReduxSelector } from 'react-redux';

// Types
import { RootState } from '../../lib/redux/store';

export const useSelector = useReduxSelector.withTypes<RootState>();

