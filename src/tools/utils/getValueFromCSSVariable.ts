export const getValueFromCSSVariable = (
    name: string,
    patternRemovePartOfString?: string,
) => {
    if (!name.includes('--')) {
        throw new Error(`${getValueFromCSSVariable.name}: name must to start with "--"`);
    }

    const result = getComputedStyle(document.documentElement)
        .getPropertyValue(`${name}`);

    if (patternRemovePartOfString) {
        return Number(result.replaceAll(patternRemovePartOfString, ''));
    }

    return result;
};
