// main.js
import { createGeoDbClient } from "./api.js";

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
    li.textContent = "Nenhuma cidade nesta página.";
    list.appendChild(li);
    return;
  }

  const frag = document.createDocumentFragment();

  cities.forEach((city) => {
    const li = document.createElement("li");

    const txt = document.createElement("span");
    txt.textContent = `${city.name || city.city} — ${city.country || city.countryCode || ""}`;

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
    ? "Página 0 de 0"
    : `Página ${safePage + 1} de ${totalPages}`;

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
    li.textContent = `${city.name} — ${city.country}`;

    const rm = document.createElement("button");
    rm.textContent = "Remover";
    rm.addEventListener("click", () => onRemove(city.id));

    li.appendChild(rm);
    frag.appendChild(li);
  });

  list.appendChild(frag);
};

const store = createStore(initialState, (state) => {
  el.pageInfo.textContent = `Página ${state.page + 1}`;

  renderCities(state, (city) => {
    const slim = toSlimCity(city);
    store.setState((s) => withSelected(s, addUniqueById(s.selected, slim)));
  });

  renderSelected(state, (id) => {
    store.setState((s) => withSelected(s, removeById(s.selected, id)));
  });
});

/* ---------------- Paginação / carregamento de página ---------------- */

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

/* ---------------- Carga massiva (10k) ----------------
   Estratégia (respeitando plano gratuito):
   - porRequestLimit: 10 (máx útil no plano gratuito)
   - perRequestDelayMs: 1100 ms (≈ 1 req/s) — ajuste aqui se tiver limite diferente
   - pagesNeeded = ceil(target / perRequestLimit)
   - Faz fetch sequencial de cada offset, com delay entre requisições
   - Implementa retry/backoff em caso de 429 ou falha temporária
   - Acumula lista 'allCities' (slim) em memória
   - Ao final, salva arquivo JSON para uso posterior
*/

let bulkLoadController = { cancelled: false };

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchWithRetries(offset, perRequestLimit, maxAttempts = 6, baseDelay = 800) {
  let attempt = 0;
  while (attempt < maxAttempts && !bulkLoadController.cancelled) {
    try {
      const res = await api.findCities({ offset, limit: perRequestLimit, sort: "name" });
      return res?.data ?? [];
    } catch (err) {
      attempt++;
      // se for 429 ou status undefined (fetch network) aplicamos backoff e tentamos
      const is429 = err && (String(err).includes("429") || (err.status === 429));
      const wait = baseDelay * Math.pow(2, attempt - 1);
      if (!is429 && attempt >= maxAttempts) {
        // erro persistente não-429 -> lança após maxAttempts
        throw err;
      }
      // aguarda backoff
      await sleep(wait);
    }
  }
  // se cancelado
  return [];
}

async function startBulkLoad({ target = 10000, perRequestLimit = 10, perRequestDelayMs = 1100 } = {}) {
  // reset controller
  bulkLoadController.cancelled = false;

  // UI
  el.loadAllBtn.disabled = true;
  el.cancelLoadBtn.style.display = "inline-block";
  el.progress.textContent = `0 / ${target}`;

  const pagesNeeded = Math.ceil(target / perRequestLimit);
  const offsets = [];
  for (let i = 0; i < pagesNeeded; i++) offsets.push(i * perRequestLimit);

  const allCities = [];

  store.setState((s) => ({ ...s, loading: true }));

  for (let i = 0; i < offsets.length; i++) {
    if (bulkLoadController.cancelled) break;

    const offset = offsets[i];
    try {
      // tenta buscar com retries/backoff
      const data = await fetchWithRetries(offset, perRequestLimit);
      // transforma e junta em memória (slim)
      const slims = (data || []).map(toSlimCity);
      allCities.push(...slims);

      // atualiza progresso na UI (sem usar store para não re-renderizar listas)
      el.progress.textContent = `${Math.min(allCities.length, target)} / ${target} (pág ${i + 1}/${pagesNeeded})`;
    } catch (err) {
      console.error(`Erro irreversível na página offset ${offset}:`, err);
      // registra e segue: não interrompemos totalmente, apenas continuamos
    }

    // delay entre requisições para respeitar limite
    // se cancelado enquanto dorme, sai no próximo loop
    await sleep(perRequestDelayMs);
  }

  // fim da coleta
  store.setState((s) => ({ ...s, loading: false }));
  el.cancelLoadBtn.style.display = "none";
  el.loadAllBtn.disabled = false;

  if (bulkLoadController.cancelled) {
    el.progress.textContent = `Carga cancelada (${allCities.length} cidades coletadas).`;
    console.log("Carga cancelada pelo usuário. coletadas:", allCities.length);
    return allCities;
  }

  // garante tamanho exato máximo
  const finalCities = allCities.slice(0, target);

  // salva em arquivo JSON
  try {
    const blob = new Blob([JSON.stringify(finalCities, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cidades-${finalCities.length}.json`;
    a.click();
    URL.revokeObjectURL(url);

    el.progress.textContent = `Concluído: ${finalCities.length} cidades salvas.`;
    console.log("Carga completa. total:", finalCities.length);
  } catch (err) {
    console.error("Erro ao salvar arquivo:", err);
    el.progress.textContent = `Erro ao salvar arquivo: ${err?.message || err}`;
  }

  return finalCities;
}

function cancelBulkLoad() {
  bulkLoadController.cancelled = true;
  el.cancelLoadBtn.style.display = "none";
  el.loadAllBtn.disabled = false;
  el.progress.textContent = `Cancelando...`;
}

/* ---------- Handlers do UI para carga massiva ---------- */
el.loadAllBtn.addEventListener("click", () => {
  // parâmetros: target 10000, perRequestLimit 10, delay 1100ms
  startBulkLoad({ target: 10000, perRequestLimit: 10, perRequestDelayMs: 1300 });
});

el.cancelLoadBtn.addEventListener("click", () => {
  cancelBulkLoad();
});

/* ---------- inicial ---------- */
loadPage();
