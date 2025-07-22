const travelPath = (object, path) => {
  const keys = path.split(".");
  let result = object;
  for (const key of keys) {
    result = result[key];
  }
  return result;
};
const arrayFilter = async ({ array, path, value, operator, valueIsDate }) => {
  console.log({ array });
  if (!array || !path || !value || !operator) {
    console.log({ array, path, value, operator });
    throw new Error(
      "Array Filter: Missing required parameters to filter array",
    );
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
  const result = array.filter((item) => {
    if (typeof item === "string") {
      if (valueIsDate) {
        const itemAsDate = new Date(item).getTime();
        console.log(new Date(item));
        const valueAsDate =
          typeof value === "number" ? value : new Date(value).getTime();

        return filterFn(itemAsDate, valueAsDate);
      }
      return filterFn(item, value);
    }
    if (typeof item === "number") {
      return filterFn(item, Number(value));
    }
    const itemValue = travelPath(item, path);

    if (typeof itemValue === "string") {
      if (valueIsDate) {
        console.log(new Date(itemValue));
        const itemAsDate = new Date(itemValue).getTime();
        const valueAsDate =
          typeof value === "number" ? value : new Date(value).getTime();
        return filterFn(itemAsDate, valueAsDate);
      }

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
export default arrayFilter;
