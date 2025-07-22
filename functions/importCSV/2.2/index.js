import { now } from "lodash";
import { parse, isValid, formatISO } from "date-fns";

const splitArray = (arr, size) => {
  if (size <= 0) {
    return arr;
  }

  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }

  return result;
};

const fetchOne = async (modelName, properties, where) => {
  const queryName = `one${modelName}`;
  const query = `{
      ${queryName}(where: ${where}) {
        id
        ${properties.join("\n")}
      }
    }
  `;

  const { data, errors } = await gql(query);
  if (errors) {
    throw new Error(errors);
  }

  const { [queryName]: record } = data;

  return record;
};

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

const getRecordsFromCSV = async (csvUrl, logging) => {
  const startTime = now();
  const csvText = await parseData({
    data: csvUrl,
    format: "CSV",
  });
  if (logging) {
    console.log(`Retrieved the CSV file in: ${now() - startTime} ms`);
  }
  return csvText;
};

const snakeToCamel = (str) => {
  str = str.replace(/_[0-9]/g, (m, chr) => "!" + m);
  str = str.replace(/[^a-zA-Z0-9!]+(.)/g, (m, chr) => chr.toUpperCase());
  return str.replace(/[!]/g, "_");
};

const convertToDBDateFormat = (dateString, format) => {
  const date = parse(dateString, format, new Date());
  if (!isValid(date)) {
    return null;
  }
  return formatISO(date).replace("T", " ").substring(0, format.length);
};

const convertToBoolean = (value) => {
  const checkValue = value ? value.toString().toLowerCase().trim() : "";

  if (
    checkValue === "true" ||
    checkValue === "false" ||
    checkValue === "1" ||
    checkValue === "0" ||
    checkValue === ""
  )
    return Boolean(JSON.parse(checkValue));
  else return Boolean(checkValue);
};

const throwError = (error) => {
  console.error(
    "productcore",
    JSON.stringify(error, Object.getOwnPropertyNames(error))
  );
  throw new Error(JSON.stringify(error, Object.getOwnPropertyNames(error)));
};

const runGQL = async (gqlQuery, input) => {
  let response = {};
  response = await gql(gqlQuery, {
    input: input,
  });
  return response;
};

const getAllRecords = async (gqlQuery, skip, take, results) => {
  const gqlResponse = await gql(gqlQuery, {
    skip: skip,
    take: take,
  });
  if (gqlResponse) {
    const gqlQueryObject = Object.values(gqlResponse)[0]; // the data object
    const tmpResults = Object.values(gqlQueryObject)[0]; // the all query object which contains the result and totalcount

    if (tmpResults.totalCount > 20000)
      throwError(
        "The number of records to update is too large. Please turn on batching for this step and select a batch size between 0 and 10.000."
      );

    skip += take;
    if (tmpResults.results.length) {
      const newResults = [...results, ...tmpResults.results];
      results = newResults;
      if (skip <= tmpResults.totalCount) {
        results = await getAllRecords(gqlQuery, skip, take, results);
      }
    }
  }
  return results;
};

const formatCSVRecordValues = (
  RecordsToSanitize,
  propertyMappings,
  propertyFormatMappings
) => {
  return RecordsToSanitize.map((record) => {
    // convert CSV values to database acceptable formats for date, date/time, time, decimal and checkbox properties
    if (propertyFormatMappings && propertyFormatMappings.length > 0) {
      propertyMappings.forEach((mapping) => {
        propertyFormatMappings.forEach((formatMapping) => {
          if (mapping.key === formatMapping.key && record[mapping.key]) {
            switch (formatMapping.value.toLowerCase().trim()) {
              case "decimal":
                // if there is no dot notation, fix this by adding the .00
                const sanitizedDecimalRecordValue = record[mapping.key]
                  .toString()
                  .replace(",", ".");
                if (sanitizedDecimalRecordValue.indexOf(".") === -1)
                  record[mapping.key] = sanitizedDecimalRecordValue + ".00";
                else {
                  record[mapping.key] = parseFloat(sanitizedDecimalRecordValue)
                    .toFixed(2)
                    .toString();
                }
                break;
              case "checkbox":
                record[mapping.key] = convertToBoolean(record[mapping.key]);
                break;
              default: // date/time formats
                record[mapping.key] = convertToDBDateFormat(
                  record[mapping.key],
                  formatMapping.value.trim()
                );
                break;
            }
          }
        });
      });
    }
    return record;
  });
};

