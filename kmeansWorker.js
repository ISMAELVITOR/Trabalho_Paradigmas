// kmeansWorker.js
// Worker para etapa de atribuicao (assignment) do K-means em paralelo.
// Protocolo:
// - { type: "init", id, k, points: [ { vec: [x,y,z], index } ] }
// - { type: "step", id, iter, centroids: [ [x,y,z], ... ] }
// - { type: "collect", id }
// Respostas:
// - { type: "ready", id }
// - { type: "partial", id, iter, sums, counts, changed }
// - { type: "final", id, assignments, indices }
// - { type: "error", error }

let workerId = 0;
let points = [];
let assignments = [];
let kValue = 0;

function euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

onmessage = function (ev) {
  const msg = ev.data;
  if (!msg || !msg.type) return;

  if (msg.type === "init") {
    workerId = msg.id || 0;
    kValue = Math.max(1, Math.floor(msg.k || 1));
    points = Array.isArray(msg.points) ? msg.points : [];
    assignments = new Array(points.length).fill(-1);
    postMessage({ type: "ready", id: workerId });
    return;
  }

  if (msg.type === "step") {
    try {
      const centroids = msg.centroids || [];
      const sums = Array.from({ length: kValue }, () => [0, 0, 0]);
      const counts = new Array(kValue).fill(0);
      let changed = false;

      for (let i = 0; i < points.length; i++) {
        const v = points[i].vec;
        let best = -1;
        let bestDist = Infinity;
        for (let j = 0; j < centroids.length; j++) {
          const d = euclidean(v, centroids[j]);
          if (d < bestDist) {
            bestDist = d;
            best = j;
          }
        }
        if (assignments[i] !== best) {
          assignments[i] = best;
          changed = true;
        }
        sums[best][0] += v[0];
        sums[best][1] += v[1];
        sums[best][2] += v[2];
        counts[best] += 1;
      }

      postMessage({
        type: "partial",
        id: workerId,
        iter: msg.iter,
        sums,
        counts,
        changed
      });
    } catch (err) {
      postMessage({ type: "error", error: err?.message || String(err) });
    }
    return;
  }

  if (msg.type === "collect") {
    const indices = points.map((p) => p.index);
    postMessage({ type: "final", id: workerId, assignments, indices });
    return;
  }
};
