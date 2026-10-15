"use strict";
/* cuartito · un cuarto lofi que vive con tu clima, tu hora y tu música.
   Todo se dibuja en un lienzo chiquito (unos 180 px de alto) y el navegador lo agranda pixelado.
   La escena mide 320 × 180, con el piso en y = 150; lo que sobra de pantalla es más pared y más piso. */

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);

/* ---------- Configuración (la cambian Wallpaper Engine, Lively o la vista previa) ---------- */

const cfg = {
  ciudad: "Buenos Aires", clima: "auto", hora: "real",
  gato: "naranja", nombreGato: "Michi", buzo: "#e07a5f",
  led: "portada", colorLed: "#ff6ad5", info: true, h24: true, fahrenheit: false,
  sensibilidad: 10, fps: 30,
};
for (const k of ["ciudad", "clima", "hora", "gato"]) if (params.get(k)) cfg[k] = params.get(k);

/* ---------- Utilidades ---------- */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mezclar = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const elegir = arr => arr[Math.floor(Math.random() * arr.length)];
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const rgbHex = c => "#" + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
const mezclarColor = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x.map((v, i) => mezclar(v, y[i], clamp(t, 0, 1)))); };
const rgba = (h, a) => { const [r, v, b] = hexRgb(h); return `rgba(${r},${v},${b},${clamp(a, 0, 1)})`; };
// Pseudoaleatorio con semilla: las estrellas y los edificios quedan siempre en el mismo lugar
function azar(s) {
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

/* ---------- Lienzo y primitivas de dibujo ---------- */

const lienzo = $("#cuarto"), ctx = lienzo.getContext("2d");
const afuera = document.createElement("canvas"), actx = afuera.getContext("2d");   // lo que se ve por la ventana
const luz = document.createElement("canvas"), lctx = luz.getContext("2d");         // la oscuridad de la noche
let W = 320, H = 180, ox = 0, oy = 0, escala = 1, dpr = 1, fondo = null;
let lp = ctx;   // el "lápiz": contexto donde dibujan las primitivas

function ajustar() {
  dpr = devicePixelRatio || 1;
  const pw = innerWidth * dpr, ph = innerHeight * dpr;
  escala = Math.max(1, Math.round(Math.min(ph / 180, pw / 320)));
  W = Math.ceil(pw / escala); H = Math.ceil(ph / escala);
  for (const c of [lienzo, afuera, luz]) { c.width = W; c.height = H; }
  lienzo.style.width = W * escala / dpr + "px"; lienzo.style.height = H * escala / dpr + "px";
  ox = Math.floor((W - 320) / 2); oy = Math.floor((H - 180) * .75);   // si sobra alto, más pared que piso
  fondo = null;
}

const rect = (x, y, w, h, col) => { lp.fillStyle = col; lp.fillRect(Math.round(x), Math.round(y), w, h); };
function circulo(cx, cy, r, col) {
  lp.fillStyle = col;
  for (let y = -r; y <= r; y++) { const a = Math.floor(Math.sqrt(r * r - y * y) + .3); lp.fillRect(Math.round(cx) - a, Math.round(cy) + y, a * 2 + 1, 1); }
}
function linea(x0, y0, x1, y1, grosor, col) {
  lp.fillStyle = col;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, o = Math.floor(grosor / 2);
  let err = dx + dy;
  for (;;) {
    lp.fillRect(x0 - o, y0 - o, grosor, grosor);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/* Sprites: cada letra de la grilla es un color de la paleta; "." es transparente */
const sprites = new Map();
function sprite(clave, filas, paleta) {
  if (sprites.has(clave)) return sprites.get(clave);
  const cv = document.createElement("canvas");
  cv.width = filas[0].length; cv.height = filas.length;
  const sc = cv.getContext("2d");
  filas.forEach((fila, y) => [...fila].forEach((ch, x) => { if (paleta[ch]) { sc.fillStyle = paleta[ch]; sc.fillRect(x, y, 1, 1); } }));
  sprites.set(clave, cv);
  return cv;
}
const pegar = (cv, x, y) => lp.drawImage(cv, Math.round(x), Math.round(y));

/* Letra pixelada de 3 × 5 */
const FUENTE = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001011001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111",
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111",
  F: "111100110100100", G: "011100101101011", H: "101101111101101", I: "111010010010111", J: "001001001101010",
  K: "101101110101101", L: "100100100100111", M: "101111111101101", N: "110101101101101", O: "010101101101010",
  P: "110101110100100", Q: "010101101110011", R: "110101110101101", S: "011100010001110", T: "111010010010010",
  U: "101101101101111", V: "101101101101010", W: "101101111111101", X: "101101010101101", Y: "101101010010010",
  Z: "111001010100111", ":": "000010000010000", ".": "000000000000010", ",": "000000000010100", "-": "000000111000000",
  "°": "010101010000000", "'": "010010000000000", "!": "010010010000010", "?": "111001010000010", "/": "001001010100100",
  "(": "001010010010001", ")": "100010010010100", "&": "010101010101011", "+": "000010111010000", "#": "101111101111101",
  "%": "101001010100101", "♪": "011010010110110", "♥": "101111111010000", "·": "000000010000000", "|": "010010010010010",
  '"': "101101000000000", "_": "000000000000111", "*": "101010101000000", " ": "000000000000000",
};
const normalizar = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const anchoTexto = (s, tam = 1) => Math.max(0, normalizar(s).length * 4 * tam - tam);
function texto(s, x, y, col, tam = 1, sombra = null) {
  s = normalizar(s);
  if (sombra) texto(s, x + tam, y + tam, sombra, tam);
  lp.fillStyle = col;
  let cx = Math.round(x);
  for (const ch of s) {
    const gl = FUENTE[ch] ?? FUENTE["?"];
    for (let i = 0; i < 15; i++) if (gl[i] === "1") lp.fillRect(cx + (i % 3) * tam, Math.round(y) + Math.floor(i / 3) * tam, tam, tam);
    cx += 4 * tam;
  }
}

/* ---------- Dibujos ---------- */

const CABEZA = [
  "....HHHHHH....",
  "..HHHHHHHHHH..",
  ".HHHHHhhHHHHH.",
  ".HHHHhHHHHHHHH",
  "HHHHHHHHHHHHHH",
  "HHHHHHHHHHSHHH",
  "HHHHHHHHSSSSSH",
  "HHHHHHHHSSSSES",
  "HHHHHHHSSSSSSS",
  "HHHHHHSSSSSSSS",
  "HHHHHHsSSSSSS.",
  "HHHHHHSSSSSm..",
  ".HHHHHsSSSS...",
  ".HHHH..sSS....",
  "..HH...sS.....",
];
const AURICULARES = [
  "......PP......",
  "......PP......",
  "......PP......",
  "......PP......",
  "......PP......",
  "......PP......",
  ".....PPPP.....",
  "....PPPPPP....",
  "....PP..PP....",
  "....PP..PP....",
  "....PPPPPP....",
  ".....PPPP.....",
];
const TORSO = [
  "..bbbb............",
  ".bbBBbb...........",
  "bbBBBBbb..........",
  "bBBBBBBBbBBBB.....",
  "bBBBBBBBBBBBBBB...",
  "bBBBBBBBBBBBBkBB..",
  "bbBBBBBBBBBBBkBB..",
  ".bBBBBBBBBBBBkBB..",
  ".bBBBBBBBBBBBBkBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bBBBBBBBBbbbbbBB.",
  ".bBBBBBBBBbBBBBbB.",
  ".bBBBBBBBBbBBBBbB.",
  ".bBBBBBBBBBBBBBBB.",
  ".bbbbbbbbbbbbbbbb.",
  ".JJJJJJJJJJJJJJJ..",
  ".JJJJJJJJJJJJJJJ..",
  "..JJJJJJJJJJJJJ...",
];
const GATO_CABEZA = [
  "......O...O..",
  "......OO.OO..",
  "......OOSOO..",
  ".....OOOOOOO.",
  ".....OEOOOEO.",
  ".....OOOnOOO.",
  "......OWWWO..",
];
const GATO_CUERPO = [
  ".....OOWWWO..",
  "...OOOOWWWO..",
  "..OOSOOOWWO..",
  "..OSOOOOOWO..",
  "..OOOSOOOOO..",
  "..OOOOOOOOO..",
  "...WW...WW...",
];
const GATO_DUERME = [
  ".....OOOOO.....",
  "...OOSOOOSOO...",
  "..OOOOOOOOOOO.O",
  ".OOOOOOOOOOOOOO",
  ".OOSOOOOOOOcOOO",
  ".SOOOOOOOOOOOO.",
  "..SSSSOOOOOOO..",
];
const MATE = ["...k.", "...k.", "..k..", ".GGG.", "MmMMM", "MmMMM", ".MMM."];
const CORAZON = ["XX.XX", "XXXXX", ".XXX.", "..X.."];
const ICONOS = {
  prev: ["X...X", "X..XX", "X.XXX", "X..XX", "X...X"],
  play: ["X....", "XX...", "XXX..", "XX...", "X...."],
  pausa: ["XX.XX", "XX.XX", "XX.XX", "XX.XX", "XX.XX"],
  next: ["X...X", "XX..X", "XXX.X", "XX..X", "X...X"],
};
const GATOS = {
  naranja: { O: "#e8913a", S: "#b9622a", W: "#f7e3c4", E: "#3f8f3a", n: "#e07a8a", c: "#8a4a20" },
  negro: { O: "#2a2630", S: "#1b1820", W: "#3d3846", E: "#e8c547", n: "#5a4250", c: "#120f16" },
  gris: { O: "#8d8f9c", S: "#696b78", W: "#dcdce4", E: "#7fbf4a", n: "#d98a9a", c: "#4a4c58" },
  blanco: { O: "#eeeae4", S: "#d3ccc1", W: "#ffffff", E: "#5aa7e0", n: "#f0a0b0", c: "#a8a196" },
  siames: { O: "#e9dcc5", S: "#6b4a3a", W: "#f5ecdc", E: "#4aa3e8", n: "#7a5040", c: "#6b4a3a" },
};
const ORDEN_GATOS = Object.keys(GATOS);

function paletaPersonaje() {
  const B = /^#[0-9a-f]{6}$/i.test(cfg.buzo) ? cfg.buzo : "#e07a5f";
  return {
    H: "#3b2836", h: "#57384e", S: "#f2c6a0", s: "#d9a07a", E: "#1d1622", m: "#b8686a",
    B, b: mezclarColor(B, "#2a1a30", .32), k: "#f3ead8", J: "#3c4766", P: "#26232f",
  };
}

/* ---------- Clima (Open-Meteo, gratis y sin clave) ---------- */

const clima = { ok: false, codigo: 0, nubes: .15, temp: null, sale: 7, pone: 19.5, lugar: "" };
const horaDe = s => { const [h, m] = s.slice(11, 16).split(":").map(Number); return h + m / 60; };

async function traerClima() {
  const pedido = cfg.ciudad.trim();
  if (!pedido) return;
  try {
    // "Córdoba, Argentina": se busca la ciudad y se filtra por lo que va después de la coma
    const [nombre, ...resto] = pedido.split(",").map(s => s.trim());
    const filtro = normalizar(resto.join(" "));
    const geo = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nombre)}&count=10&language=es&format=json`)).json();
    const lugares = geo.results || [];
    const lugar = lugares.find(l => !filtro || normalizar(`${l.country} ${l.admin1} ${l.country_code}`).includes(filtro)) || lugares[0];
    if (!lugar) return;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lugar.latitude}&longitude=${lugar.longitude}` +
      "&current=temperature_2m,weather_code,cloud_cover&daily=sunrise,sunset&timezone=auto&forecast_days=1";
    const r = await (await fetch(url)).json();
    Object.assign(clima, {
      ok: true, codigo: r.current.weather_code, temp: r.current.temperature_2m, nubes: r.current.cloud_cover / 100,
      sale: horaDe(r.daily.sunrise[0]), pone: horaDe(r.daily.sunset[0]), lugar: lugar.name,
    });
  } catch { /* sin internet: queda el último clima conocido */ }
}