const prepareRecords = async (
  records,
  existingRecords,
  uniqueRecordColumnName,
  deduplicate,
  propertyMappings,
  propertyMappingsUpdate,
  propertyFormatMappings,
  uniqueRecordIdentifier,
  relationLookupData
) => {
  const recordsToCreate = [];
  const recordsToUpdate = [];

  records.forEach((importRecord) => {
    const importObj = {};
    const updateObj = {};

    // // convert CSV values to database acceptable formats for date, date/time, time, decimal and checkbox properties
    // if (propertyFormatMappings && propertyFormatMappings.length > 0) {
    //   propertyMappings.forEach((mapping) => {
    //     propertyFormatMappings.forEach((formatMapping) => {
    //       if (mapping.key === formatMapping.key && importRecord[mapping.key]) {
    //         switch (formatMapping.value.toLowerCase().trim()) {
    //           case "decimal":
    //             // if there is no dot notation, fix this by adding the .00
    //             const sanitizedDecimalRecordValue = importRecord[mapping.key]
    //               .toString()
    //               .replace(",", ".");
    //             if (sanitizedDecimalRecordValue.indexOf(".") === -1)
    //               importRecord[mapping.key] =
    //                 sanitizedDecimalRecordValue + ".00";
    //             break;
    //           case "checkbox":
    //             importRecord[mapping.key] = convertToBoolean(
    //               importRecord[mapping.key]
    //             );
    //             break;
    //           default: // date/time formats
    //             importRecord[mapping.key] = convertToDBDateFormat(
    //               importRecord[mapping.key],
    //               formatMapping.value.trim()
    //             );
    //             break;
    //         }
    //       }
    //     });
    //   });
    // }

    if (propertyMappings.length > 0) {
      propertyMappings.forEach((mapping) => {
        if (mapping.isRelation) {
          const relationalLookupData = relationLookupData.find(
            (item) => item.relationCSVName === mapping.key
          );
          if (relationalLookupData) {
            const records = relationalLookupData.records;
            const relationObject = records.find((element) => {
              if (element[mapping.value] === importRecord[mapping.key]) {
                return element;
              }
            });

            if (relationObject) {
              importObj[mapping.relationName] = {
                id: relationObject.id,
              };
            } else {
              importObj[mapping.relationName] = {};
            }
          }
        } else {
          importObj[mapping.value] = importRecord[mapping.key];
        }
      });

      if (propertyMappingsUpdate.length > 0) {
        propertyMappingsUpdate.forEach((mapping) => {
          updateObj[mapping.value] = importRecord[mapping.key];
        });
      }

      if (deduplicate) {
        if (importRecord[uniqueRecordColumnName] !== "") {
          const existingRecord = existingRecords.find(
            (record) =>
              record[uniqueRecordIdentifier.value].toString() ===
              importRecord[uniqueRecordIdentifier.key].toString()
          );
          if (existingRecord) {
            if (propertyMappingsUpdate.length > 0) {
              updateObj.id = existingRecord.id;
              recordsToUpdate.push(updateObj);
            } else {
              importObj.id = existingRecord.id;
              recordsToUpdate.push(importObj);
            }
          } else {
            recordsToCreate.push(importObj);
          }
        }
      } else {
        recordsToCreate.push(importObj);
      }
    }
  });
  return { recordsToUpdate: recordsToUpdate, recordsToCreate: recordsToCreate };
};

