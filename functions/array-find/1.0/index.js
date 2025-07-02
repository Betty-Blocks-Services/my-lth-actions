const travelPath = (object, path) => {
  const keys = path.split(".");
  let result = object;
  for (const key of keys) {
    result = result[key];
  }
  return result;
};
const arrayFind = async ({ array, path, value, operator }) => {
  if (!array || !path || !value || !operator) {
    console.log({ array, path, value, operator });
    throw new Error("Array Find: Missing required parameters to filter array");
  }
  const operators = {
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    gte: (a, b) => a >= b,
    lte: (a, b) => a <= b,
    cont: (a, b) => a.includes(b),
    ncont: (a, b) => !a.includes(b),
  };
  const filterFn = operators[operator];
  if (!filterFn) {
    throw new Error("Invalid operator");
  }
  const result = array.find((item) => {
    if (typeof item === "string") {
      return filterFn(item, value);
    }
    if (typeof item === "number") {
      return filterFn(item, Number(value));
    }
    const itemValue = travelPath(item, path);
    if (typeof itemValue === "string") {
      return filterFn(itemValue, value);
    }
    if (typeof itemValue === "number") {
      return filterFn(itemValue, Number(value));
    }
    throw new Error("Invalid value type");
  });
  return {
    result,
  };
};
export default arrayFind;
