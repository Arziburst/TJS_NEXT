// Constants
export const ellipsis = '...';

// Types
import { ExtendedProduct } from '@/bus/products/types';

type CalculateTotalPages = {
    total: number;
    limit: number;
}

type Pagination = {
    array: null | [] | ExtendedProduct[];
    currentStep: number;
    limit: number;
}

type DetermineVisiblePages = {
    total: number;
    limit: number;
    currentStep: number
}

type CreatePageList = {
    total: number;
    limit: number;
    currentStep: number
}

// Constants
const stepsBetweenCurrentStep = 2;

// Functions
export const calculateTotalPages = ({ total, limit }: CalculateTotalPages) => {
    return Math.ceil(total / limit);
};

export const pagination = ({
    array,
    currentStep,
    limit,
}: Pagination) => {
    if (Array.isArray(array) && array.length > 0) {
        const startIndex = (currentStep - 1) * limit;
        const endIndex = startIndex + limit;

        return array.slice(startIndex, endIndex);
    }

    return array;
};

const determineVisiblePages = ({ total, limit, currentStep }: DetermineVisiblePages) => {
    const startPage = Math.max(1, currentStep - stepsBetweenCurrentStep);
    const endPage = Math.min(calculateTotalPages({ total, limit }), currentStep + stepsBetweenCurrentStep);

    return { startPage, endPage };
};

export const createPageList = ({ total, limit, currentStep }: CreatePageList) => {
    const visiblePages = determineVisiblePages({ total, limit, currentStep });
    const pageList = [];
    const doubleStepsBetweenCurrentStep = stepsBetweenCurrentStep + stepsBetweenCurrentStep;
    const totalPages = calculateTotalPages({
        total,
        limit,
    });

    if (totalPages > doubleStepsBetweenCurrentStep + 1 && currentStep > stepsBetweenCurrentStep + 1) {
        pageList.push(1);
        pageList.push(ellipsis);
    }
    if (totalPages > doubleStepsBetweenCurrentStep && currentStep < doubleStepsBetweenCurrentStep) {
        for (let i = visiblePages.startPage; i <= stepsBetweenCurrentStep + stepsBetweenCurrentStep + 1; i++) {
            pageList.push(i);
        }
    } else if (totalPages > doubleStepsBetweenCurrentStep && currentStep > totalPages - doubleStepsBetweenCurrentStep) {
        for (let i = visiblePages.endPage - doubleStepsBetweenCurrentStep; i <= visiblePages.endPage; i++) {
            pageList.push(i);
        }
    } else if (totalPages <= doubleStepsBetweenCurrentStep + 1) {
        for (let i = 1; i <= totalPages; i++) {
            pageList.push(i);
        }
    } else {
        for (let i = visiblePages.startPage; i <= visiblePages.endPage; i++) {
            pageList.push(i);
        }
    }

    if (totalPages > doubleStepsBetweenCurrentStep + 1 && currentStep < totalPages - stepsBetweenCurrentStep) {
        pageList.push(ellipsis);
        pageList.push(totalPages);
    }

    return pageList;
};
