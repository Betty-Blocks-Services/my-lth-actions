const sharepointAccessToken = async ({ clientID, clientSecret }) => {
  try {
    if (!clientID) {
      throw new Error("Client ID is required to access Sharepoint");
    }
    if (!clientSecret) {
      throw new Error("Client Secret is required to access Sharepoint");
    }

    const tokenUrl = `https://login.microsoftonline.com/lthc.onmicrosoft.com/oauth2/v2.0/token`;

    const bodyEntries = [
      ["client_id", clientID],
      ["client_secret", clientSecret],
      ["scope", "https://graph.microsoft.com/.default"],
      ["grant_type", "client_credentials"],
    ];
    const body = bodyEntries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }

    const data = await res.json();

    return { result: data.access_token };
  } catch (err) {
    const message = `Unable to get sharepoint access token: ${err.message}`;
    throw new Error(message);
  }
};

export default sharepointAccessToken;
