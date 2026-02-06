// kmeans.js
const fileInput = document.getElementById("fileInput");
const loadDefaultBtn = document.getElementById("loadDefaultBtn");
const runBtn = document.getElementById("runBtn");
const stopBtn = document.getElementById("stopBtn");
const kInput = document.getElementById("kInput");
const statusEl = document.getElementById("status");
const clusterContainer = document.getElementById("clusterContainer");
const clusterControls = document.getElementById("clusterControls");

let citiesData = null;
let running = false;
let workers = [];
let cancelRequested = false;
let sharedAssignments = null;

// -- util: carregar JSON via fetch (arquivo padrao no servidor)
async function loadDefault(path = "cidades-9960.json") {
  setStatus("Carregando arquivo padrao...");
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    citiesData = Array.isArray(json) ? json : (json.data || json);
    setStatus(`Arquivo padrao carregado: ${citiesData.length} cidades`);
    return citiesData;
  } catch (err) {
    setStatus(`Erro ao carregar arquivo padrao: ${err.message || err}`);
    throw err;
  }
}

// -- util: carregar JSON via input[type=file]
function loadFromFileInput(file) {
  return new Promise((resolve, reject) => {
    setStatus(`Lendo ${file.name}...`);
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const json = JSON.parse(fr.result);
        const arr = Array.isArray(json) ? json : (json.data || json);
        citiesData = arr;
        setStatus(`Arquivo ${file.name} carregado: ${arr.length} cidades`);
        resolve(arr);
      } catch (err) {
        setStatus("Erro ao parsear o arquivo JSON.");
        reject(err);
      }
    };
    fr.onerror = (e) => { setStatus("Erro ao ler o arquivo."); reject(e); };
    fr.readAsText(file);
  });
}

fileInput.addEventListener("change", (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  loadFromFileInput(f).catch(console.error);
});

loadDefaultBtn.addEventListener("click", () => {
  loadDefault().catch(console.error);
});

function setStatus(msg) {
  statusEl.textContent = msg;
}

function renderClusters(clusters) {
  clusterContainer.innerHTML = "";
  clusterControls.style.display = clusters.length ? "block" : "none";

  clusters.forEach((cluster, i) => {
    const div = document.createElement("div");
    div.className = "cluster";
    const title = document.createElement("h3");
    title.textContent = `Cluster ${i + 1} - ${cluster.length} cidades`;
    div.appendChild(title);

    const ul = document.createElement("ul");
    cluster.forEach(c => {
      const li = document.createElement("li");
      li.textContent = `${c.name} - ${c.country} (pop: ${c.population ?? "?"})`;
      ul.appendChild(li);
    });

    div.appendChild(ul);
    clusterContainer.appendChild(div);
  });
}

function logSafe(x) {
  if (x == null || isNaN(Number(x))) return 0;
  return Math.log(Number(x) + 1);
}

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

  const arr = points.map((p, i) => {
    const lat = (lats[i] - minLat) / rangeLat;
    const lon = (lons[i] - minLon) / rangeLon;
    const pop = (pops[i] - minPop) / rangePop;
    return { orig: p, vec: [lat, lon, pop] };
  });

  return { arr };
}

function randomIndices(n, k) {
  const idx = new Set();
  while (idx.size < Math.min(k, n)) {
    idx.add(Math.floor(Math.random() * n));
  }
  return Array.from(idx);
}

function terminateWorkers() {
  workers.forEach(w => w.terminate());
  workers = [];
}

function createWorkers(count) {
  terminateWorkers();
  workers = Array.from({ length: count }, () => new Worker("kmeansWorker.js"));
  return workers;
}

function waitForReady(w, id) {
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      const msg = ev.data;
      if (msg && msg.type === "error") {
        w.removeEventListener("message", onMessage);
        reject(new Error(msg.error || "Worker error"));
        return;
      }
      if (msg && msg.type === "ready" && msg.id === id) {
        w.removeEventListener("message", onMessage);
        resolve();
      }
    };
    const onError = (e) => {
      w.removeEventListener("error", onError);
      reject(e);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
  });
}

function stepWorker(w, id, iter, centroids) {
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      const msg = ev.data;
      if (msg && msg.type === "error") {
        w.removeEventListener("message", onMessage);
        reject(new Error(msg.error || "Worker error"));
        return;
      }
      if (msg && msg.type === "partial" && msg.id === id && msg.iter === iter) {
        w.removeEventListener("message", onMessage);
        resolve(msg);
      }
    };
    const onError = (e) => {
      w.removeEventListener("error", onError);
      reject(e);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.postMessage({ type: "step", id, iter, centroids });
  });
}

