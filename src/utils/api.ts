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
