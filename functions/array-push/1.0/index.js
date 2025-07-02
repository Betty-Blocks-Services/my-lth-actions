const travelPath = (object, path) => {
    const keys = path.split('.');
    let result = object;
    for (const key of keys) {
        result = result[key];
    }
    return result;
};
const arrayPush = async ({ array: { data: array }, path, data, filter = false, logging = false }) => {
    let result = array;
    const value = Number(data);
    if (path) {
        if (logging)
            console.log('path', path);
        result = result.map((item) => {
            if (typeof item === 'object') {
                return travelPath(item, path);
            }
            else {
                throw new Error('Array item is not an object. Cannot travel path');
            }
        });
    }
    if (isNaN(value)) {
        if (logging)
            console.error('Value is not a number');
        throw new Error('Value is not a number');
    }
    if (filter) {
        if (logging)
            console.log('filter', filter);
        // "If true, the value will only be pushed if it is not already in the array.
        if (result.includes(value)) {
            if (logging)
                console.log('Value already in array');
            return { result };
        }
    }
    if (logging)
        console.log('Pushing value to array');
    result.push(value);
    if (logging)
        console.log('Result', result);
    return { result };
};
export default arrayPush;
