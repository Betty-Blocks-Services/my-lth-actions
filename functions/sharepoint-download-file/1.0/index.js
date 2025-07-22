import { arrayBufferToBase64 } from "../../utils";

const sharepointDownloadFile = async ({ fileURL }) => {
  const fileRes = await fetch(fileURL);
  if (!fileRes.ok) {
    throw new Error(`Failed to download ${item.name}`);
  }

  // Convert Web ReadableStream to Buffer
  const arrayBuffer = await fileRes.blob().buffer;
  const base64 = arrayBufferToBase64(arrayBuffer);

  return { result: base64 };
};

export default sharepointDownloadFile;
