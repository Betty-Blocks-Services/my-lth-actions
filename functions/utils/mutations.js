const createOne = async (modelName, newRecord) => {
  const queryName = `create${modelName}`;
  const query = `
    mutation {
      ${queryName}(input: $input) {
        id
      }
    }
  `;

  const { data, errors } = await gql(query, {
    input: newRecord,
  });

  if (errors) {
    throw new Error(errors);
  }

  const { [queryName]: record } = data;
  return record;
};

const updateOne = async (modelName, id, input) => {
  const queryName = `update${modelName}`;
  const query = `
    mutation {
      ${queryName}(id: $id, input: $input) {
        id
      }
    }
  `;

  const { data, errors } = await gql(query, { id: id, input: input });

  if (errors) {
    throw new Error(errors);
  }

  const { [queryName]: record } = data;

  return record;
};

const deleteOne = async (modelName, id) => {
  const queryName = `delete${modelName}`;
  const query = `
    mutation {
      ${queryName}(id: $id) {
        id
      }
    }
  `;

  const { data, errors } = await gql(query, { id });

  if (errors) {
    throw new Error(errors);
  }

  const { [queryName]: record } = data;

  return record;
};

export { createOne, updateOne, deleteOne };
