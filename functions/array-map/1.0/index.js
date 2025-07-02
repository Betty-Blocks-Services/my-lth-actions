const travelPath = (object, path) => {
    const keys = path.split('.');
    let result = object;
    for (const key of keys) {
        result = result[key];
    }
    return result;
};
const mapArray = async ({ array: { data: array }, path }) => {
    let result = array;
    if (path.includes('.')) {
        result = result.map((item) => {
            if (typeof item === 'object') {
                return travelPath(item, path);
            }
            else {
                throw new Error('Array item is not an object. Cannot travel path');
            }
        });
    }
    else {
        result = array.map((item) => item[path]);
    }
    return {
        result
    };
};
export default mapArray;
