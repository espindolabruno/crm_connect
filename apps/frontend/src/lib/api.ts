// Client-side: uses relative /api path so Next.js rewrites proxy to the real API
// Server-side (SSR): calls the API directly using API_URL env var
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return '/api'; // browser: goes through Next.js rewrite proxy
  }
  // SSR: normalize URL and always append /api
  const base = (process.env.API_URL || 'http://localhost:4000')
    .replace(/\/api\/?$/, '')
    .replace(/\/$/, '');
  return `${base}/api`;
};

export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('crm_token') : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Ocorreu um erro.');
  }

  return data;
}