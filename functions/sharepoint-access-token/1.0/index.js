const sharepointAccessToken = async ({ clientId, clientSecret }) => {
  try {
    if (!clientId) {
      throw new Error("Client ID is required to access Sharepoint");
    }
    if (!clientSecret) {
      throw new Error("Client Secret is required to access Sharepoint");
    }

    const tokenUrl = `https://login.microsoftonline.com/lthc.onmicrosoft.com/oauth2/v2.0/token`;

    // Use URLSearchParams for form-urlencoded body
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }

    const data = await res.json();
    console.log({ tokenResponse: data });
    return data.access_token;
  } catch (err) {
    const message = `Unable to get sharepoint access token: ${err.message}`;
    throw new Error(message);
  }
};

export default sharepointAccessToken;