const prepareRelationMappings = (propertyMapping, formatMappings) => {
  const enrichedMapping = propertyMapping.map((mapping) => {
    mapping.isRelation = false;
    if (mapping.value.indexOf(".") !== -1) {
      const relationModelProperty = mapping.value.split(".");
      if (relationModelProperty && relationModelProperty.length === 2) {
        const modelName = snakeToCamel(relationModelProperty[0]);
        const propertyName = snakeToCamel(relationModelProperty[1]);
        mapping.isRelation = true;
        mapping.relationModelName =
          modelName.charAt(0).toUpperCase() + modelName.slice(1);
        mapping.relationName = modelName;
        mapping.relationCSVName = mapping.key;
        mapping.value = propertyName;
        const mappingPropertyFormat = formatMappings.find(
          (formatMap) => mapping.key === formatMap.key
        );
        if (mappingPropertyFormat) {
          mapping.relationPropertyType = mappingPropertyFormat.value
            .toLowerCase()
            .trim();
        }
        return mapping;
      }
    } else {
      mapping.value = snakeToCamel(mapping.value);
      return mapping;
    }
  });
  return enrichedMapping ? enrichedMapping : propertyMapping;
};

const getWhere = (records, csvColumn, dbColumn, isDecimal) => {
  const uniqueValues = [];
  let whereFilterData = "";
  records.forEach((item) => {
    if (item[csvColumn]) {
      if (!uniqueValues.includes(item[csvColumn]))
        uniqueValues.push(item[csvColumn]);
    }
  });
  if (isDecimal) {
    uniqueValues.forEach((item) => {
      whereFilterData += `{${dbColumn} : {eq:\"${item}\"}},`;
    });
    return `{ _or: [${whereFilterData}]}`;
  } else {
    uniqueValues.forEach((item) => {
      whereFilterData += `\"${item}\",`;
    });
    return `{ ${dbColumn}: { in: [${whereFilterData}]}}`;
  }
};

const getRelationLookupData = async (mainMappings, updateMappings, records) => {
  const mappings = mainMappings.concat(updateMappings);
  const lookupData = [];

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    if (mapping.isRelation) {
      const isMappingDecimal = mapping.relationPropertyType === "decimal";
      const whereFilter = getWhere(
        records,
        mapping.key,
        mapping.value,
        isMappingDecimal
      );
      const gqlRelationQuery = `{
        all${mapping.relationModelName}(skip: $skip, take: $take, where: $where) {
          results {
              id
              ${mapping.value}
          }, 
          totalCount
        }
      }`;
      const gqlQueryWithWhere = gqlRelationQuery.replace("$where", whereFilter);
      const returnedData = await getAllRecords(gqlQueryWithWhere, 0, 200, []);
      const item = {};
      item.relationCSVName = mapping.key;
      item.relationDBName = mapping.relationCSVName;
      item.records = returnedData;
      lookupData.push(item);
    }
  }
  return lookupData;
};

