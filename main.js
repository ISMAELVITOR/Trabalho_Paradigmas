// main.js
import { createGeoDbClient } from "./api.js";
import { RAPID_API_KEY, RAPID_API_HOST, BASE_URL } from "./config.js";

const api = createGeoDbClient();

const el = {
  citiesList: document.getElementById("citiesList"),
  selectedList: document.getElementById("selectedList"),
  nextBtn: document.getElementById("nextBtn"),
  prevBtn: document.getElementById("prevBtn"),
  pageInfo: document.getElementById("pageInfo"),
  clearSelectedBtn: document.getElementById("clearSelectedBtn"),
  selectedPrevBtn: document.getElementById("selectedPrevBtn"),
  selectedNextBtn: document.getElementById("selectedNextBtn"),
  selectedPageInfo: document.getElementById("selectedPageInfo"),

  // novos controles para carga massiva
  loadAllBtn: document.getElementById("loadAllBtn"),
  cancelLoadBtn: document.getElementById("cancelLoadBtn"),
  progress: document.getElementById("progress")
};

const initialState = {
  page: 0,
  limit: 10,
  cities: [],
  selected: [],
  selectedPage: 0,
  selectedPageSize: 10,
  loading: false,
  error: null
};

const toSlimCity = (city) => ({
  id: city.id,
  name: city.name || city.city || "",
  country: city.country || city.countryCode || "",
  latitude: city.latitude,
  longitude: city.longitude,
  population: city.population
});

const addUniqueById = (list, city) =>
  list.some((item) => item.id === city.id) ? list : [...list, city];

const removeById = (list, id) =>
  list.filter((item) => item.id !== id);

const getTotalPages = (total, size) =>
  Math.ceil(total / size);

const getMaxPage = (total, size) =>
  Math.max(0, getTotalPages(total, size) - 1);

const clampPage = (page, total, size) =>
  Math.min(Math.max(0, page), getMaxPage(total, size));

const withSelected = (state, nextSelected) => ({
  ...state,
  selected: nextSelected,
  selectedPage: clampPage(
    state.selectedPage,
    nextSelected.length,
    state.selectedPageSize
  )
});

const createStore = (state, render) => {
  let current = state;
  const getState = () => current;
  const setState = (update) => {
    current = typeof update === "function" ? update(current) : update;
    render(current);
  };
  return { getState, setState };
};

const createAtom = (state) => {
  let current = state;
  const getState = () => current;
  const setState = (update) => {
    current = typeof update === "function" ? update(current) : update;
  };
  return { getState, setState };
};

const renderCities = (state, onAdd) => {
  const { cities, loading, error } = state;
  const list = el.citiesList;

  list.innerHTML = "";

  if (loading) {
    const li = document.createElement("li");
    li.textContent = "Carregando...";
    list.appendChild(li);
    return;
  }

  if (error) {
    const li = document.createElement("li");
    li.textContent = `Erro: ${error}`;
    list.appendChild(li);
    return;
  }

  if (!Array.isArray(cities) || cities.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nenhuma cidade nesta pagina.";
    list.appendChild(li);
    return;
  }

  const frag = document.createDocumentFragment();

  cities.forEach((city) => {
    const li = document.createElement("li");

    const txt = document.createElement("span");
    txt.textContent = `${city.name || city.city} ? ${city.country || city.countryCode || ""}`;

    const addBtn = document.createElement("button");
    addBtn.textContent = "Adicionar";
    addBtn.addEventListener("click", () => onAdd(city));

    li.appendChild(txt);

    if (city.population != null) {
      const pop = document.createElement("small");
      pop.className = "meta";
      pop.textContent = `pop: ${city.population}`;
      li.appendChild(pop);
    }

    li.appendChild(addBtn);
    frag.appendChild(li);
  });

  list.appendChild(frag);
};

