const sharepointListFilesForDrive = async ({ driveID }) => {
  try {
    const listUrl = `https://graph.microsoft.com/v1.0/drives/${driveID}/root/children`;
    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Listing files failed: ${errText}`);
    }

    const { value } = await res.json();
    console.log({ items: value });
    return {
      result: value,
    };
  } catch (err) {
    const message = `Unable to list files for drive '${driveID}': ${err.message}`;
    throw new Error(message);
  }
};

export default sharepointListFilesForDrive;
