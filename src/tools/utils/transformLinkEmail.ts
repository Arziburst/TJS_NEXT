export const transformLinkEmail = (input: string) => {
    if (!input.includes('mailto:')) {
        throw new Error(`${transformLinkEmail.name}: input must include "mailto:"`);
    }

    return input.replace('mailto:', '');
};
