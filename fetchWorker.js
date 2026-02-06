// fetchWorker.js
// Worker para buscar subconjuntos de paginas da API GeoDB em paralelo.
// Recebe: { type: 'start', id, baseUrl, host, apiKey, perRequestLimit, perRequestDelayMs, initialDelayMs, offsets }
// Envia: { type: 'page', id, data, offset }
// Envia: { type: 'done', id, total }
// Envia: { type: 'error', id, error }

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchPage(baseUrl, host, apiKey, offset, limit) {
  const url = `${baseUrl}/geo/cities?offset=${offset}&limit=${limit}&sort=name`;
  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": host
    }
  });
  if (!res.ok) {
    const msg = `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  return json?.data ?? [];
}

async function fetchWithRetries(baseUrl, host, apiKey, offset, limit, baseDelay, maxAttempts) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fetchPage(baseUrl, host, apiKey, offset, limit);
    } catch (err) {
      attempt++;
      const status = err?.status;
      const is429 = status === 429 || String(err?.message || "").includes("429");
      if (!is429 && attempt >= maxAttempts) throw err;

      const backoff = Math.min(baseDelay * Math.pow(2, attempt - 1), 10000);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(backoff + jitter);
    }
  }
  return [];
}

onmessage = async (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== "start") return;

  const id = msg.id || 0;
  const baseUrl = msg.baseUrl;
  const host = msg.host;
  const apiKey = msg.apiKey;
  const perRequestLimit = msg.perRequestLimit || 10;
  const perRequestDelayMs = msg.perRequestDelayMs || 1200;
  const initialDelayMs = msg.initialDelayMs || 0;
  const offsets = Array.isArray(msg.offsets) ? msg.offsets : [];

  try {
    let total = 0;
    if (initialDelayMs > 0) await sleep(initialDelayMs);
    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[i];
      const data = await fetchWithRetries(
        baseUrl,
        host,
        apiKey,
        offset,
        perRequestLimit,
        perRequestDelayMs,
        5
      );
      postMessage({ type: "page", id, data, offset });
      total += data.length;
      await sleep(perRequestDelayMs);
    }
    postMessage({ type: "done", id, total });
  } catch (err) {
    postMessage({ type: "error", id, error: err?.message || String(err) });
  }
};