function buildSharedPoints(arr) {
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error("SharedArrayBuffer indisponivel. Rode em servidor com cross-origin isolation.");
  }
  const n = arr.length;
  const pointsBuffer = new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT * n * 3);
  const pointsView = new Float64Array(pointsBuffer);
  for (let i = 0; i < n; i++) {
    const base = i * 3;
    const v = arr[i].vec;
    pointsView[base] = v[0];
    pointsView[base + 1] = v[1];
    pointsView[base + 2] = v[2];
  }

  const assignmentsBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * n);
  const assignmentsView = new Int32Array(assignmentsBuffer);
  assignmentsView.fill(-1);

  return { pointsBuffer, assignmentsBuffer, assignmentsView };
}

async function runKMeansParallel(cities, k, opts = {}) {
  if (running) throw new Error("Ja esta executando");

  const maxIter = opts.maxIter || 100;
  const workerCount = Math.max(2, Math.min(opts.workers || (navigator.hardwareConcurrency || 4), 8));

  cancelRequested = false;
  running = true;

  try {
    setStatus("Normalizando dados...");
    const { arr } = normalizePoints(cities);
    const n = arr.length;

    const { pointsBuffer, assignmentsBuffer, assignmentsView } = buildSharedPoints(arr);
    sharedAssignments = assignmentsView;

    const chunkSize = Math.ceil(n / workerCount);
    const ranges = Array.from({ length: workerCount }, (_, i) => {
      const start = i * chunkSize;
      const end = Math.min(n, start + chunkSize);
      return { start, end };
    }).filter(r => r.start < r.end);

    const ws = createWorkers(ranges.length);

    const readyPromises = ws.map((w, i) => {
      w.postMessage({
        type: "init",
        id: i,
        k,
        pointsBuffer,
        assignmentsBuffer,
        start: ranges[i].start,
        end: ranges[i].end
      });
      return waitForReady(w, i);
    });

    await Promise.all(readyPromises);

    const initIdx = randomIndices(n, k);
    let centroids = initIdx.map(i => arr[i].vec.slice());

    let iter = 0;
    let changed = true;

    while (iter < maxIter && changed && !cancelRequested) {
      iter++;

      const partials = await Promise.all(ws.map((w, i) => stepWorker(w, i, iter, centroids)));

      const sums = Array.from({ length: k }, () => [0, 0, 0]);
      const counts = new Array(k).fill(0);
      changed = false;

      for (const part of partials) {
        changed = changed || part.changed;
        for (let c = 0; c < k; c++) {
          sums[c][0] += part.sums[c][0];
          sums[c][1] += part.sums[c][1];
          sums[c][2] += part.sums[c][2];
          counts[c] += part.counts[c];
        }
      }

      for (let c = 0; c < k; c++) {
        if (counts[c] === 0) {
          centroids[c] = arr[Math.floor(Math.random() * n)].vec.slice();
        } else {
          centroids[c] = [
            sums[c][0] / counts[c],
            sums[c][1] / counts[c],
            sums[c][2] / counts[c]
          ];
        }
      }

      if (iter % 5 === 0) {
        setStatus(`Iteracao ${iter} - mudou = ${changed}`);
      }
    }

    if (cancelRequested) {
      throw new Error("Execucao cancelada");
    }

    setStatus(`Concluido em ${iter} iteracoes. Montando clusters...`);

    const clusters = Array.from({ length: k }, () => []);
    for (let i = 0; i < n; i++) {
      const a = sharedAssignments[i];
      if (a >= 0) clusters[a].push(arr[i].orig);
    }

    return clusters;
  } finally {
    terminateWorkers();
    running = false;
  }
}

runBtn.addEventListener("click", async () => {
  const k = Math.max(1, parseInt(kInput.value || "0", 10));
  if (!citiesData || !Array.isArray(citiesData) || citiesData.length === 0) {
    setStatus("Nenhum arquivo carregado. Carregue um arquivo JSON primeiro.");
    return;
  }
  if (citiesData.length < k) {
    setStatus("O numero de cidades e menor que K. Reduza K.");
    return;
  }

  try {
    stopBtn.disabled = false;
    runBtn.disabled = true;
    setStatus("Inicializando K-means paralelo...");
    const clusters = await runKMeansParallel(citiesData, k);
    setStatus(`K-means concluido. Clusters: ${clusters.length}`);
    renderClusters(clusters);
  } catch (err) {
    console.error(err);
    setStatus(`Erro: ${err.message || err}`);
  } finally {
    stopBtn.disabled = true;
    runBtn.disabled = false;
  }
});

stopBtn.addEventListener("click", () => {
  if (running) {
    cancelRequested = true;
    terminateWorkers();
    running = false;
    setStatus("Execucao interrompida.");
    stopBtn.disabled = true;
    runBtn.disabled = false;
  }
});



