const arraySplit = async ({ value, delimiter = ',', trim = false, removeEmpty = false, logging }) => {
    const result = [];
    if (logging)
        console.log('arraySplit', { value, delimiter, logging });
    if (typeof value !== 'string') {
        if (logging)
            console.error('Value is not a string');
        throw new Error('Value is not a string');
    }
    const values = value.split(delimiter);
    if (logging)
        console.log('values split into array:', values);
    values.forEach((value) => {
        if (value) {
            if (trim) {
                value = value.trim();
            }
            if (removeEmpty) {
                if (value) {
                    result.push(value);
                }
                return;
            }
            result.push(value);
        }
    });
    if (logging)
        console.log('result', result);
    return {
        result
    };
};
export default arraySplit;
