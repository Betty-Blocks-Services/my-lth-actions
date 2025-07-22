const arrayCount = async ({ array }) => {
  try {
    if (!array || !Array.isArray(array)) {
      throw new Error("Provided array is not valid");
    }
    return { result: array.length };
  } catch (err) {
    const message = err.message;
    throw new Error(`Unable to count array: ${message}`);
  }
};

export default arrayCount;
