const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export async function fetchJson(path, options) {
  const response = await fetch(apiBase + path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

export function observationDate(observation) {
  return observation.date_utc
    ? observation.date_utc.replace('T', ' ').split('.')[0] + ' UTC'
    : 'Date unavailable';
}
