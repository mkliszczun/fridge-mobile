const originalFetch = global.fetch;

function safeParseBody(body) {
  if (!body) return null;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body instanceof FormData) {
    const data = {};
    for (const [key, value] of body) {
      data[key] = value;
    }
    return data;
  }
  return body;
}

async function readRequestBody(input, init) {
  if (init?.body) return safeParseBody(init.body);
  if (input instanceof Request) {
    try {
      const clone = input.clone();
      const text = await clone.text();
      return safeParseBody(text);
    } catch {
      return null;
    }
  }
  return null;
}

async function readResponseBody(response) {
  try {
    const clone = response.clone();
    const text = await clone.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text.length > 500 ? `${text.slice(0, 500)}…` : text;
    }
  } catch {
    return null;
  }
}

global.fetch = async function patchedFetch(input, init = {}) {
  const method = init.method || (input instanceof Request ? input.method : "GET");
  const url = input instanceof Request ? input.url : input;

  let requestBody = null;
  try {
    requestBody = await readRequestBody(input, init);
  } catch {}

  console.log("[HTTP] →", method, url);
  if (requestBody !== null && requestBody !== undefined && requestBody !== "") {
    console.log("[HTTP]   request body:", requestBody);
  }

  try {
    const response = await originalFetch(input, init);
    const responseBody = await readResponseBody(response);
    const statusPrefix = response.ok ? "[HTTP] ←" : "[HTTP] ✖";
    console.log(statusPrefix, method, url, response.status, response.statusText || "");
    if (responseBody !== null && responseBody !== undefined && responseBody !== "") {
      console.log("[HTTP]   response body:", responseBody);
    } else if (!response.ok) {
      console.log("[HTTP]   response body: <empty>");
    }
    return response;
  } catch (error) {
    console.log("[HTTP] ←", method, url, "FAILED", error?.message ?? error);
    throw error;
  }
};
