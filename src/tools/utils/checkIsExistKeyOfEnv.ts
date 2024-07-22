// Types
type CheckEnv = string | undefined;

export const checkIsExistKeyOfEnv = (value: CheckEnv) => {
    if (!value) {
        throw new Error('No key in ".env" a file, you need to add it');
    }

    return value;
};
