// Core
import { useEffect, useState, MutableRefObject } from 'react';

// Types
type UseSetNumberToVariableOfCSS = {
    name: string,
    variant: 'clientHeight' | 'clientWidth',
    HTMLElement?: HTMLElement,
    ref?: MutableRefObject<HTMLElement | null>
}

type GetNumber = Pick<UseSetNumberToVariableOfCSS, 'variant' | 'HTMLElement' | 'ref'>

const getNumber = (params: GetNumber) => {
    if (params.HTMLElement && params.ref) {
        throw new Error('Hook useSetNumberToVariableOfCSS: You can\'t use both HTMLElement and ref at the same time');
    } else if (params.HTMLElement) {
        return params.HTMLElement[ params.variant ];
    } else if (params.ref) {
        return params.ref.current ? params.ref.current[ params.variant ] : 0;
    }

    return null;
};

export const useSetNumberToVariableOfCSS = ({
    name,
    variant,
    HTMLElement,
    ref,
}: UseSetNumberToVariableOfCSS) => {
    const [ valueState, setValueState ] = useState(getNumber({ variant, HTMLElement, ref }));

    const updateValue = () => {
        setValueState(() => {
            const result = getNumber({ variant, HTMLElement, ref });
            if (result) {
                document.documentElement.style.setProperty(name, `${result}px`);
            }

            return result;
        });
    };

    useEffect(() => {
        updateValue();
        window.addEventListener('resize', updateValue);

        return () => {
            window.removeEventListener('resize', updateValue);
        };
    }, []);

    return [ valueState, setValueState ];
};
