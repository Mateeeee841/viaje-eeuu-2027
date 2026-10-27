// Guarda en base/estado.json los cambios que la familia mandó por ntfy.sh (ntfy los guarda solo 12 horas).
// Lo corre la tarea .github/workflows/guardar.yml cada 10 minutos. Misma lógica que web/src/nube.js:
// cada mensaje es {p: "votos/mateo", d: {...}} (mezcla; null borra la clave) o {p, x: 1} (borra el documento).
import fs from "node:fs";

const ARCH = "base/estado.json";
const RUTA = /^(votos\/(mateo|paula|jose|agustina)|estado\/(ruta|temas|decisiones|divisiones|movidas|duraciones|hojas|extras)|pedidos\/[A-Za-z0-9_-]{1,60}|extra\/[A-Za-z0-9_-]{1,60})$/;
const esObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function mezclar(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v === null) delete dst[k];
    else if (esObj(v)) { if (!esObj(dst[k])) dst[k] = {}; mezclar(dst[k], v); }
    else dst[k] = v;
  }
  return dst;
}

const tema = (fs.readFileSync("index.html", "utf8").match(/window\.NUBE=\{"tema": ?"([A-Za-z0-9_-]+)"/) || [])[1];
if (!tema) throw new Error("No encontré el tema de ntfy en index.html");
const foto = JSON.parse(fs.readFileSync(ARCH, "utf8"));
const antes = JSON.stringify(foto.docs);

const r = await fetch(`https://ntfy.sh/${tema}/json?poll=1&since=all`);
if (!r.ok) throw new Error(`ntfy respondió ${r.status}`);
let n = 0;
for (const linea of (await r.text()).split("\n")) {
  if (!linea.trim()) continue;
  let msg, m;
  try { msg = JSON.parse(linea); m = JSON.parse(msg.message); } catch { continue; }
  if (msg.event !== "message" || !m || typeof m.p !== "string" || !RUTA.test(m.p)) continue;
  if (m.x) delete foto.docs[m.p];
  else if (esObj(m.d)) foto.docs[m.p] = mezclar(esObj(foto.docs[m.p]) ? foto.docs[m.p] : {}, m.d);
  else continue;
  n++;
  foto.ultimo = { id: msg.id, time: msg.time };
}

const cambio = JSON.stringify(foto.docs) !== antes;
if (cambio) {
  foto.guardado = new Date().toISOString().slice(0, 19) + "Z";
  delete foto.origen;
  fs.writeFileSync(ARCH, JSON.stringify(foto, null, 1) + "\n");
}
console.log(`${n} mensajes en ntfy · ${cambio ? "hay cambios para guardar" : "sin cambios"}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `cambio=${cambio}\n`);