function tipoClima() {
  if (cfg.clima !== "auto") return cfg.clima;
  const c = clima.codigo;
  if (c >= 95) return "tormenta";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "nieve";
  if (c >= 51) return "lluvia";
  if (c === 45 || c === 48) return "niebla";
  if (c >= 2 || clima.nubes > .6) return "nublado";
  return "despejado";
}
function nubosidad(tipo) {
  if (cfg.clima === "auto" && clima.ok) return Math.max(clima.nubes, { lluvia: .8, tormenta: .95, nieve: .7, niebla: .5 }[tipo] || 0);
  return { despejado: .15, nublado: .7, lluvia: .85, tormenta: 1, nieve: .75, niebla: .5 }[tipo];
}

/* ---------- Hora del día ---------- */

function horaReal() { const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
function horaEscena() {
  return { amanecer: clima.sale + .3, dia: 13, atardecer: clima.pone - .12, noche: 23.5 }[cfg.hora] ?? horaReal();
}
// Altura del sol: 1 al mediodía, 0 en el horizonte, negativa de noche
function alturaSol(h) {
  const { sale, pone } = clima;
  if (h >= sale && h <= pone) return Math.sin(Math.PI * (h - sale) / (pone - sale));
  const noche = 24 - (pone - sale), pasado = h > pone ? h - pone : h + 24 - pone;
  return -Math.sin(Math.PI * pasado / noche);
}
function faseLunar() {
  const dias = (Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5;
  return ((dias % 29.530588) + 29.530588) % 29.530588 / 29.530588;
}

/* ---------- Música ---------- */

let fuente = null;   // "we" | "lively" | "demo"
let pausado = false;
const pista = { titulo: "", artista: "", portada: null, hayTapa: false, color: null, estado: "stopped", pos: 0, dur: 0, marca: 0 };
const tapa = document.createElement("canvas");
tapa.width = tapa.height = 14;
const tctx = tapa.getContext("2d");

function ponerPortada(src) {
  if (src === pista.portada) return;
  pista.portada = src; pista.hayTapa = false; pista.color = null;
  if (!src) return;
  const img = new Image();
  img.onload = () => {
    if (pista.portada !== src) return;
    tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = "high";
    tctx.clearRect(0, 0, 14, 14);
    tctx.drawImage(img, 0, 0, 14, 14);
    pista.hayTapa = true; pista.color = colorDePortada();
  };
  img.src = src;
}
// El color más vivo de la portada, para las luces del cuarto
function colorDePortada() {
  try {
    const d = tctx.getImageData(0, 0, 14, 14).data, px = [];
    for (let i = 0; i < d.length; i += 4) {
      const c = [d[i], d[i + 1], d[i + 2]], mx = Math.max(...c), mn = Math.min(...c);
      px.push({ c, s: (mx - mn) * mx });
    }
    px.sort((a, b) => b.s - a.s);
    const top = px.slice(0, 24), prom = [0, 1, 2].map(k => top.reduce((s, p) => s + p.c[k], 0) / top.length);
    const f = 230 / (Math.max(...prom) || 1);
    return rgbHex(prom.map(v => v * f));
  } catch { return null; }
}
const posicionActual = () => pista.estado === "playing" ? pista.pos + (performance.now() - pista.marca) / 1000 : pista.pos;
const sonando = () => pista.estado === "playing";

/* Audio: 64 bandas por canal. Con los graves se detecta el golpe para cabecear */
const BANDAS = 64;
const audio = new Float32Array(BANDAS);
let ultimoAudio = -1e9, gravesProm = 0, graves = 0, ultimoGolpe = 0, cabeceo = 0, golpes = 0;
function recibirAudio(arr) {
  const k = cfg.sensibilidad / 10;
  for (let i = 0; i < BANDAS; i++) audio[i] = Math.max(((arr[i] || 0) + (arr[i + BANDAS] || 0)) / 2 * k, audio[i] * .8);
  ultimoAudio = performance.now();
}
function golpe(t) { ultimoGolpe = t; cabeceo = 1; golpes++; }
function ritmo(t, dt) {
  let g = 0;
  for (let i = 0; i < 5; i++) g += audio[i];
  graves = g / 5;
  gravesProm = mezclar(gravesProm, graves, .04);
  if (sonando() && t - ultimoAudio > 2500) {
    if (t - ultimoGolpe > 60000 / 84) golpe(t);   // sin audio (por ejemplo en Lively sin permiso): ritmo inventado
  } else if (graves > gravesProm * 1.25 + .02 && t - ultimoGolpe > 320) golpe(t);
  cabeceo = Math.max(0, cabeceo - dt / 260);
  if (t - ultimoAudio > 300) for (let i = 0; i < BANDAS; i++) audio[i] *= .9;
}
const GRUPOS = [0, 1, 2, 3, 5, 8, 12, 18, 26, 38, 64];
function banda(i) {
  let s = 0;
  for (let k = GRUPOS[i]; k < GRUPOS[i + 1]; k++) s += audio[k];
  return s / (GRUPOS[i + 1] - GRUPOS[i]) * (1 + i * .12);
}

let arcoiris = 0;
function colorLuces() {
  if (cfg.led === "fijo") return cfg.colorLed;
  if (cfg.led === "portada" && pista.color && sonando()) return pista.color;
  const h = arcoiris % 360, f = n => { const k = (n + h / 30) % 12; return 255 * (.75 - .45 * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return rgbHex([f(0), f(8), f(4)]);
}

/* ---------- Ayudante opcional (controles/cuartito-ayudante.ps1) ----------
   Los wallpapers web no pueden controlar la música ni leer la CPU. El script escucha en localhost:
   con él aparecen los botones de música y el gato se eriza cuando la PC está exigida. */

const AYUDANTE = "http://localhost:8978";
const sistema = { conectado: false, cpu: 0, ram: 0 };
async function consultarAyudante() {
  if (fuente === "demo") return;
  try {
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 900);
    const e = await (await fetch(`${AYUDANTE}/estado`, { signal: ctl.signal, cache: "no-store" })).json();
    Object.assign(sistema, { conectado: e.app === "cuartito", cpu: e.cpu ?? 0, ram: e.ram ?? 0 });
  } catch { sistema.conectado = false; sistema.cpu = 0; }
}
async function accionMusica(accion) {
  if (fuente === "demo") {   // en la vista previa los botones manejan la canción de ejemplo
    if (accion === "playpause") {
      pista.pos = posicionActual(); pista.marca = performance.now();
      pista.estado = sonando() ? "paused" : "playing";
    } else { pista.pos = 0; pista.marca = performance.now(); }
    $("#demo-musica")?.setAttribute("aria-pressed", sonando());
    return;
  }
  try { await fetch(`${AYUDANTE}/${accion}`, { method: "POST", headers: { "X-Cuartito": "1" }, body: "" }); }
  catch { sistema.conectado = false; }
}

/* ---------- Escena: exterior ---------- */

const VENTANA = { x: 40, y: 28, w: 82, h: 74 };
const CIELOS = [   // [altura del sol, color de arriba, color del horizonte]
  [-1, "#070a1f", "#151a3e"],
  [-.22, "#0c1236", "#2b2a5f"],
  [-.06, "#2c2a6a", "#c65f78"],
  [.05, "#6a62ad", "#ff9a5c"],
  [.22, "#5b9be0", "#a9d4f2"],
  [1, "#4790e4", "#bde4f8"],
];
function coloresCielo(sol, tipo) {
  let i = 0;
  while (i < CIELOS.length - 2 && sol > CIELOS[i + 1][0]) i++;
  const [a0, s0, h0] = CIELOS[i], [a1, s1, h1] = CIELOS[i + 1], t = clamp((sol - a0) / (a1 - a0), 0, 1);
  let arriba = mezclarColor(s0, s1, t), abajo = mezclarColor(h0, h1, t);
  const gris = { despejado: 0, nublado: .5, lluvia: .75, tormenta: .88, nieve: .55, niebla: .7 }[tipo];
  const dia = clamp(sol * 3 + .5, 0, 1);
  arriba = mezclarColor(arriba, mezclarColor("#191c2a", "#7c8594", dia), gris);
  abajo = mezclarColor(abajo, mezclarColor("#262a3b", "#a7aeb9", dia), gris);
  return [arriba, abajo];
}

const r1 = azar(7);
const ESTRELLAS = Array.from({ length: 46 }, () => ({ x: VENTANA.x + Math.floor(r1() * VENTANA.w), y: VENTANA.y + Math.floor(r1() * 48), f: r1() * 6, v: .5 + r1() * 2 }));
const EDIFICIOS = (() => {
  const r = azar(21), lejos = [], cerca = [];
  for (let x = VENTANA.x - 2; x < VENTANA.x + VENTANA.w; x += 5 + Math.floor(r() * 7)) lejos.push({ x, w: 6 + Math.floor(r() * 7), h: 16 + Math.floor(r() * 16) });
  for (let x = VENTANA.x - 4; x < VENTANA.x + VENTANA.w; x += 9 + Math.floor(r() * 8)) {
    const b = { x, w: 8 + Math.floor(r() * 8), h: 8 + Math.floor(r() * 14), luces: [] };
    for (let wy = 3; wy < b.h - 2; wy += 3) for (let wx = 2; wx < b.w - 1; wx += 3) b.luces.push({ x: wx, y: wy, on: r() < .45 });
    cerca.push(b);
  }
  return { lejos, cerca };
})();

let nubes = [], gotas = [], copos = [], gotasVidrio = [], tipoAnterior = null;
let relampago = 0, proximoRayo = 0, rayo = null, nieveAlfeizar = 0;
function nuevaNube(x) {
  const w = 12 + Math.floor(Math.random() * 16), partes = [];
  for (let k = 0; k < 4; k++) partes.push([Math.floor(rnd(2, w - 2)), Math.floor(rnd(-3, 1)), Math.floor(rnd(3, 6))]);
  return { x, y: VENTANA.y + Math.floor(rnd(5, 34)), w, partes, v: rnd(1.2, 3.2) };
}
function prepararClima(tipo) {
  const n = Math.round(nubosidad(tipo) * 7);
  nubes = Array.from({ length: n }, () => nuevaNube(rnd(VENTANA.x - 20, VENTANA.x + VENTANA.w)));
  const cantidad = { lluvia: 55, tormenta: 85 }[tipo] || 0;
  gotas = Array.from({ length: cantidad }, () => ({ x: rnd(VENTANA.x, VENTANA.x + VENTANA.w + 30), y: rnd(VENTANA.y - 10, VENTANA.y + VENTANA.h), v: rnd(120, 170) }));
  copos = tipo === "nieve" ? Array.from({ length: 50 }, () => ({ x: rnd(VENTANA.x, VENTANA.x + VENTANA.w), y: rnd(VENTANA.y, VENTANA.y + VENTANA.h), v: rnd(7, 15), f: rnd(0, 6) })) : [];
  gotasVidrio = cantidad ? Array.from({ length: 14 }, () => ({ x: Math.floor(rnd(VENTANA.x + 1, VENTANA.x + VENTANA.w - 1)), y: rnd(VENTANA.y, VENTANA.y + VENTANA.h), v: 0 })) : [];
  tipoAnterior = tipo;
}

function dibujarAfuera(t, dt, sol, h, tipo) {
  const { x, y, w, h: alto } = VENTANA;
  const [arriba, abajo] = coloresCielo(sol, tipo);
  for (let i = 0; i < alto; i += 2) rect(x, y + i, w, 2, mezclarColor(arriba, abajo, Math.round(i / alto * 7) / 7));
  const nubo = nubosidad(tipo), noche = clamp(-sol * 4, 0, 1);

  // estrellas
  if (noche > 0) for (const e of ESTRELLAS) {
    const a = noche * (1 - nubo) * (.45 + .55 * Math.sin(t / 1000 * e.v + e.f));
    if (a > .05) rect(e.x, e.y, 1, 1, `rgba(255,248,225,${a})`);
  }
  // sol y luna recorren la ventana a lo largo del día o de la noche
  if (sol > -.12) {
    const p = clamp((h - clima.sale) / (clima.pone - clima.sale), 0, 1);
    const sx = x + 8 + p * (w - 16), sy = y + alto - 32 - Math.sin(Math.PI * p) * (alto - 48);
    lp.globalAlpha = 1 - nubo * .7;
    circulo(sx, sy, 7 + Math.round((1 - clamp(sol * 4, 0, 1)) * 3), rgba("#ffd08a", .22));
    circulo(sx, sy, 4, mezclarColor("#ff9a4a", "#fff3b8", clamp(sol * 3, 0, 1)));
    lp.globalAlpha = 1;
  } else {
    const largo = 24 - (clima.pone - clima.sale), p = clamp((h > clima.pone ? h - clima.pone : h + 24 - clima.pone) / largo, 0, 1);
    const mx = x + 10 + p * (w - 20), my = y + 34 - Math.sin(Math.PI * p) * 22;
    lp.globalAlpha = 1 - nubo * .6;
    circulo(mx, my, 7, rgba("#d8e2ff", .12));
    circulo(mx, my, 5, "#f4ecd0");
    rect(mx - 2, my - 1, 2, 2, "#ddd3b4"); rect(mx + 1, my + 2, 1, 1, "#ddd3b4");
    const k = faseLunar() * 2, d = (k < 1 ? k : 2 - k) * 11, lado = k < 1 ? -1 : 1;   // sombra según la fase
    lp.save(); lp.beginPath(); lp.rect(mx - 6, my - 6, 13, 13); lp.clip();
    circulo(mx + lado * d, my, 5, mezclarColor(arriba, abajo, .3));
    lp.restore();
    lp.globalAlpha = 1;
  }
  // nubes
  const noct = clamp(-sol * 3 + .3, 0, 1), tormentosa = tipo === "tormenta" || tipo === "lluvia";
  const claro = mezclarColor(tormentosa ? "#8d93a3" : "#f6f3ec", tormentosa ? "#2b2e40" : "#3c4260", noct);
  const sombra = mezclarColor(tormentosa ? "#6b7080" : "#cfd3de", tormentosa ? "#1f2131" : "#2a2e47", noct);
  for (const n of nubes) {
    n.x += n.v * dt / 1000 * (tipo === "tormenta" ? 2.2 : 1);
    if (n.x > x + w + 4) Object.assign(n, nuevaNube(x - 34));
    for (const [px, py, r] of n.partes) circulo(n.x + px, n.y + py + 1, r, sombra);
    rect(n.x, n.y, n.w, 3, sombra);
    for (const [px, py, r] of n.partes) circulo(n.x + px, n.y + py, r, claro);
    rect(n.x + 1, n.y, n.w - 2, 2, claro);
  }
  // la ciudad
  const lejos = mezclarColor(abajo, "#1d1a33", .45), cerca = mezclarColor(abajo, "#130f24", .72);
  for (const b of EDIFICIOS.lejos) rect(b.x, y + alto - b.h, b.w, b.h, lejos);
  const encendidas = clamp(-sol * 5 + .4, 0, 1);
  for (const b of EDIFICIOS.cerca) {
    rect(b.x, y + alto - b.h, b.w, b.h, cerca);
    if (encendidas > 0) for (const l of b.luces) {
      if (Math.random() < .0004) l.on = !l.on;
      if (l.on) rect(b.x + l.x, y + alto - b.h + l.y, 1, 1, rgba("#ffd27a", encendidas * .9));
    }
  }
  // lluvia, nieve, niebla y rayos
  for (const g of gotas) {
    g.y += g.v * dt / 1000 * (tipo === "tormenta" ? 1.3 : 1); g.x -= g.v * .22 * dt / 1000;
    if (g.y > y + alto) { g.y = y - rnd(2, 20); g.x = rnd(x, x + w + 30); }
    linea(g.x, g.y, g.x + 1, g.y - 3, 1, rgba("#c4d4f5", .55));
  }
  for (const c of copos) {
    c.y += c.v * dt / 1000; c.x += Math.sin(t / 900 + c.f) * .15;
    if (c.y > y + alto) { c.y = y - 2; c.x = rnd(x, x + w); }
    rect(c.x, c.y, 1, 1, "#ffffff");
  }
  if (tipo === "niebla") for (let i = 0; i < 4; i++) {
    const fy = y + 20 + i * 14, fx = ((t / 80 * (i % 2 ? 1 : -.7)) % 120 + 120) % 120;
    lp.fillStyle = rgba(mezclarColor("#dfe3ea", "#4a4f66", noct), .22);
    lp.fillRect(x - 120 + fx, fy, 160, 8); lp.fillRect(x + 60 + fx, fy + 3, 140, 6);
  }
  if (tipo === "tormenta") {
    if (t > proximoRayo) {
      proximoRayo = t + rnd(5000, 15000); relampago = 1;
      rayo = [[rnd(x + 10, x + w - 10), y]];
      while (rayo.at(-1)[1] < y + alto - 20) { const [rx, ry] = rayo.at(-1); rayo.push([rx + rnd(-6, 6), ry + rnd(5, 9)]); }
    }
    if (relampago > .45 && rayo) for (let i = 1; i < rayo.length; i++) linea(rayo[i - 1][0], rayo[i - 1][1], rayo[i][0], rayo[i][1], 1, "#fffbe6");
    if (relampago > 0) { lp.fillStyle = `rgba(230,235,255,${relampago * .5})`; lp.fillRect(x, y, w, alto); }
  }
  relampago = Math.max(0, relampago - dt / 450);
}

/* ---------- Escena: el cuarto fijo (se dibuja una vez y se guarda) ---------- */

function armarFondo() {
  fondo = document.createElement("canvas");
  fondo.width = W; fondo.height = H;
  const antes = lp;
  lp = fondo.getContext("2d");
  lp.translate(ox, oy);
  const L = -ox, R = W - ox, T = -oy, B = H - oy;

  // pared con empapelado a rayas, zócalo con paneles
  rect(L, T, R - L, 150 - T, "#6b5b84");
  for (let x = L - ((L % 8) + 8) % 8; x < R; x += 8) rect(x, T, 1, 117 - T, "#73628d");
  rect(L, 117, R - L, 1, "#8a789e");
  rect(L, 118, R - L, 28, "#5b4c73");
  for (let x = L - ((L % 24) + 24) % 24; x < R; x += 24) { rect(x + 3, 122, 18, 20, "#56476d"); rect(x + 3, 122, 18, 1, "#4d4063"); rect(x + 3, 122, 1, 20, "#4d4063"); }
  rect(L, 146, R - L, 3, "#e2d3bd"); rect(L, 149, R - L, 1, "#b4a28a");
  // piso de madera
  rect(L, 150, R - L, B - 150, "#7a5238");
  for (let y = 150, fila = 0; y < B; y += 6 + Math.floor(fila / 2), fila++) {
    rect(L, y, R - L, 1, "#62402c");
    for (let x = L + ((fila * 37) % 53) - 53; x < R; x += 53) rect(x, y, 1, 6 + Math.floor(fila / 2), "#62402c");
  }
  rect(L, 150, R - L, 1, "#4f3324");
  // alfombra
  rect(100, 156, 150, 15, "#a94f68"); rect(102, 158, 146, 11, "#c0617b");
  for (let x = 106; x < 246; x += 8) { rect(x, 162, 3, 3, "#e3a0b2"); rect(x + 4, 160, 1, 1, "#e3a0b2"); rect(x + 4, 166, 1, 1, "#e3a0b2"); }
  for (let x = 100; x < 250; x += 3) { rect(x, 171, 1, 2, "#d9c3b0"); rect(x + 1, 154, 1, 2, "#d9c3b0"); }

  // ventana: el vidrio queda transparente y por ahí se ve el lienzo de afuera
  rect(36, 24, 90, 80, "#efe3cf");
  rect(36, 24, 90, 1, "#fff6e6"); rect(125, 24, 1, 80, "#cbb9a0");
  lp.clearRect(VENTANA.x, VENTANA.y, VENTANA.w, VENTANA.h);
  rect(80, 28, 2, 74, "#efe3cf"); rect(82, 28, 1, 74, "#cbb9a0");
  rect(40, 64, 82, 2, "#efe3cf"); rect(40, 66, 82, 1, "#cbb9a0");
  rect(30, 104, 102, 3, "#f3e8d6"); rect(30, 104, 102, 1, "#fffaf0"); rect(30, 107, 102, 2, "#c4b196"); rect(32, 109, 98, 1, "#5a4b72");
  // cortinas
  rect(22, 18, 120, 2, "#3a2a2a"); circulo(22, 18, 2, "#3a2a2a"); circulo(142, 18, 2, "#3a2a2a");
  for (const cx of [24, 126]) {
    rect(cx, 20, 13, 96, "#d6876e");
    for (let k = 2; k < 13; k += 4) rect(cx + k, 20, 1, 96, "#b9694f");
    for (let k = 0; k < 13; k += 2) rect(cx + k, 116, 1, 2, "#b9694f");
    for (let k = 0; k < 13; k += 3) rect(cx + k, 20, 2, 1, "#3a2a2a");
  }
  // póster con atardecer
  rect(150, 32, 28, 36, "#2d2438");
  const bandas = ["#ffd88a", "#ffb47a", "#ff8f78", "#e06a82", "#a95a8e", "#6d4c8c"];
  bandas.forEach((c, i) => rect(152, 34 + i * 5, 24, 5, c));
  circulo(164, 52, 5, "#fff1c4"); rect(152, 54, 24, 12, "#6d4c8c");
  for (let i = 0; i < 24; i++) rect(152 + i, 66 - Math.round(6 + 4 * Math.sin(i / 3) + 2 * Math.sin(i / 1.3)), 1, Math.round(6 + 4 * Math.sin(i / 3) + 2 * Math.sin(i / 1.3)), "#3d2f57");
  rect(152, 63, 24, 3, "#2a2140");
  rect(149, 31, 3, 2, "#e9dcc2"); rect(176, 31, 3, 2, "#e9dcc2");
  // planta de piso (monstera)
  for (const [lx, ly, r, c] of [[142, 112, 8, "#356b3c"], [133, 122, 7, "#3e7a43"], [154, 120, 7, "#356b3c"], [146, 102, 6, "#4f8f50"], [137, 110, 6, "#4f8f50"], [152, 109, 6, "#5ea35c"], [145, 124, 6, "#5ea35c"]]) {
    circulo(lx, ly, r, c); rect(lx - 1, ly - r + 2, 1, r * 2 - 4, "#2f5c35");
  }
  linea(145, 134, 142, 112, 1, "#2f5c35"); linea(146, 134, 152, 110, 1, "#2f5c35");
  rect(136, 134, 20, 3, "#d98060"); rect(138, 137, 16, 13, "#c26a45"); rect(138, 137, 16, 1, "#a65838"); rect(152, 137, 2, 13, "#a65838");
  // estante con libros, un vinilo y un potus colgando
  rect(236, 58, 82, 3, "#8a5a3b"); rect(236, 61, 82, 1, "#6a422a"); rect(242, 61, 2, 5, "#6a422a"); rect(310, 61, 2, 5, "#6a422a");
  let bx = 240;
  for (const [w, h, c] of [[3, 12, "#d9534f"], [4, 14, "#3f6e9e"], [3, 11, "#e8c547"], [3, 13, "#5e9b6a"], [5, 10, "#8c5aa8"], [3, 12, "#f0e6d2"]]) {
    rect(bx, 58 - h, w, h, c); rect(bx, 58 - h + 2, w, 1, "rgba(0,0,0,.18)"); bx += w;
  }
  linea(bx, 57, bx + 6, 47, 3, "#c2793e");
  circulo(277, 51, 7, "#1d1a22"); circulo(277, 51, 2, "#e07a5f"); rect(277, 51, 1, 1, "#1d1a22");
  rect(271, 44, 1, 1, "#3a3542"); rect(282, 47, 1, 1, "#3a3542");
  rect(292, 51, 10, 7, "#e2d3bd"); rect(292, 51, 10, 1, "#f3e8d6");
  for (const [vx, largo] of [[292, 14], [295, 9], [299, 17], [302, 7]]) {
    for (let k = 0; k < largo; k++) rect(vx + Math.round(Math.sin(k / 3)), 58 + k, 1, 1, "#3e7a43");
    for (let k = 2; k < largo; k += 4) rect(vx + Math.round(Math.sin(k / 3)) + (k % 8 ? 1 : -1), 58 + k, 2, 2, "#5ea35c");
  }
  for (const [lx, ly] of [[293, 48], [296, 46], [299, 48], [301, 49]]) rect(lx, ly, 2, 3, "#5ea35c");
  // escritorio
  rect(222, 106, 98, 2, "#b07a50"); rect(222, 108, 98, 3, "#8a5a3b"); rect(222, 111, 98, 1, "#5e3c26");
  rect(225, 112, 3, 38, "#6e452c"); rect(314, 112, 3, 38, "#6e452c");
  rect(286, 112, 28, 24, "#8a5a3b"); rect(286, 112, 28, 1, "#5e3c26"); rect(286, 124, 28, 1, "#6e452c"); rect(298, 117, 4, 1, "#e2d3bd"); rect(298, 129, 4, 1, "#e2d3bd");
  // monitor (la pantalla se dibuja aparte) y teclado
  rect(244, 70, 44, 30, "#2a2833"); rect(244, 70, 44, 1, "#3d3a49");
  rect(263, 100, 5, 4, "#2a2833"); rect(258, 104, 15, 2, "#3d3a49");
  rect(230, 103, 19, 3, "#3d3a49"); for (let k = 231; k < 248; k += 2) rect(k, 104, 1, 1, "#7d7890");
  // termo
  rect(298, 90, 5, 16, "#4f7a52"); rect(298, 90, 1, 16, "#6f9a6f"); rect(297, 88, 7, 3, "#2f3a33"); rect(299, 86, 3, 2, "#2f3a33");
  // silla
  rect(193, 84, 7, 37, "#34303f"); rect(194, 85, 1, 35, "#4a4458"); rect(193, 119, 31, 4, "#34303f"); rect(193, 119, 31, 1, "#4a4458");
  rect(206, 123, 4, 18, "#26232f"); rect(196, 141, 24, 2, "#26232f");
  for (const wx of [196, 217]) rect(wx, 143, 3, 3, "#1a1820");
  lp = antes;
}

/* ---------- Escena: lo que se mueve ---------- */

const pj = { accion: "nada", hasta: 0, proxima: 5000, parpadea: 0, proxParpadeo: 2500, mate: 0 };
const gato = { mimos: -1e9, siestaHasta: 0, proximaSiesta: 120000, lado: 1, ultimoGolpe: 0, corazones: [] };
let lampara = null;   // null: automática según la luz; true/false: la prendiste o apagaste con un clic
const codigo = [];
let ultimaLinea = 0;

function actualizarPersonaje(t, h) {
  const tarde = h >= 1.5 && h < 6;
  if (!sonando() && tarde) { pj.accion = "dormido"; return; }
  if (pj.accion === "dormido") { pj.accion = "nada"; pj.proxima = t + 3000; }
  if (pj.accion !== "nada" && t > pj.hasta) { pj.accion = "nada"; pj.proxima = t + rnd(6000, 16000); }
  if (pj.accion === "nada" && t > pj.proxima) {
    pj.accion = elegir(sonando() ? ["mate", "teclear", "teclear"] : ["mate", "estirarse", "teclear", "mate"]);
    pj.hasta = t + { mate: 4500, estirarse: 3200, teclear: rnd(4000, 9000) }[pj.accion];
  }
  if (t > pj.proxParpadeo) { pj.parpadea = t + 140; pj.proxParpadeo = t + rnd(2200, 6000); }
}

function brazo(sx, sy, mx, my, color, piel) {
  const L1 = 12, L2 = 13;
  let dx = mx - sx, dy = my - sy;
  const d = clamp(Math.hypot(dx, dy), 3, L1 + L2 - .01), a = Math.atan2(dy, dx);
  const b = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const cx = sx + Math.cos(a + b) * L1, cy = sy + Math.sin(a + b) * L1;   // el codo va hacia abajo
  const a2 = Math.atan2(my - cy, mx - cx), hx = cx + Math.cos(a2) * L2, hy = cy + Math.sin(a2) * L2;
  linea(sx, sy, cx, cy, 3, color);
  linea(cx, cy, hx, hy, 3, color);
  rect(hx - 1, hy - 1, 2, 2, piel);
  return [hx, hy];
}

function dibujarPersonaje(t) {
  const P = paletaPersonaje(), dormido = pj.accion === "dormido";
  // piernas
  linea(210, 118, 225, 118, 6, P.J);
  linea(226, 119, 228, 143, 5, P.J);
  rect(224, 143, 10, 3, "#ece6dc"); rect(224, 146, 10, 1, "#9a948c"); rect(231, 143, 3, 1, P.b);
  // manos: dónde van según lo que esté haciendo
  const tec = pj.accion === "teclear" ? Math.floor(t / 110) : 0;
  let frente = [234, 102 - (tec % 2)], atras = [240, 102 - ((tec + 1) % 2)];
  if (pj.accion === "mate") frente = [220, 93];
  if (pj.accion === "estirarse") { const s = Math.sin((pj.hasta - t) / 3200 * Math.PI); frente = [224, 96 - 24 * s]; atras = [209, 96 - 23 * s]; }
  brazo(212, 96, atras[0], atras[1], P.b, P.s);
  pegar(sprite("torso" + P.B, TORSO, P), 203, 91);
  const bob = dormido ? 2 : cabeceo > .35 ? 1 : 0, hx = 207 + (dormido ? 1 : 0), hy = 78 + bob;
  pegar(sprite("cabeza", CABEZA, P), hx, hy);
  if (dormido || t < pj.parpadea) { rect(hx + 12, hy + 7, 1, 1, P.S); rect(hx + 11, hy + 8, 2, 1, P.s); }
  pegar(sprite("auris", AURICULARES, P), hx, hy - 1);
  rect(hx + 6, hy + 7, 2, 2, colorLuces());
  const mano = brazo(215, 96, frente[0], frente[1], P.B, P.S);
  if (pj.accion === "mate") pegar(sprite("mate", MATE, MATE_PAL), mano[0] - 3, mano[1] - 7);
  else pegar(sprite("mate", MATE, MATE_PAL), 291, 99);
  if (dormido) zetas(t, hx + 13, hy - 2, "#e8e3f5");
}
const MATE_PAL = { k: "#c9c9d1", G: "#7da04a", M: "#8a5a3b", m: "#a87650" };

function zetas(t, x, y, col) {
  for (let i = 0; i < 3; i++) {
    const p = ((t / 2600 + i / 3) % 1);
    texto("Z", x + p * 6 + Math.sin(p * 6) * 1.5, y - p * 14, rgba(col, Math.sin(p * Math.PI)));
  }
}

function estadoGato(t, h) {
  if (t - gato.mimos < 2600) return "feliz";
  if (sistema.cpu >= 85) return "erizado";
  if (sonando()) return "baila";
  if ((h >= 0 && h < 6) || t < gato.siestaHasta) return "duerme";
  if (t > gato.proximaSiesta) { gato.siestaHasta = t + 90000; gato.proximaSiesta = t + 90000 + rnd(150000, 300000); }
  return "sentado";
}

function dibujarGato(t, h) {
  const pal = GATOS[cfg.gato] || GATOS.naranja, estado = estadoGato(t, h), x = 103, y = 90;
  if (golpes !== gato.ultimoGolpe) { gato.ultimoGolpe = golpes; gato.lado = -gato.lado; }
  if (estado === "duerme") {
    pegar(sprite("gato-duerme-" + cfg.gato, GATO_DUERME, pal), x - 1, y + 7);
    zetas(t, x + 12, y + 4, "#e8e3f5");
  } else {
    // la cola: una curva que se balancea (al ritmo cuando suena música)
    let ang = Math.PI, cx = x + 3, cy = y + 11;
    const curva = estado === "erizado" ? 0 : estado === "baila" ? .3 + .18 * gato.lado * cabeceo : .26 + .16 * Math.sin(t / 650);
    if (estado === "erizado") linea(x + 3, y + 11, x + 1, y - 1, 3, pal.O);
    else for (let i = 0; i < 9; i++) {
      ang += i < 2 ? 0 : curva;
      const nx = cx + Math.cos(ang) * 1.4, ny = cy + Math.sin(ang) * 1.4;
      linea(cx, cy, nx, ny, i < 6 ? 2 : 1, i > 6 ? pal.S : pal.O);
      cx = nx; cy = ny;
    }
    const dxCabeza = estado === "baila" && cabeceo > .3 ? gato.lado : 0, dyCabeza = estado === "baila" && cabeceo > .5 ? 1 : 0;
    pegar(sprite("gato-cuerpo-" + cfg.gato, GATO_CUERPO, pal), x, y + 7);
    pegar(sprite("gato-cabeza-" + cfg.gato, GATO_CABEZA, pal), x + dxCabeza, y + dyCabeza);
    const ex = x + dxCabeza, ey = y + dyCabeza;
    if (estado === "feliz") for (const k of [6, 10]) { rect(ex + k, ey + 4, 1, 1, pal.O); rect(ex + k - 1, ey + 4, 1, 1, pal.c); rect(ex + k, ey + 3, 1, 1, pal.c); rect(ex + k + 1, ey + 4, 1, 1, pal.c); }
    if (estado === "erizado") {
      for (let k = 0; k < 13; k += 2) { rect(x + 2 + k * .7, y + 6 - (k % 4 ? 1 : 0), 1, 2, pal.O); }
      for (let k = 0; k < 4; k++) { rect(x - 1 + k, y - 1 - k * 3, 1, 1, pal.O); rect(x + 3 - k % 2, y - k * 3, 1, 1, pal.O); }
      texto("!", x + 8, y - 7, "#ffcf5a");
    }
  }
  if (estado === "feliz") {
    const nombre = `${cfg.nombreGato || "Michi"} ♥`, w = anchoTexto(nombre) + 4, bx = Math.round(x + 9 - w / 2);
    rect(bx, y - 12, w, 9, "rgba(20,16,32,.8)"); texto(nombre, bx + 2, y - 10, "#ffe3ea");
  }
  // corazones de los mimos
  gato.corazones = gato.corazones.filter(c => t - c.t0 < 1600);
  for (const c of gato.corazones) {
    const p = (t - c.t0) / 1600;
    if (p < 0) continue;
    lp.globalAlpha = 1 - p;
    pegar(sprite("corazon", CORAZON, { X: "#ff6b8a" }), c.x + Math.sin(p * 8 + c.f) * 2, c.y - p * 18);
    lp.globalAlpha = 1;
  }
}

function dibujarEscritorio(t, h) {
  // reloj de pared con la hora real
  const d = new Date(), cx = 202, cy = 44;
  circulo(cx, cy, 7, "#2d2438"); circulo(cx, cy, 6, "#f3ead8");
  for (let k = 0; k < 12; k += 3) rect(cx + Math.round(Math.sin(k / 6 * Math.PI) * 5), cy - Math.round(Math.cos(k / 6 * Math.PI) * 5), 1, 1, "#8a7a6a");
  const am = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2, mm = d.getMinutes() / 60 * Math.PI * 2;
  linea(cx, cy, cx + Math.sin(am) * 3, cy - Math.cos(am) * 3, 1, "#2d2438");
  linea(cx, cy, cx + Math.sin(mm) * 5, cy - Math.cos(mm) * 5, 1, "#c0617b");
  // guirnalda de lucecitas
  const col = colorLuces();
  for (let x = 140; x <= 236; x++) rect(x, 14 + Math.round(9 * (1 - ((x - 188) / 48) ** 2)), 1, 1, "#2d2638");
  GUIRNALDA.forEach((c, i) => {
    const x = 142 + i * 8, y = 15 + Math.round(9 * (1 - ((x - 188) / 48) ** 2));
    const brillo = .55 + .45 * Math.sin(t / 700 + i * 1.7) * (sonando() ? .3 : 1) + (sonando() ? cabeceo * .35 : 0);
    rect(x, y, 2, 2, mezclarColor("#5b4c73", i % 3 === 1 ? col : c, clamp(brillo, .2, 1)));
  });
  // tira de luces LED arriba de todo
  rect(-ox, -oy, W, 1, mezclarColor("#3a3048", col, .6 + graves * .4));
  // lámpara
  const prendida = lamparaPrendida(h);
  rect(306, 103, 10, 3, "#2d2438"); linea(311, 103, 314, 86, 1, "#2d2438"); linea(314, 86, 306, 80, 1, "#2d2438");
  for (let k = 0; k < 6; k++) rect(298 + k, 79 + Math.floor(k / 2), 9 - k, 1, "#f0c35a");
  rect(298, 82, 7, 2, "#d19a3a");
  rect(300, 84, 3, 1, prendida ? "#fff4c7" : "#7d6b53");
  // vapor del mate cuando se lo toma
  if (pj.accion !== "mate" && t - pj.mate < 9000) for (let i = 0; i < 3; i++) {
    const p = ((t / 1800 + i / 3) % 1);
    rect(293 + Math.round(Math.sin(p * 7 + i) * 1.5), 97 - p * 10, 1, 1, rgba("#f3ead8", .5 * (1 - p)));
  }
}
const GUIRNALDA = ["#ffcf7a", "#ff8fa3", "#8fd3ff", "#b8f28c", "#ffcf7a", "#ff8fa3", "#8fd3ff", "#b8f28c", "#ffcf7a", "#ff8fa3", "#8fd3ff", "#b8f28c", "#ffcf7a"];
function lamparaPrendida(h) { return lampara ?? (oscuridad > .18); }

function dibujarMonitor(t) {
  const x = 246, y = 72, col = colorLuces();
  rect(x, y, 40, 26, "#151829");
  if (pista.titulo && pista.estado !== "stopped") {
    if (pista.hayTapa) lp.drawImage(tapa, x + 2, y + 2);
    else { circulo(x + 9, y + 9, 6, "#0d0d12"); circulo(x + 9, y + 9, 2, col); }
    for (let i = 0; i < 10; i++) {
      const alto = Math.round(clamp(banda(i), 0, 1) * 12);
      rect(x + 19 + i * 2, y + 15 - alto, 1, Math.max(1, alto), mezclarColor(col, "#ffffff", .2));
    }
    if (!sonando()) { rect(x + 6, y + 5, 2, 7, "#f3ead8"); rect(x + 10, y + 5, 2, 7, "#f3ead8"); }
    const s = `${pista.titulo}${pista.artista ? " · " + pista.artista : ""}     `, ancho = anchoTexto(s) + 1;
    const corrido = ancho > 37 ? Math.floor(t / 110) % ancho : 0;
    lp.save(); lp.beginPath(); lp.rect(x + 1, y + 17, 38, 6); lp.clip();
    texto(s, x + 2 - corrido, y + 18, "#e8e3f5");
    if (corrido) texto(s, x + 2 - corrido + ancho, y + 18, "#e8e3f5");
    lp.restore();
    rect(x + 2, y + 24, 36, 1, "#2c3150");
    if (pista.dur > 0) rect(x + 2, y + 24, Math.round(36 * clamp(posicionActual() / pista.dur, 0, 1)), 1, col);
  } else {
    // sin música: un editor de código que avanza cuando teclea
    if (!codigo.length) for (let i = 0; i < 6; i++) codigo.push(lineaCodigo());
    if (pj.accion === "teclear" && t - ultimaLinea > 700) { codigo.shift(); codigo.push(lineaCodigo()); ultimaLinea = t; }
    codigo.forEach((l, i) => { let cx = x + 3 + l.sangria; for (const [w, c] of l.partes) { rect(cx, y + 3 + i * 4, w, 1, c); cx += w + 1; } });
    if (Math.floor(t / 500) % 2) { const l = codigo.at(-1); rect(x + 3 + l.sangria + l.partes.reduce((s, [w]) => s + w + 1, 0), y + 22, 1, 2, "#f3ead8"); }
  }
}
function lineaCodigo() {
  const colores = ["#c792ea", "#82aaff", "#c3e88d", "#f78c6c", "#89ddff", "#d6deeb"];
  return { sangria: elegir([0, 0, 3, 3, 6]), partes: Array.from({ length: 1 + Math.floor(rnd(0, 3)) }, () => [Math.floor(rnd(2, 9)), elegir(colores)]) };
}

/* ---------- Luz: oscuridad de noche, con huecos donde hay lámparas ---------- */

let oscuridad = 0;
function hueco(x, y, r, a) {
  const gr = lctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(.55, `rgba(0,0,0,${a * .55})`); gr.addColorStop(1, "rgba(0,0,0,0)");
  lctx.fillStyle = gr; lctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function brillo(x, y, r, col, a) {
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function iluminar(t, sol, tipo, h) {
  const extra = { nublado: .08, lluvia: .16, tormenta: .22, nieve: .06, niebla: .1 }[tipo] || 0;
  oscuridad = clamp(clamp((.12 - sol) / .35, 0, 1) * .62 + extra * (sol > 0 ? 1 : .4), 0, .72) * (1 - relampago * .7);
  const col = colorLuces(), lamp = lamparaPrendida(h);
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = "source-over";
  lctx.clearRect(0, 0, W, H);
  if (oscuridad > .01) {
    lctx.fillStyle = `rgba(16,10,44,${oscuridad})`;
    lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = "destination-out";
    lctx.translate(ox, oy);
    if (lamp) hueco(302, 96, 90, .95);
    hueco(266, 86, 42, .75);
    hueco(81, 66, 70, clamp(sol + .45, .15, .6));
    hueco(188, 22, 46, .32);
    // la oscuridad oscurece solo el cuarto: el cielo ya tiene su propio color de noche
    ctx.globalCompositeOperation = "source-atop";
    ctx.drawImage(luz, 0, 0);
  }
  ctx.translate(ox, oy);
  ctx.globalCompositeOperation = "lighter";
  if (lamp) brillo(302, 92, 70, "#ffb86b", .16 + oscuridad * .12);
  brillo(266, 86, 34, sonando() ? col : "#8fb8ff", .08 + oscuridad * .1 + graves * .08);
  brillo(188, 22, 40, col, oscuridad * (.1 + cabeceo * .06));
  const tira = ctx.createLinearGradient(0, -oy, 0, -oy + 40);
  tira.addColorStop(0, rgba(col, (.1 + graves * .3) * (.4 + oscuridad))); tira.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = tira; ctx.fillRect(-ox, -oy, W, 40);
  if (sol > 0) {   // el sol que entra por la ventana y pega en el piso
    ctx.fillStyle = rgba("#fff1cf", .1 * clamp(sol * 2, 0, 1) * (1 - nubosidad(tipo) * .8));
    ctx.beginPath(); ctx.moveTo(42, 151); ctx.lineTo(120, 151); ctx.lineTo(178, 176); ctx.lineTo(84, 176); ctx.fill();
  }
  if (relampago > 0) { ctx.fillStyle = `rgba(200,210,255,${relampago * .25})`; ctx.fillRect(-ox, -oy, W, H); }
  ctx.globalCompositeOperation = "source-over";
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* ---------- Información en pantalla: hora, clima, canción y botones ---------- */

const DIAS = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];
const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const NOMBRE_CLIMA = { despejado: "DESPEJADO", nublado: "NUBLADO", lluvia: "LLUVIA", tormenta: "TORMENTA", nieve: "NIEVE", niebla: "NIEBLA" };
let zonas = [];

function dibujarInfo(t, tipo) {
  zonas = [];
  if (!cfg.info) return;
  lp = ctx;
  const d = new Date(), crema = "#f3e9d2", sombra = "rgba(20,14,36,.75)", der = W - 6;
  let hh = d.getHours(), sufijo = "";
  if (!cfg.h24) { sufijo = hh < 12 ? " AM" : " PM"; hh = hh % 12 || 12; }
  const hora = `${cfg.h24 ? String(hh).padStart(2, "0") : hh}:${String(d.getMinutes()).padStart(2, "0")}`;
  const anchoHora = anchoTexto(hora, 2) + (sufijo ? anchoTexto(sufijo) + 2 : 0);
  texto(hora, der - anchoHora, 6, crema, 2, sombra);
  if (sufijo) texto(sufijo, der - anchoTexto(sufijo), 6, crema, 1, sombra);
  let linea2 = `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
  if (cfg.clima !== "auto" || clima.ok) {
    const temp = clima.ok && cfg.clima === "auto" ? ` ${Math.round(cfg.fahrenheit ? clima.temp * 9 / 5 + 32 : clima.temp)}°` : "";
    linea2 += ` ·${temp} ${NOMBRE_CLIMA[tipo]}`;
  }
  texto(linea2, der - anchoTexto(linea2), 19, crema, 1, sombra);
  if (pista.titulo && pista.estado !== "stopped") {
    let s = `♪ ${pista.titulo}${pista.artista ? " · " + pista.artista : ""}`;
    if (anchoTexto(s) > 110) { while (anchoTexto(s + "...") > 110) s = s.slice(0, -1); s = s.replace(/[\s·]+$/, "") + "..."; }
    texto(s, der - anchoTexto(s), 27, mezclarColor(crema, colorLuces(), .35), 1, sombra);
  }
  if (sistema.conectado || fuente === "demo") {
    const botones = [["prev", "prev"], [sonando() ? "pausa" : "play", "playpause"], ["next", "next"]];
    botones.forEach(([icono, accion], i) => {
      const bx = der - 33 + i * 12, by = pista.titulo && pista.estado !== "stopped" ? 36 : 28;
      lp.fillStyle = "rgba(20,14,36,.55)"; lp.fillRect(bx - 2, by - 2, 9, 9);
      pegar(sprite("icono-" + icono, ICONOS[icono], { X: crema }), bx, by);
      zonas.push({ x: bx - 3, y: by - 3, w: 11, h: 11, accion: () => accionMusica(accion) });
    });
  }
}

/* ---------- Bucle principal ---------- */

let ultimo = 0;
function cuadro(t) {
  requestAnimationFrame(cuadro);
  if (pausado || t - ultimo < 1000 / cfg.fps - 2) return;
  const dt = Math.min(100, t - (ultimo || t));
  ultimo = t;
  if (fuente === "demo" && sonando()) audioDemo(t);
  ritmo(t, dt);
  arcoiris += dt * .02;
  const h = horaEscena(), sol = alturaSol(h), tipo = tipoClima();
  if (tipo !== tipoAnterior) prepararClima(tipo);
  actualizarPersonaje(t, h);
  if (pj.accion === "mate") pj.mate = t;

  // 1. lo de afuera, en su propio lienzo
  lp = actx;
  actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, W, H); actx.translate(ox, oy);
  dibujarAfuera(t, dt, sol, h, tipo);
  // 2. el cuarto
  if (!fondo) armarFondo();
  lp = ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(fondo, 0, 0);
  ctx.translate(ox, oy);
  dibujarVidrio(t, dt, tipo);
  dibujarEscritorio(t, h);
  dibujarMonitor(t);
  dibujarPersonaje(t);
  dibujarGato(t, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // 3. la noche oscurece el cuarto; después va el cielo por detrás y la información arriba
  iluminar(t, sol, tipo, h);
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(afuera, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  dibujarInfo(t, tipo);
}

function dibujarVidrio(t, dt, tipo) {
  // gotas que resbalan por el vidrio
  for (const g of gotasVidrio) {
    if (g.v === 0 && Math.random() < .004) g.v = rnd(8, 25);
    g.y += g.v * dt / 1000;
    if (g.v && Math.random() < .02) g.v = 0;
    if (g.y > VENTANA.y + VENTANA.h - 2) { g.y = VENTANA.y + rnd(0, 20); g.x = Math.floor(rnd(VENTANA.x + 1, VENTANA.x + VENTANA.w - 1)); g.v = 0; }
    if (Math.abs(g.x - 81) < 2 || Math.abs(g.y - 65) < 2) continue;
    rect(g.x, g.y, 1, 1, "rgba(220,235,255,.75)");
    if (g.v) rect(g.x, g.y - 3, 1, 3, "rgba(200,220,255,.25)");
  }
  // la nieve se junta en el alféizar
  nieveAlfeizar = tipo === "nieve" ? Math.min(1, nieveAlfeizar + dt / 60000) : Math.max(0, nieveAlfeizar - dt / 20000);
  if (nieveAlfeizar > .05) for (let x = 30; x < 132; x++) {
    const alto = Math.round(nieveAlfeizar * (2 + Math.sin(x / 4) + Math.sin(x / 1.7) * .5));
    if (alto > 0) rect(x, 104 - alto, 1, alto, "#f4f7ff");
  }
}

/* ---------- Clics: gato, lámpara y botones ---------- */

lienzo.addEventListener("click", e => {
  const px = e.clientX * dpr / escala, py = e.clientY * dpr / escala;
  for (const z of zonas) if (px >= z.x && px < z.x + z.w && py >= z.y && py < z.y + z.h) return z.accion();
  const x = px - ox, y = py - oy, t = performance.now();
  if (x >= 96 && x <= 120 && y >= 84 && y <= 106) {   // mimos al gato
    gato.mimos = t; gato.siestaHasta = 0;
    for (let i = 0; i < 3; i++) gato.corazones.push({ x: 99 + i * 7, y: 92 - i * 2, t0: t + i * 200, f: i * 2 });
  } else if (x >= 295 && x <= 318 && y >= 76 && y <= 106) {   // la lámpara
    lampara = !lamparaPrendida(horaEscena());
  }
});

/* ---------- Wallpaper Engine ---------- */

const rgbWE = v => rgbHex(v.split(" ").map(x => parseFloat(x) * 255));
window.wallpaperPropertyListener = {
  applyUserProperties(p) {
    if (fuente !== "lively") fuente = "we";
    ocultarDemo();
    const antes = cfg.ciudad;
    if (p.ciudad) cfg.ciudad = p.ciudad.value;
    if (p.clima) cfg.clima = p.clima.value;
    if (p.hora) cfg.hora = p.hora.value;
    if (p.gato) cfg.gato = p.gato.value;
    if (p.nombregato) cfg.nombreGato = p.nombregato.value;
    if (p.colorbuzo) cfg.buzo = rgbWE(p.colorbuzo.value);
    if (p.luces) cfg.led = p.luces.value;
    if (p.colorluces) cfg.colorLed = rgbWE(p.colorluces.value);
    if (p.info) cfg.info = p.info.value;
    if (p.h24) cfg.h24 = p.h24.value;
    if (p.fahrenheit) cfg.fahrenheit = p.fahrenheit.value;
    if (p.sensibilidad) cfg.sensibilidad = p.sensibilidad.value;
    if (cfg.ciudad !== antes) traerClima();
  },
  applyGeneralProperties(p) { if (p.fps) cfg.fps = p.fps; },
  setPaused(v) { pausado = v; },
};

function registrarWE() {
  if (!window.wallpaperRegisterAudioListener) return;
  fuente = "we"; ocultarDemo();
  window.wallpaperRegisterAudioListener(recibirAudio);
  const M = window.wallpaperMediaIntegration || {};
  window.wallpaperRegisterMediaPropertiesListener?.(ev => { pista.titulo = ev.title || ""; pista.artista = ev.artist || ev.albumArtist || ""; });
  window.wallpaperRegisterMediaThumbnailListener?.(ev => ponerPortada(ev.thumbnail || null));
  window.wallpaperRegisterMediaPlaybackListener?.(ev => {
    pista.pos = posicionActual(); pista.marca = performance.now();
    pista.estado = ev.state === (M.PLAYBACK_PLAYING ?? 1) ? "playing" : ev.state === (M.PLAYBACK_STOPPED ?? 0) ? "stopped" : "paused";
    if (pista.estado === "stopped") { Object.assign(pista, { titulo: "", artista: "", pos: 0, dur: 0 }); ponerPortada(null); }
  });
  window.wallpaperRegisterMediaTimelineListener?.(ev => { pista.pos = ev.position || 0; pista.dur = ev.duration || 0; pista.marca = performance.now(); });
}

/* ---------- Lively Wallpaper ---------- */

window.livelyAudioListener = arr => { if (fuente !== "lively") { fuente = "lively"; ocultarDemo(); } recibirAudio(arr); };
window.livelyPropertyListener = (nombre, valor) => {
  fuente = "lively"; ocultarDemo();
  const listas = {
    clima: ["auto", "despejado", "nublado", "lluvia", "tormenta", "nieve", "niebla"],
    hora: ["real", "amanecer", "dia", "atardecer", "noche"],
    gato: ORDEN_GATOS, luces: ["portada", "arcoiris", "fijo"],
  };
  const claves = { luces: "led", colorLuces: "colorLed", colorBuzo: "buzo" };
  const k = claves[nombre] || nombre;
  if (listas[nombre]) cfg[k] = listas[nombre][valor] ?? cfg[k];
  else if (k in cfg) cfg[k] = valor;
  if (nombre === "ciudad") traerClima();
};
window.livelyCurrentTrack = datos => {
  fuente = "lively"; ocultarDemo();
  const t = typeof datos === "string" ? (datos ? JSON.parse(datos) : null) : datos;
  if (!t || !t.Title) { Object.assign(pista, { titulo: "", artista: "", estado: "stopped" }); ponerPortada(null); return; }
  Object.assign(pista, { titulo: t.Title, artista: t.Artist || t.AlbumArtist || "", estado: "playing", dur: 0 });
  ponerPortada(t.Thumbnail ? (t.Thumbnail.startsWith("data:") ? t.Thumbnail : `data:image/png;base64,${t.Thumbnail}`) : null);
};

/* ---------- Vista previa en el navegador ---------- */

function iniciarDemo() {
  if (fuente) return;
  fuente = "demo";
  Object.assign(pista, { titulo: "Lluvia en la ventana", artista: "cuartito", estado: "playing", pos: 31, dur: 187, marca: performance.now() });
  // una portada de ejemplo: atardecer con sol
  const gr = tctx.createLinearGradient(0, 0, 0, 14);
  gr.addColorStop(0, "#ff9a8b"); gr.addColorStop(1, "#7b5cff");
  tctx.fillStyle = gr; tctx.fillRect(0, 0, 14, 14);
  tctx.fillStyle = "#ffe8a3"; tctx.beginPath(); tctx.arc(7, 8, 3.5, 0, 7); tctx.fill();
  tctx.fillStyle = "#3d2f57"; tctx.fillRect(0, 10, 14, 4);
  pista.portada = "demo"; pista.hayTapa = true; pista.color = "#c77dff";
  if (params.get("musica") === "0") Object.assign(pista, { titulo: "", estado: "stopped" });
  if (!params.has("captura")) $("#demo").hidden = false;
  marcarDemo();
}
function ocultarDemo() { $("#demo").hidden = true; }
function audioDemo(t) {
  const s = t / 1000, pulso = Math.max(0, Math.sin(s * Math.PI * 84 / 60)) ** 10;
  for (let i = 0; i < BANDAS; i++) {
    const base = (1 - i / BANDAS) ** 1.7 * .5;
    audio[i] = Math.max(base * (.6 + .4 * Math.sin(s * 2.3 + i * .4) * Math.sin(s * 1.1 + i * .13)) + pulso * (1 - i / BANDAS) ** 2 * .6, audio[i] * .8);
  }
  ultimoAudio = t;
  if (posicionActual() >= pista.dur) { pista.pos = 0; pista.marca = performance.now(); }
}
function marcarDemo() {
  document.querySelectorAll("#demo .grupo[data-grupo] button").forEach(b => b.setAttribute("aria-pressed", cfg[b.parentElement.dataset.grupo] === b.dataset.v));
  $("#demo-musica").setAttribute("aria-pressed", sonando());
}
document.querySelectorAll("#demo .grupo[data-grupo] button").forEach(b => b.addEventListener("click", () => {
  cfg[b.parentElement.dataset.grupo] = b.dataset.v; marcarDemo();
}));
$("#demo-musica").addEventListener("click", () => accionMusica("playpause"));
$("#demo-gato").addEventListener("click", () => {
  cfg.gato = ORDEN_GATOS[(ORDEN_GATOS.indexOf(cfg.gato) + 1) % ORDEN_GATOS.length];
  gato.mimos = performance.now();
});

/* ---------- Arranque ---------- */

ajustar();
addEventListener("resize", ajustar);
registrarWE();
traerClima();
setInterval(traerClima, 20 * 60 * 1000);
setTimeout(iniciarDemo, 1500);   // si en 1,5 s no habló Wallpaper Engine ni Lively, es la vista previa
setInterval(consultarAyudante, 4000);
requestAnimationFrame(cuadro);
