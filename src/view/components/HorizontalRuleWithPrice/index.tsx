// Core
import React, { FC } from 'react';

// Types
export interface HorizontalRuleWithTotalPricePropTypes extends
    React.HTMLAttributes<HTMLDivElement> {
    text: string;
    price: number;
}

export const HorizontalRuleWithPrice: FC<HorizontalRuleWithTotalPricePropTypes> = ({
    text,
    price,
    ...props
}) => {
    return (
        <div { ...props }>
            <hr className = { 'my-[18px] bg-tertiary-100 opacity-10 sb:my-[24px]' }/>
            <div className = 'flex flex-wrap justify-between'>
                <p className = { 'text-sm text-quaternary uppercase font-secondary font-bold tracking-[20%]' }>
                    {text}
                </p>
                <p className = { 'text-quaternary' }>
                    {price} ₴
                </p>
            </div>
        </div>
    );
};
