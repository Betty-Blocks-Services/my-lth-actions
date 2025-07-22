const travelPath = (object, path) => {
  const keys = path.split(".");
  let result = object;
  for (const key of keys) {
    result = result[key];
  }
  return result;
};

const arrayReduce = async ({
  array,
  path, // optional: dot-delimited path into each item
  reducer, // one of "sum", "min", "max", "concat", "count"
  initialValue, // optional override for the accumulator’s start
}) => {
  if (!Array.isArray(array) || !reducer) {
    throw new Error(
      "Array Reduce: Missing required parameters (array and reducer)",
    );
  }

  const reducers = {
    sum: (acc, val) => acc + Number(val),
    min: (acc, val) => Math.min(acc, Number(val)),
    max: (acc, val) => Math.max(acc, Number(val)),
    concat: (acc, val) => acc.concat(val),
  };

  const defaultInits = {
    sum: 0,
    min: Infinity,
    max: -Infinity,
    concat: [],
    count: 0,
  };

  const fn = reducers[reducer];
  if (!fn) {
    throw new Error(`Array Reduce: Invalid reducer "${reducer}"`);
  }

  const start =
    initialValue !== undefined ? initialValue : defaultInits[reducer];

  const result = array.reduce((acc, item) => {
    // pull out the value at path, or use the item itself
    const val = path ? travelPath(item, path) : item;

    return fn(acc, val);
  }, start);

  return { result };
};

export default arrayReduce;
