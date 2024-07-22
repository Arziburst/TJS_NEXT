export const transformLinkPhoneNumber = (input: string) => {
    if (!input.includes('tel:+')) {
        throw new Error(`${transformLinkPhoneNumber.name}: the phone number must start with \'tel:+\'`);
    }

    const digitsOnly = input.replace(/\D/g, '');

    if (digitsOnly.length !== 12) {
        throw new Error(`${transformLinkPhoneNumber.name}: the phone number must contain 12 digits`);
    }

    const formattedNumber = `+${digitsOnly.slice(0, 2)} (${digitsOnly.slice(2, 5)}) ${digitsOnly.slice(5, 8)} ${digitsOnly.slice(8, 10)} ${digitsOnly.slice(10, 12)}`;

    return formattedNumber;
};