const renderSelected = (state, onRemove) => {
  const { selected, selectedPage, selectedPageSize } = state;
  const list = el.selectedList;

  list.innerHTML = "";

  const totalPages = getTotalPages(selected.length, selectedPageSize);
  const safePage = totalPages === 0
    ? 0
    : Math.min(selectedPage, totalPages - 1);

  const pageLabel = totalPages === 0
    ? "Pagina 0 de 0"
    : `Pagina ${safePage + 1} de ${totalPages}`;

  el.selectedPageInfo.textContent = pageLabel;
  el.selectedPrevBtn.disabled = totalPages === 0 || safePage <= 0;
  el.selectedNextBtn.disabled = totalPages === 0 || safePage >= totalPages - 1;

  if (selected.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Nenhuma cidade selecionada.";
    list.appendChild(li);
    return;
  }

  const start = safePage * selectedPageSize;
  const visible = selected.slice(start, start + selectedPageSize);

  const frag = document.createDocumentFragment();

  visible.forEach((city) => {
    const li = document.createElement("li");
    li.textContent = `${city.name} ? ${city.country}`;

    const rm = document.createElement("button");
    rm.textContent = "Remover";
    rm.addEventListener("click", () => onRemove(city.id));

    li.appendChild(rm);
    frag.appendChild(li);
  });

  list.appendChild(frag);
};

const store = createStore(initialState, (state) => {
  el.pageInfo.textContent = `Pagina ${state.page + 1}`;

  renderCities(state, (city) => {
    const slim = toSlimCity(city);
    store.setState((s) => withSelected(s, addUniqueById(s.selected, slim)));
  });

  renderSelected(state, (id) => {
    store.setState((s) => withSelected(s, removeById(s.selected, id)));
  });
});

/* ---------------- Paginacao / carregamento de pagina ---------------- */

const loadPage = async () => {
  store.setState((s) => ({ ...s, loading: true, error: null }));

  const { page, limit } = store.getState();
  const offset = page * limit;

  try {
    const res = await api.findCities({ offset, limit, sort: "name" });
    const cities = res?.data ?? [];
    store.setState((s) => ({ ...s, cities, loading: false }));
  } catch (err) {
    const message = err?.message ?? String(err);
    store.setState((s) => ({
      ...s,
      cities: [],
      loading: false,
      error: message
    }));
  }
};

el.nextBtn.addEventListener("click", () => {
  store.setState((s) => ({ ...s, page: s.page + 1 }));
  loadPage();
});

el.prevBtn.addEventListener("click", () => {
  store.setState((s) => ({ ...s, page: Math.max(0, s.page - 1) }));
  loadPage();
});

el.selectedNextBtn.addEventListener("click", () => {
  store.setState((s) => ( {
    ...s,
    selectedPage: clampPage(
      s.selectedPage + 1,
      s.selected.length,
      s.selectedPageSize
    )
  }));
});

el.selectedPrevBtn.addEventListener("click", () => {
  store.setState((s) => ( {
    ...s,
    selectedPage: clampPage(
      s.selectedPage - 1,
      s.selected.length,
      s.selectedPageSize
    )
  }));
});

el.clearSelectedBtn.addEventListener("click", () => {
  store.setState((s) => ({ ...s, selected: [], selectedPage: 0 }));
});

/* ---------------- Carga massiva paralela (10k) ----------------
   Estrategia simples:
   - Divide offsets entre N workers (round-robin)
   - Cada worker faz fetch com delay (rate limit)
   - Main agrega resultados em memoria e salva JSON
*/

const bulkState = createAtom({ cancelled: false });
let bulkWorkers = [];

function resetBulkWorkers() {
  bulkWorkers.forEach((w) => w.terminate());
  bulkWorkers = [];
}

function createOffsets(target, perRequestLimit) {
  const pagesNeeded = Math.ceil(target / perRequestLimit);
  const offsets = [];
  for (let i = 0; i < pagesNeeded; i++) offsets.push(i * perRequestLimit);
  return offsets;
}

function splitOffsetsRoundRobin(offsets, workerCount) {
  const buckets = Array.from({ length: workerCount }, () => []);
  for (let i = 0; i < offsets.length; i++) {
    buckets[i % workerCount].push(offsets[i]);
  }
  return buckets;
}

