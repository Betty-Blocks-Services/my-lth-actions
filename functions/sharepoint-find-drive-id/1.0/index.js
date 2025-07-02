const sharepointFindDriveById = async ({ libraryURL }) => {
  try {
    if (!libraryURL) {
      throw new Error("Please provide a library URL");
    }
    const url = `https://graph.microsoft.com/v1.0/sites/fadf219f-ef19-4532-9155-bc73fc198e6d/drives`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Drives list failed: ${errText}`);
    }

    const { value } = await res.json();
    console.log({ drives: value });

    const drive = value.find((d) => d.webUrl === libraryURL);
    if (!drive) {
      throw new Error(
        `SharePoint Library under ${libraryURL} could not be found.`,
      );
    }
    return drive.id;
  } catch (err) {
    const message = `Unable to find drive by ID: ${err.message}`;
    throw new Error(message);
  }
};

export default sharepointFindDriveById;
