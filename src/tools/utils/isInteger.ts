export const isInteger = (str: string) => {
    if (/^-?\d+$/.test(str)) {
        const number = parseInt(str, 10);

        return !isNaN(number) && isFinite(number);
    }

    return false;
};
