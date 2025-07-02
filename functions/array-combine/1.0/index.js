const arrayCombine = async ({ arrayA = [], arrayB = [] }) => {
  return { result: [...arrayA, ...arrayB] };
};

export default arrayCombine;
