// Core
import { useRef } from 'react';

// Types
type DebounceCallback = (callback: () => void) => void;

type UseDebounceCallback = (time?: number) => [ DebounceCallback ];


export const useDebounceCallback: UseDebounceCallback = (time = 500) => {
    const ref = useRef<null | unknown>(null);

    const debounceCallback: DebounceCallback = (callback) => {
        ref.current && clearTimeout(ref.current as number);

        const idTimeout =  setTimeout(callback, time);

        ref.current = idTimeout;
    };

    return [ debounceCallback ];
};
