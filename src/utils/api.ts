/**
 * Utility to construct fully-qualified or subpath-aware API URLs
 * based on the Vite compilation base path.
 */
export function getApiUrl(path: string): string {
  // If the path is already an absolute external URL (e.g. http:// or https://), return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Remove leading slash if any
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // import.meta.env.BASE_URL is set by Vite (defaults to "/" or the configured BASE_PATH)
  // It always guarantees a trailing slash (e.g., "/my_app/")
  const baseUrl = (import.meta as any).env?.BASE_URL || '/';
  
  return `${baseUrl}${cleanPath}`.replace(/\/+/g, '/');
}

/**
 * Centralized fetch wrapper for API requests.
 * Automatically handles URL resolution, Authorization bearer token insertion,
 * and session expiration / 401 Unauthorized interception to trigger re-authentication.
 */
export async function apiFetch(input: string | Request | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? getApiUrl(input) : input;
  const token = localStorage.getItem('token');

  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  // Intercept 401 Unauthorized or expired sessions
  if (response.status === 401) {
    const urlStr = typeof input === 'string' ? input : input.toString();
    if (!urlStr.includes('/api/login')) {
      console.warn('[apiFetch] 401 Unauthorized encountered. Dispatching auth:unauthorized event.');
      window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: { status: response.status } }));
    }
  }

  return response;
}

