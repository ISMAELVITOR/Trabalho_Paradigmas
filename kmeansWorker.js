// kmeansWorker.js

// Recebe: { type: 'start', cities: [...], k: number }
// Retorna via postMessage:
// - { type: 'progress', value: '...' }
// - { type: 'done', clusters: [ [...], [...], ... ] }
// - { type: 'error', error: '...' }

function postProgress(text) {
  postMessage({ type: "progress", value: text });
}

function logSafe(x) {
  if (x == null || isNaN(Number(x))) return 0;
  return Math.log(Number(x) + 1);
}

// normalize features to [0,1]
function normalizePoints(points) {
  const n = points.length;
  const lats = points.map(p => Number(p.latitude) || 0);
  const lons = points.map(p => Number(p.longitude) || 0);
  const pops = points.map(p => logSafe(p.population || 0));

  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const minPop = Math.min(...pops), maxPop = Math.max(...pops);

  const rangeLat = (maxLat - minLat) || 1;
  const rangeLon = (maxLon - minLon) || 1;
  const rangePop = (maxPop - minPop) || 1;

  // build normalized array of objects: { orig: cityObj, vec: [latNorm, lonNorm, popNorm] }
  const arr = points.map((p, i) => {
    const lat = (lats[i] - minLat) / rangeLat;
    const lon = (lons[i] - minLon) / rangeLon;
    const pop = (pops[i] - minPop) / rangePop;
    return { orig: p, vec: [lat, lon, pop] };
  });

  return { arr, meta: { minLat, maxLat, minLon, maxLon, minPop, maxPop } };
}

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

function randomIndices(n, k) {
  const idx = new Set();
  while (idx.size < Math.min(k, n)) {
    idx.add(Math.floor(Math.random() * n));
  }
  return Array.from(idx);
}

onmessage = function (ev) {
  const msg = ev.data;
  if (!msg || msg.type !== "start") return;

  const cities = msg.cities || [];
  const k = Math.max(1, Math.floor(msg.k || 1));
  const maxIter = msg.maxIter || 100;
  const tol = (typeof msg.tol === "number") ? msg.tol : 1e-4;

  if (!Array.isArray(cities) || cities.length === 0) {
    postMessage({ type: "error", error: "Nenhuma cidade fornecida." });
    return;
  }
  if (k > cities.length) {
    postMessage({ type: "error", error: "k maior que número de pontos." });
    return;
  }

  try {
    postProgress("Normalizando dados...");
    const { arr } = normalizePoints(cities);
    const n = arr.length;

    // create centroids using random initial points
    postProgress("Inicializando centroides...");
    const initIdx = randomIndices(n, k);
    let centroids = initIdx.map(i => arr[i].vec.slice());

    let assignments = new Array(n).fill(-1);
    let iter = 0;
    let changed = true;

    while (iter < maxIter && changed) {
      changed = false;
      iter++;

      // assignment step
      for (let i = 0; i < n; i++) {
        const v = arr[i].vec;
        let best = -1;
        let bestDist = Infinity;
        for (let j = 0; j < centroids.length; j++) {
          const d = euclidean(v, centroids[j]);
          if (d < bestDist) { bestDist = d; best = j; }
        }
        if (assignments[i] !== best) {
          assignments[i] = best;
          changed = true;
        }
      }

      // update step: compute means
      const sums = Array.from({ length: k }, () => [0,0,0]);
      const counts = new Array(k).fill(0);

      for (let i = 0; i < n; i++) {
        const a = assignments[i];
        const v = arr[i].vec;
        sums[a][0] += v[0];
        sums[a][1] += v[1];
        sums[a][2] += v[2];
        counts[a] += 1;
      }

      for (let j = 0; j < k; j++) {
        if (counts[j] === 0) {
          // reinitialize empty centroid randomly
          centroids[j] = arr[Math.floor(Math.random() * n)].vec.slice();
        } else {
          const mean = [sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]];
          centroids[j] = mean;
        }
      }

      if (iter % 5 === 0) {
        postProgress(`Iteração ${iter} — mudança = ${changed}`);
      }
    } // end while

    postProgress(`Concluído em ${iter} iterações. Construindo clusters...`);

    // build clusters as arrays of original city objects
    const clusters = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) {
      const a = assignments[i];
      clusters[a].push(arr[i].orig);
    }

    postMessage({ type: "done", clusters });
  } catch (err) {
    postMessage({ type: "error", error: err?.message || String(err) });
  }
};
