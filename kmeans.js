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
let kmeansWorker = null;
let running = false;

// -- util: carregar JSON via fetch (arquivo padrão no servidor)
async function loadDefault(path = "cidades-100.json") {
  setStatus("Carregando arquivo padrão...");
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    citiesData = Array.isArray(json) ? json : (json.data || json);
    setStatus(`Arquivo padrão carregado: ${citiesData.length} cidades`);
    return citiesData;
  } catch (err) {
    setStatus(`Erro ao carregar arquivo padrão: ${err.message || err}`);
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
    title.textContent = `Cluster ${i+1} — ${cluster.length} cidades`;
    div.appendChild(title);

    const ul = document.createElement("ul");
    cluster.forEach(c => {
      const li = document.createElement("li");
      li.textContent = `${c.name} — ${c.country} (pop: ${c.population ?? "?"})`;
      ul.appendChild(li);
    });

    div.appendChild(ul);
    clusterContainer.appendChild(div);
  });
}

// Start worker and run kmeans; returns promise resolved with clusters
function runKMeansInWorker(cities, k) {
  return new Promise((resolve, reject) => {
    if (running) return reject(new Error("Já está executando"));
    kmeansWorker = new Worker("kmeansWorker.js");

    kmeansWorker.onmessage = (ev) => {
      const msg = ev.data;
      if (msg.type === "progress") {
        setStatus(`Progresso: ${msg.value}`);
      } else if (msg.type === "done") {
        running = false;
        stopBtn.disabled = true;
        runBtn.disabled = false;
        setStatus(`K-means concluído. Clusters: ${msg.clusters.length}`);
        resolve(msg.clusters);
        kmeansWorker.terminate();
        kmeansWorker = null;
      } else if (msg.type === "error") {
        running = false;
        stopBtn.disabled = true;
        runBtn.disabled = false;
        setStatus(`Erro: ${msg.error}`);
        reject(new Error(msg.error));
        kmeansWorker.terminate();
        kmeansWorker = null;
      }
    };

    kmeansWorker.onerror = (e) => {
      running = false;
      stopBtn.disabled = true;
      runBtn.disabled = false;
      setStatus(`Worker error: ${e.message || e}`);
      reject(e);
      kmeansWorker.terminate();
      kmeansWorker = null;
    };

    // post message: cities array and k
    running = true;
    stopBtn.disabled = false;
    runBtn.disabled = true;
    setStatus("Enviando dados ao worker...");
    kmeansWorker.postMessage({ type: "start", cities, k });
  });
}

runBtn.addEventListener("click", async () => {
  const k = Math.max(1, parseInt(kInput.value || "0", 10));
  if (!citiesData || !Array.isArray(citiesData) || citiesData.length === 0) {
    setStatus("Nenhum arquivo carregado. Carregue um arquivo JSON primeiro.");
    return;
  }
  if (citiesData.length < k) {
    setStatus("O número de cidades é menor que K. Reduza K.");
    return;
  }

  try {
    setStatus("Inicializando K-means...");
    const clusters = await runKMeansInWorker(citiesData, k);
    renderClusters(clusters);
  } catch (err) {
    console.error(err);
    setStatus(`Erro: ${err.message || err}`);
  }
});

stopBtn.addEventListener("click", () => {
  if (kmeansWorker) {
    kmeansWorker.terminate();
    kmeansWorker = null;
    running = false;
    setStatus("Execução interrompida.");
    stopBtn.disabled = true;
    runBtn.disabled = false;
  }
});
