const travelPath = (object, path) => {
    const keys = path.split('.');
    let result = object;
    for (const key of keys) {
        result = result[key];
    }
    return result;
};
const arrayJoin = async ({ array: { data: array }, separator, path }) => {
    if (!Array.isArray(array))
        throw new Error('Missing array input');
    let arrayToJoin = [];
    if (path) {
        for (const item of array) {
            if (typeof item === 'object') {
                arrayToJoin.push(travelPath(item, path));
            }
            else {
                throw new Error('Array item is not an object. Cannot travel path');
            }
        }
    }
    else {
        arrayToJoin = array;
    }
    const result = arrayToJoin.join(separator);
    return {
        result
    };
};
export default arrayJoin;