async function startBulkLoadParallel({
  target = 10000,
  perRequestLimit = 10,
  perRequestDelayMs = 1200,
  workerCount = 3
} = {}) {
  bulkState.setState((s) => ({ ...s, cancelled: false }));
  resetBulkWorkers();

  el.loadAllBtn.disabled = true;
  el.cancelLoadBtn.style.display = "inline-block";
  el.progress.textContent = `0 / ${target}`;

  const offsets = createOffsets(target, perRequestLimit);
  const buckets = splitOffsetsRoundRobin(offsets, workerCount);

  // para respeitar limite global, aumentamos o delay por worker
  const perWorkerDelayMs = perRequestDelayMs * workerCount;

  let allCities = [];
  let doneWorkers = 0;

  store.setState((s) => ({ ...s, loading: true }));

  return new Promise((resolve, reject) => {
    bulkWorkers = buckets.map((bucket, i) => {
      const w = new Worker("fetchWorker.js");

      w.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg) return;

        if (msg.type === "page") {
          const slims = (msg.data || []).map(toSlimCity);
          allCities = allCities.concat(slims);
          const count = Math.min(allCities.length, target);
          el.progress.textContent = `${count} / ${target}`;
          return;
        }

        if (msg.type === "done") {
          doneWorkers++;
          if (doneWorkers === buckets.length) {
            finalizeBulkLoad(allCities, target).then(resolve).catch(reject);
          }
          return;
        }

        if (msg.type === "error") {
          console.error("Worker erro:", msg.error);
          doneWorkers++;
          if (doneWorkers === buckets.length) {
            finalizeBulkLoad(allCities, target).then(resolve).catch(reject);
          }
        }
      };

      w.onerror = (e) => {
        console.error("Worker error:", e);
        doneWorkers++;
        if (doneWorkers === buckets.length) {
          finalizeBulkLoad(allCities, target).then(resolve).catch(reject);
        }
      };

      w.postMessage({
        type: "start",
        id: i,
        baseUrl: BASE_URL,
        host: RAPID_API_HOST,
        apiKey: RAPID_API_KEY,
        perRequestLimit,
        perRequestDelayMs: perWorkerDelayMs,
        initialDelayMs: i * perRequestDelayMs,
        offsets: bucket
      });

      return w;
    });
  });
}

async function finalizeBulkLoad(allCities, target) {
  store.setState((s) => ({ ...s, loading: false }));
  el.cancelLoadBtn.style.display = "none";
  el.loadAllBtn.disabled = false;

  if (bulkState.getState().cancelled) {
    el.progress.textContent = `Carga cancelada (${allCities.length} cidades coletadas).`;
    return allCities;
  }

  const finalCities = allCities.slice(0, target);

  try {
    const blob = new Blob([JSON.stringify(finalCities, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cidades-${finalCities.length}.json`;
    a.click();
    URL.revokeObjectURL(url);

    el.progress.textContent = `Concluido: ${finalCities.length} cidades salvas.`;
  } catch (err) {
    console.error("Erro ao salvar arquivo:", err);
    el.progress.textContent = `Erro ao salvar arquivo: ${err?.message || err}`;
  }

  return finalCities;
}

function cancelBulkLoad() {
  bulkState.setState((s) => ({ ...s, cancelled: true }));
  resetBulkWorkers();
  el.cancelLoadBtn.style.display = "none";
  el.loadAllBtn.disabled = false;
  el.progress.textContent = `Cancelando...`;
}

/* ---------- Handlers do UI para carga massiva ---------- */
el.loadAllBtn.addEventListener("click", () => {
  // parametros simples para respeitar limite
  startBulkLoadParallel({ target: 10000, perRequestLimit: 10, perRequestDelayMs: 1200, workerCount: 3 });
});

el.cancelLoadBtn.addEventListener("click", () => {
  cancelBulkLoad();
});

/* ---------- inicial ---------- */
loadPage();

