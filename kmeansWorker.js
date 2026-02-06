// kmeansWorker.js
// Worker para etapa de atribuicao (assignment) do K-means em paralelo, com memoria compartilhada.
// Protocolo:
// - { type: "init", id, k, pointsBuffer, assignmentsBuffer, start, end }
// - { type: "step", id, iter, centroids }
// Respostas:
// - { type: "ready", id }
// - { type: "partial", id, iter, sums, counts, changed }
// - { type: "error", error }

let workerId = 0;
let kValue = 0;
let startIdx = 0;
let endIdx = 0;
let pointsView = null; // Float64Array
let assignmentsView = null; // Int32Array

function euclidean3(ax, ay, az, bx, by, bz) {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

onmessage = function (ev) {
  const msg = ev.data;
  if (!msg || !msg.type) return;

  if (msg.type === "init") {
    workerId = msg.id || 0;
    kValue = Math.max(1, Math.floor(msg.k || 1));
    startIdx = msg.start || 0;
    endIdx = msg.end || 0;
    pointsView = new Float64Array(msg.pointsBuffer);
    assignmentsView = new Int32Array(msg.assignmentsBuffer);
    postMessage({ type: "ready", id: workerId });
    return;
  }

  if (msg.type === "step") {
    try {
      const centroids = msg.centroids || [];
      const sums = Array.from({ length: kValue }, () => [0, 0, 0]);
      const counts = new Array(kValue).fill(0);
      let changed = false;

      for (let i = startIdx; i < endIdx; i++) {
        const base = i * 3;
        const x = pointsView[base];
        const y = pointsView[base + 1];
        const z = pointsView[base + 2];

        let best = -1;
        let bestDist = Infinity;
        for (let j = 0; j < centroids.length; j++) {
          const c = centroids[j];
          const d = euclidean3(x, y, z, c[0], c[1], c[2]);
          if (d < bestDist) {
            bestDist = d;
            best = j;
          }
        }

        const prev = assignmentsView[i];
        if (prev !== best) {
          assignmentsView[i] = best;
          changed = true;
        }

        sums[best][0] += x;
        sums[best][1] += y;
        sums[best][2] += z;
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
};
