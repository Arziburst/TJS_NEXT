// How to use:
// 1. type User = {name: string; age: number};
// 2. const user: User = {name: 'Jon', age: 20};
// 3. removeKeysOfObject<User, 'age'>({ keys: ['age'], object: user })
// Result: {name: 'Jon'}

// Types
type PropTypes<T> = {
    keys: (keyof T)[];
    object: T;
};

export const removeKeysOfObject = <OriginalObject, SkipKeys extends keyof OriginalObject>({
    keys,
    object,
}: PropTypes<OriginalObject>): Omit<OriginalObject, SkipKeys> => {
    const newObj = { ...object };
    for (const key of keys) {
        delete newObj[ key ];
    }

    return newObj as Omit<OriginalObject, SkipKeys>;
};
