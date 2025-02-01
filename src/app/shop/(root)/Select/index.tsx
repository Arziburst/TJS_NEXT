// Core
import React, { FC } from 'react';
import { TFunction } from 'i18next';

// Components
import { Select as SelectCore } from '@/view/components';
import { Label } from '../Label';

// Types
export type SelectShopPropTypes = {
    label: string;
    value: null | string;
    showValue: null | string;
    items: string[];
    setValue: (value: string) => void;
    tString: string;
    t: TFunction;
    placeholder?: string;
    onClick?: (item: string) => void;
}

export const Select: FC<SelectShopPropTypes> = ({
    label,
    value,
    showValue,
    items,
    setValue,
    tString,
    t,
    placeholder,
    onClick,
}) => {
    return (
        <div className='flex flex-col gap-[10px]'>
            <Label>
                {label}
            </Label>
            <SelectCore.Root
                value={value || ''}
                onValueChange={setValue}>
                <SelectCore.SelectTrigger
                    isArrow
                    className='capitalize'
                    variant='ghost'>
                    <SelectCore.SelectValue
                        aria-label={value || ''}
                        className='text-[15px]'>
                        {showValue || placeholder}
                    </SelectCore.SelectValue>
                </SelectCore.SelectTrigger>
                <SelectCore.SelectContent variant='outline'>
                    {items.map((item) => (
                        <SelectCore.SelectItem
                            className='py-2 px-3 capitalize'
                            key={item}
                            value={item}
                            onClick={() => onClick && onClick(item)}>
                            {t(`${tString}.${item}`)}
                        </SelectCore.SelectItem>
                    ))}
                </SelectCore.SelectContent>
            </SelectCore.Root>
        </div>
    );
};
