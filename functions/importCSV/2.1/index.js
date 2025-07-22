import { now } from "lodash";
import Papa from "papaparse";
import { parse, isValid, formatISO } from "date-fns";

const getRecordsFromCSV = async (csvUrl) => {
  const supportedMimeTypes = [
    "text/csv",
    "text/x-csv",
    "application/x-csv",
    "application/csv",
    "text/x-comma-separated-values",
    "text/comma-separated-values",
  ];
  const csvText = await fetch(csvUrl).then((response) => {
    const contentType = response.headers["content-type"][0];
    if (
      contentType &&
      supportedMimeTypes.find((mimeType) => mimeType === contentType)
    ) {
      return response.text();
    } else {
      throwError(
        `File does not match any supported mime type. This file has a mime type of ${contentType}`
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

const processRecords = async (
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

const importCsv = async ({
  csvUrl,
  model: { name: modelName },
  uniqueRecordColumnName,
  uniqueRecordColumnType,
  deduplicate,
  propertyMappings,
  propertyMappingsUpdate,
  propertyFormatMappings,
  logging,
}) => {
  try {
    let allCurrentRecords = [];
    let importRecords = [];
    // let whereFilter = "";
    // let whereFilterData = "";
    const startTime = now();

    if (csvUrl) importRecords = await getRecordsFromCSV(csvUrl);
    else throwError("No CSV import URL found.");
    if (logging) {
      console.log(`Records in CSV: ${importRecords.length}`);
    }

    if (importRecords.totalCount > 50000)
      throwError(
        "The number of records to import is too large (more than 50000 records). Please split your import file into smaller files."
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
      if (logging) {
        console.log(`Retrieved records count: ${allCurrentRecords.length}`);
      }
    }

    const processedRecords = await processRecords(
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
      if (logging) {
        console.log(
          `Collection to create: ${
            recordsToCreate.length
          } items (first 2000 characters): ${JSON.stringify(
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

      if (logging && createdData) {
        const createdIdsCol = Object.values(createdData)[0];
        console.log("Finished creating " + createdIdsCol.length + " records");
      }
    }

    if (recordsToUpdate && recordsToUpdate.length > 0) {
      if (logging) {
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
