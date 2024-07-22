export const transformPathToTranslation = (path: string) => {
    const result = path.split('-').map((latter, index) => index !== 0 ? latter.charAt(0).toUpperCase() + latter.slice(1) : latter)
        .join('')
        .replace('/', '');

    return result;
};
