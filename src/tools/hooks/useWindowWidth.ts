"use client"

// Core
import { useState, useEffect } from 'react';

// Types
type UseWindowWidthContract = () => [ number, React.Dispatch<React.SetStateAction<number>> ];

/**
 * @returns [ width, setWidth ]
 */
export const useWindowWidth: UseWindowWidthContract = () => {
    const [ width, setWidth ] = useState<number>(0);

    const updateWidth = () => {
        setWidth(window.innerWidth);
    };

    useEffect(() => {
        updateWidth();
        window.addEventListener('resize', updateWidth);

        return () => {
            window.removeEventListener('resize', updateWidth);
        };
    }, []);

    return [ width, setWidth ];
};
