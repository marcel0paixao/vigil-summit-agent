const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000/api";

const ACCESS_TOKEN_KEY = "flowpilot.accessToken";
const SESSION_EXPIRED_KEY = "flowpilot.sessionExpired";
export const SESSION_EXPIRED_EVENT = "flowpilot:session-expired";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getAccessToken() {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function clearSessionExpiredNotification() {
  window.sessionStorage.removeItem(SESSION_EXPIRED_KEY);
}

export function consumeSessionExpiredNotification() {
  const hasExpiredSession = window.sessionStorage.getItem(SESSION_EXPIRED_KEY) === "true";
  clearSessionExpiredNotification();

  return hasExpiredSession;
}

export function notifySessionExpired() {
  window.sessionStorage.setItem(SESSION_EXPIRED_KEY, "true");
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export async function apiRequest<TResponse>(
  path: string,
  options: Omit<RequestInit, "body"> & { body?: BodyInit | object | null } = {}
): Promise<TResponse> {
  const headers = new Headers(options.headers);
  const token = getAccessToken();
  let body = options.body;

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (body && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body
  });

  if (!response.ok) {
    const details = await readJsonSafely(response);

    if (response.status === 401 && token) {
      notifySessionExpired();
    }

    throw new ApiError(getErrorMessage(details, response.statusText), response.status, details);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

function getErrorMessage(details: unknown, fallback: string) {
  if (typeof details !== "object" || details === null) {
    return fallback;
  }

  const message = "message" in details ? details.message : undefined;

  if (Array.isArray(message)) {
    return message.join(", ");
  }

  if (typeof message === "string") {
    return message;
  }

  return fallback;
}

async function readJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
