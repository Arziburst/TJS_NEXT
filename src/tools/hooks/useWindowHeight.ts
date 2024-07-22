// Core
import { useState, useEffect } from 'react';

// Types
type UseWindowHeightContract = () => [ number, React.Dispatch<React.SetStateAction<number>> ];

/**
 * @returns [ height, setHeight ]
 */
export const useWindowHeight: UseWindowHeightContract = () => {
    const [ height, setHeight ] = useState<number>(window.innerHeight);

    const updateHeight = () => {
        setHeight(window.innerHeight);
    };

    useEffect(() => {
        updateHeight();
        window.addEventListener('resize', updateHeight);

        return () => {
            window.removeEventListener('resize', updateHeight);
        };
    }, []);

    return [ height, setHeight ];
};
