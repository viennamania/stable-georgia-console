const DEFAULT_REMOTE_BACKEND_BASE_URL = "https://www.stable.makeup";
const DEFAULT_REMOTE_BACKEND_FETCH_TIMEOUT_MS = 15000;

export const getRemoteBackendBaseUrl = () => {
  const value = process.env.REMOTE_BACKEND_BASE_URL || DEFAULT_REMOTE_BACKEND_BASE_URL;
  return value.replace(/\/+$/, "");
};

const getRemoteBackendFetchTimeoutMs = () => {
  const raw = Number.parseInt(process.env.REMOTE_BACKEND_FETCH_TIMEOUT_MS || "", 10);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_REMOTE_BACKEND_FETCH_TIMEOUT_MS;
};

const fetchRemote = async (input: string, init?: RequestInit) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getRemoteBackendFetchTimeoutMs());

  return fetch(input, {
    cache: "no-store",
    ...init,
    signal: init?.signal || controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });
};

export const postRemoteJson = async (
  path: string,
  body: Record<string, unknown>,
  init?: RequestInit,
) => {
  const response = await fetchRemote(`${getRemoteBackendBaseUrl()}${path}`, {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body || {}),
  });

  const json = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    json,
  };
};

export const getRemoteJson = async (
  path: string,
  query?: URLSearchParams | Record<string, string>,
  init?: RequestInit,
) => {
  const url = new URL(`${getRemoteBackendBaseUrl()}${path}`);
  if (query instanceof URLSearchParams) {
    query.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
  } else if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
  }

  const response = await fetchRemote(url.toString(), {
    ...init,
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });

  const json = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    json,
  };
};
