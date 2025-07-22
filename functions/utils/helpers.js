import { parse, isValid, formatISO } from "date-fns";

const snakeToCamel = (str) => {
  str = str.replace(/_[0-9]/g, (m, chr) => "!" + m);
  str = str.replace(/[^a-zA-Z0-9!]+(.)/g, (m, chr) => chr.toUpperCase());
  return str.replace(/[!]/g, "_");
};

const returnDateTimeValue = (dateString, dateType) => {
  switch (dateType.toLowerCase().trim()) {
    case "time":
      return dateString.substr(11, 8);
      break;
    case "date":
      return dateString.substring(0, 10);
      break;
    case "datetime":
      return dateString.substring(0, 19);
      break;
    default:
      return dateString;
      break;
  }
};

const convertToDBDateFormat = (dateString, format, dateType) => {
  const date = !isValid(dateString)
    ? parse(dateString.toString().trim(), format.toString().trim(), new Date())
    : dateString;
  if (!isValid(date)) return null;
  return returnDateTimeValue(formatISO(date).replace("T", " "), dateType);
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
  console.error(`Error: ${error.message || JSON.stringify(error)}`);
  throw new Error(`Error: ${error.message || JSON.stringify(error)}`);
};

export { snakeToCamel, convertToDBDateFormat, convertToBoolean, throwError };
