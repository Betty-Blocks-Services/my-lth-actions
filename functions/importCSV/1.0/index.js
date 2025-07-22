import { now } from "lodash";
import Papa from "papaparse";
import { parse, isValid, formatISO } from "date-fns";

const getRecordsFromCSV = async (csvUrl) => {
  const csvText = await fetch(csvUrl).then((response) => {
    const contentType = response.headers["content-type"][0];
    if (contentType && contentType.indexOf("text/csv") !== -1) {
      return response.text();
    } else {
      throwError(
        `File does not match the correct content (text/csv), this file has a content of ${contentType}`
      );
    }
  });
  const parsedCSV = Papa.parse(csvText, {
    skipEmptyLines: true,
    header: true,
    transformHeader: (h, i) => (i ? h : h.trim()),
  });
  return parsedCSV.data;
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
  let errorMessage = error;
  if (typeof error === "object") {
    if (error.errors) {
      errorMessage = JSON.stringify(error.errors).substring(0, 2000);
    } else errorMessage = JSON.stringify(error).substring(0, 2000);
  }
  console.error(errorMessage);
  throw new Error(JSON.stringify(error));
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
        "The number of records to update is too large. Please split your import file into smaller files."
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

const processRecords = async (
  importRecords,
  existingRecords,
  uniqueRecordColumnName,
  deduplicate,
  propertyMappings,
  propertyMappingsUpdate,
  propertyFormatMappings,
  uniqueRecordIdentifier
) => {
  const recordsToCreate = [];
  const recordsToUpdate = [];

  importRecords.forEach((importRecord, index) => {
    const importObj = {};
    const updateObj = {};

    // convert CSV values to database acceptable formats for date, date/time, time and checkbox properties
    if (propertyFormatMappings && propertyFormatMappings.length > 0) {
      propertyMappings.forEach((mapping) => {
        propertyFormatMappings.forEach((formatMapping) => {
          if (mapping.key === formatMapping.key) {
            switch (formatMapping.value.toLowerCase().trim()) {
              case "checkbox":
                importRecord[mapping.key] = convertToBoolean(
                  importRecord[mapping.key]
                );
                break;
              default: // date/time formats
                importRecord[mapping.key] = convertToDBDateFormat(
                  importRecord[mapping.key],
                  formatMapping.value.trim()
                );
                break;
            }
          }
        });
      });
    }

    if (propertyMappings.length > 0) {
      // convert CSV data to Betty specific objects
      propertyMappings.forEach((mapping) => {
        importObj[mapping.value] = importRecord[mapping.key];
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
        } else return false;
      } else {
        recordsToCreate.push(importObj);
      }
    }
  });
  return { recordsToUpdate: recordsToUpdate, recordsToCreate: recordsToCreate };
};

const importCsv = async ({
  csvUrl,
  model: { name: modelName },
  uniqueRecordColumnName,
  deduplicate,
  propertyMappings,
  propertyMappingsUpdate,
  propertyFormatMappings,
  logging,
}) => {
  try {
    let allCurrentRecords = [];
    let whereFilter = "";
    let whereFilterData = "";
    const startTime = now();
    propertyMappings.forEach((mapping) => {
      mapping.value = snakeToCamel(mapping.value);
    });
    propertyMappingsUpdate.forEach((mapping) => {
      mapping.value = snakeToCamel(mapping.value);
    });

    const propertiesDBNames = propertyMappings.map((item) => item.value);
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
    const importRecords = await getRecordsFromCSV(csvUrl);
    if (logging) {
      console.log(`Records in CSV: ${importRecords.length}`);
    }

    if (importRecords.totalCount > 50000)
      throwError(
        "The number of records to import is too large (more than 50000 records). Please split your import file into smaller files."
      );

    if (deduplicate && importRecords && importRecords.length > 0) {
      importRecords.forEach((item) => {
        whereFilterData += `\"${item[uniqueRecordColumnName]}\",`;
      });
      whereFilter = `{ ${uniqueRecordIdentifier.value}: { in: [${whereFilterData}]}}`;
      const gqlQueryWithWhere = gqlQuery.replace("$where", whereFilter);
      allCurrentRecords = await getAllRecords(gqlQueryWithWhere, 0, 200, []);
      if (logging) {
        console.log(`Retrieved records count: ${allCurrentRecords.length}`);
      }
    }

    const processedRecords = await processRecords(
      importRecords,
      allCurrentRecords,
      uniqueRecordColumnName,
      deduplicate,
      propertyMappings,
      propertyMappingsUpdate,
      propertyFormatMappings,
      uniqueRecordIdentifier
    );
    if (logging) {
      console.log("Finished preparing the CSV records for saving");
    }
    const { recordsToCreate } = processedRecords;
    const { recordsToUpdate } = processedRecords;

    if (recordsToCreate && recordsToCreate.length > 0) {
      if (logging) {
        console.log("Records to create: " + recordsToCreate.length);
        console.log(
          `Collection to create: ${
            recordsToCreate.length
          } items (showing the first 2000 characters): ${JSON.stringify(
            recordsToCreate
          ).substring(0, 2000)}`
        );
      }
      const createQuery = `
      mutation {
        createMany${modelName}(input: $input) {
          id
        }
      }
    `;

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

      if (createdData && logging) {
        const createdIdsCol = Object.values(createdData)[0];
        console.log("Finished creating " + createdIdsCol.length + " records");
      }
    }

    if (recordsToUpdate && recordsToUpdate.length > 0) {
      if (logging) {
        console.log("Records to update: " + recordsToUpdate.length);
        console.log(
          `Collection to Update: ${
            recordsToUpdate.length
          } items (showing the first 2000 characters): ${JSON.stringify(
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

      if (updatedData && logging) {
        const updatedIdsCol = Object.values(updatedData)[0];
        console.log("Finished updating " + updatedIdsCol.length + " records");
      }
    }

    if (logging) console.log(`Import finished in:  ${now() - startTime} ms`);

    let returnText = `records created: ${recordsToCreate.length}, records updated: ${recordsToUpdate.length}`;
    return {
      result: returnText,
    };
  } catch (error) {
    throwError(error);
  }
};

export default importCsv;