const processRecords = async (
  importRecords,
  propertyMappingMain,
  propertyMappings,
  propertyFormatMappings,
  propertyMappingsUpdateSpecific,
  deduplicate,
  uniqueRecordColumnName,
  uniqueRecordColumnType,
  batched,
  batchSize,
  batchOffset,
  startTime,
  logging,
  modelName
) => {
  let allCurrentRecords = [];
  let loggingMessage = `Finished batch ${batchOffset + 1} ( records: ${
    batchOffset * batchSize
  } to ${
    importRecords.length < (batchOffset + 1) * batchSize
      ? (batchOffset + 1) * batchSize
      : (batchOffset + 1) * batchSize - importRecords.length
  })`;

  const csvFormattedRecords = formatCSVRecordValues(
    importRecords,
    propertyMappings,
    propertyFormatMappings
  );

  const relationLookupData = await getRelationLookupData(
    propertyMappingMain,
    propertyMappingsUpdateSpecific,
    csvFormattedRecords
  );

  const relationLookupDataString = JSON.stringify(relationLookupData);

  if (logging && relationLookupDataString !== "[]") {
    console.log(
      "Relational Lookup Data (first 2000 characters): " +
        relationLookupDataString.substring(0, 2000)
    );
  }

  const propertiesDBNames = [];
  propertyMappingMain.forEach((item) => {
    if (!item.isRelation) propertiesDBNames.push(item.value);
  });

  let uniqueRecordIdentifier = undefined;

  if (deduplicate && uniqueRecordColumnName !== "") {
    uniqueRecordIdentifier = propertyMappings.find(
      (item) =>
        item.key.toString().toLowerCase().trim() ===
        uniqueRecordColumnName.toString().toLowerCase().trim()
    );

    if (uniqueRecordIdentifier === undefined)
      throwError(
        "No unique record identifier can be found in the mappings. Make sure you add the CSV column and property database name (in snake_case) in the mappings above!"
      );
  }

  const gqlQuery = `{
    all${modelName}(skip: $skip, take: $take, where: $where) {
      results {
          id
        ${propertiesDBNames.join(" ")}
      }, 
      totalCount
    }
  }`;

  if (deduplicate && csvFormattedRecords && csvFormattedRecords.length > 0) {
    const whereFilter = getWhere(
      csvFormattedRecords,
      uniqueRecordColumnName,
      uniqueRecordIdentifier.value,
      uniqueRecordColumnType === "decimal"
    );
    const gqlQueryWithWhere = gqlQuery.replace("$where", whereFilter);
    allCurrentRecords = await getAllRecords(gqlQueryWithWhere, 0, 200, []);
  }

  const processedRecords = await prepareRecords(
    csvFormattedRecords,
    allCurrentRecords,
    uniqueRecordColumnName,
    deduplicate,
    propertyMappingMain,
    propertyMappingsUpdateSpecific,
    propertyFormatMappings,
    uniqueRecordIdentifier,
    relationLookupData
  );
  const { recordsToCreate } = processedRecords;
  const { recordsToUpdate } = processedRecords;

  if (recordsToCreate && recordsToCreate.length > 0) {
    const createQuery = `
    mutation {
      createMany${modelName}(input: $input) {
        id
      }
    }
  `;

    if (logging && !batched) {
      console.log(
        `Collection to create: ${
          recordsToCreate.length
        } items (first 2000 characters): ${JSON.stringify(
          recordsToCreate
        ).substring(0, 2000)}`
      );
    }

    const sanitizedrecordsToCreate = recordsToCreate.map((record) => {
      // The createMany mutation does not accept an ID property so we remove this from the records
      delete record.id;
      return record;
    });

    const { data: createdData, errors: createdErrors } = await runGQL(
      createQuery,
      sanitizedrecordsToCreate
    );

    if (createdErrors) throwError(createdErrors);

    const createdIdsCol = Object.values(createdData)[0];
    if (!batched)
      console.log("Finished creating " + createdIdsCol.length + " records");
    else loggingMessage += ` New: ${createdIdsCol.length}`;
  }

  if (recordsToUpdate && recordsToUpdate.length > 0) {
    if (logging && !batched) {
      console.log(
        `Collection to Update: ${
          recordsToUpdate.length
        } items (first 2000 characters): ${JSON.stringify(
          recordsToUpdate
        ).substring(0, 2000)}`
      );
    }
    const updateQuery = `
    mutation {
      upsertMany${modelName}(input: $input) {
        id
      }
    }
  `;

    const { data: updatedData, errors: updatedErrors } = await runGQL(
      updateQuery,
      recordsToUpdate
    );
    if (updatedErrors) throwError(updatedErrors);

    if (logging && updatedData) {
      const updatedIdsCol = Object.values(updatedData)[0];
      if (!batched)
        console.log("Finished updating " + updatedIdsCol.length + " records");
      else loggingMessage += ` Updated: ${updatedIdsCol.length}`;
    }
  }

  if (logging) {
    if (!batched) console.log(`Import finished in: ${now() - startTime} ms`);
    else {
      loggingMessage += ` in: ${now() - startTime} ms`;
    }
  }

  if (!batched)
    loggingMessage = `Records created: ${recordsToCreate.length}, records updated: ${recordsToUpdate.length}`;

  return loggingMessage;
};

