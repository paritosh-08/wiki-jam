/**
 * Make an authenticated API request
 * @param {string} url - API endpoint URL
 * @param {object} options - Fetch options
 * @param {string} token - Firebase auth token
 */
export async function authenticatedFetch(url, options = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  // Add authorization header if token is provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

