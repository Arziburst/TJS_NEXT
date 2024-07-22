// Core
import { MutableRefObject, useEffect, useState } from 'react';
import { useWindowWidth } from './useWindowWidth';

// Types
type UseCssPropertyValue = {
    ref: MutableRefObject<HTMLElement | null>;
    property: string;
}

export const useCssPropertyValue = ({
    ref,
    property,
}: UseCssPropertyValue) => {
    const [ cssValue, setCssValue ] = useState<null | string>(null);

    const [ windowWidth ] = useWindowWidth();

    useEffect(() => {
        if (!ref.current) {
            return;
        }

        const computedStyle = window.getComputedStyle(ref.current);
        const value = computedStyle.getPropertyValue(property);

        setCssValue(value);
    }, [ ref, property, windowWidth ]);

    return [ cssValue ];
};