const importCsv = async ({
  csvUrl,
  model: { name: modelName },
  uniqueRecordColumnName,
  uniqueRecordColumnType,
  deduplicate,
  propertyMappings,
  propertyMappingsUpdate,
  propertyFormatMappings,
  batched,
  batchModel,
  batchSize,
  batchSizeProperty,
  batchOffsetProperty,
  batchFileNameProperty,
  logging,
}) => {
  try {
    const batchModelName = batchModel ? batchModel.name : null;
    const batchSizePropertyName = batchSizeProperty
      ? batchSizeProperty[0].name
      : null;
    const batchOffsetPropertyName = batchOffsetProperty
      ? batchOffsetProperty[0].name
      : null;
    const batchFilePropertyName = batchFileNameProperty
      ? batchFileNameProperty[0].name
      : null;
    let importRecords = [];
    if (csvUrl) importRecords = await getRecordsFromCSV(csvUrl, logging);
    else throwError("No CSV import URL found.");
    if (logging) {
      console.log(`Records in CSV: ${importRecords.length}`);
    }

    if (!batched && importRecords.totalCount > 50000)
      throwError(
        "The number of records to import is too large (more than 50000 records). Please split your CSV file into several smaller files."
      );

    const propertyMappingMain = prepareRelationMappings(
      propertyMappings,
      propertyFormatMappings
    );
    if (logging) {
      console.log(
        "Main Mappings (first 2000 characters): " +
          JSON.stringify(propertyMappingMain)
      );
    }

    const propertyMappingsUpdateSpecific = prepareRelationMappings(
      propertyMappingsUpdate
    );
    const propertyMappingsUpdateSpecificString = JSON.stringify(
      propertyMappingsUpdateSpecific
    );
    if (logging && propertyMappingsUpdateSpecificString !== "[]") {
      console.log(
        "Update Specific Mappings (first 2000 characters): " +
          propertyMappingsUpdateSpecificString.substring(0, 2000)
      );
    }

    if (batched) {
      let currentBatch = 0;
      recordsToCreateInBatches = splitArray(importRecords, batchSize);
      if (logging)
        console.log(
          `Number of batches: ${recordsToCreateInBatches.length} ( batchsize:  ${batchSize} )`
        );

      const propertiesBatchDBNames = [];
      propertiesBatchDBNames.push(batchFilePropertyName);
      propertiesBatchDBNames.push(batchOffsetPropertyName);

      where = `{ ${batchFilePropertyName}: { eq: "${csvUrl}"} }`;

      let batchRecord = await fetchOne(
        batchModelName,
        propertiesBatchDBNames,
        where
      );

      if (batchRecord) {
        currentBatch = batchRecord[batchOffsetPropertyName];
        if (logging)
          console.log(
            `Existing batch record for this file found, continuing with batch: ${
              currentBatch + 1
            }`
          );
      } else {
        const newBatchRecord = {};
        newBatchRecord[batchOffsetPropertyName] = 0;
        newBatchRecord[batchFilePropertyName] = csvUrl;
        newBatchRecord[batchSizePropertyName] = 0;
        const createdBatchRecord = await createOne(
          batchModelName,
          newBatchRecord
        );
        newBatchRecord["id"] = createdBatchRecord.id;
        batchRecord = newBatchRecord;
      }

      for (i = currentBatch; i < recordsToCreateInBatches.length; i++) {
        if (logging) {
          console.log(
            `Starting batch ${i + 1}: ( records ${i * batchSize} to ${
              (i + 1) * batchSize
            } )`
          );
        }

        const result = await processRecords(
          recordsToCreateInBatches[i],
          propertyMappingMain,
          propertyMappings,
          propertyFormatMappings,
          propertyMappingsUpdateSpecific,
          deduplicate,
          uniqueRecordColumnName,
          uniqueRecordColumnType,
          batched,
          batchSize,
          i,
          now(),
          logging,
          modelName
        );

        if (result) {
          batchRecord[batchOffsetPropertyName] = i + 1;
          batchRecordWithoutId = { ...batchRecord };
          delete batchRecordWithoutId.id;
          const updatedRecord = await updateOne(
            batchModelName,
            batchRecord.id,
            batchRecordWithoutId
          );
          if (batched && logging) {
            console.log(result);
          }
        }
      }

      const deletedBatchRecord = await deleteOne(
        batchModelName,
        batchRecord.id
      );
    } else {
      const result = await processRecords(
        importRecords,
        propertyMappingMain,
        propertyMappings,
        propertyFormatMappings,
        propertyMappingsUpdateSpecific,
        deduplicate,
        uniqueRecordColumnName,
        uniqueRecordColumnType,
        false,
        0,
        0,
        now(),
        logging,
        modelName
      );
    }
    return {
      result: `Finished processing ${importRecords.length} records.`,
    };
  } catch (error) {
    throwError(error);
  }
};

export default importCsv;
