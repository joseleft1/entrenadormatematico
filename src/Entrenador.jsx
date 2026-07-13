import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { gsap } from "gsap";
import confetti from "canvas-confetti";
import Matter from "matter-js";

// ============================================================================
// CAPA DE ANIMACIÓN (Fase 8) — GSAP + confetti + Matter.js, todas EMPAQUETADAS
// (funcionan sin internet una vez cargada la app). Envueltas en helpers
// DEFENSIVOS: si por lo que sea una librería no cargara, la app sigue viva y
// solo omite el adorno — nunca se cae por una animación.
// ============================================================================

// Respeta "reducir animaciones" del sistema operativo (accesibilidad).
const PREFIERE_ESTATICO = typeof window !== "undefined" && window.matchMedia
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Anima un nodo con GSAP de forma segura. Si gsap no existe, no hace nada.
function animar(target, vars) {
  try { if (gsap && target && !PREFIERE_ESTATICO) return gsap.to(target, vars); } catch (e) {}
  return null;
}
function animarDesde(target, vars) {
  try { if (gsap && target && !PREFIERE_ESTATICO) return gsap.from(target, vars); } catch (e) {}
  return null;
}
// Dibuja una polilínea SVG "trazándose" (draw-on) usando stroke-dashoffset.
function trazarSVG(pathNode, dur = 0.9) {
  try {
    if (!pathNode || !gsap || PREFIERE_ESTATICO) return;
    const len = pathNode.getTotalLength ? pathNode.getTotalLength() : 0;
    if (!len) return;
    gsap.set(pathNode, { strokeDasharray: len, strokeDashoffset: len });
    gsap.to(pathNode, { strokeDashoffset: 0, duration: dur, ease: "power2.out" });
  } catch (e) {}
}
// Confeti para momentos de recompensa. Distintas intensidades por evento.
function festejar(tipo = "acierto") {
  try {
    if (!confetti || PREFIERE_ESTATICO) return;
    if (tipo === "dominado") {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ["#3D6B35", "#D9A526", "#2F5233", "#B4432E"] });
      setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } }), 150);
      setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } }), 300);
    } else if (tipo === "nivel") {
      confetti({ particleCount: 90, spread: 100, startVelocity: 40, origin: { y: 0.5 }, colors: ["#D9A526", "#3D6B35", "#355070"] });
    } else {
      confetti({ particleCount: 28, spread: 45, startVelocity: 28, origin: { y: 0.7 }, scalar: 0.8, colors: ["#3D6B35", "#D9A526"] });
    }
  } catch (e) {}
}

// ----------------------------------------------------------------------------
// LienzoFisica — motor de simulación reutilizable (Matter.js). Cada interactivo
// que quiera física real le pasa una función `setup(mundo, dims, api)` que agrega
// sus cuerpos. Este componente se encarga de lo delicado UNA sola vez y bien:
// crear el motor, correrlo, y —lo más importante— DESMONTARLO por completo al
// salir (parar runner + render, limpiar mundo) para no dejar bucles corriendo.
// Es ADITIVO: si Matter no cargó, no renderiza nada y el SVG de siempre queda.
// ----------------------------------------------------------------------------
function LienzoFisica({ setup, alto = 200, deps = [], onApi, onTap, fondo }) {
  const cont = useRef(null);
  const refs = useRef({});
  useEffect(() => {
    if (!Matter || PREFIERE_ESTATICO || !cont.current) return;
    const W = cont.current.clientWidth || 300, H = alto;
    let engine, render, runner, tapHandler;
    try {
      const { Engine, Render, Runner, World, Bodies, Body, Composite, Events, Mouse, MouseConstraint } = Matter;
      engine = Engine.create();
      render = Render.create({
        element: cont.current,
        engine,
        options: { width: W, height: H, wireframes: false, background: fondo || "#FFFDF6", pixelRatio: window.devicePixelRatio || 1 },
      });
      runner = Runner.create();
      // paredes invisibles (piso + laterales) para que nada se escape
      const grosor = 60;
      const paredes = [
        Bodies.rectangle(W / 2, H + grosor / 2 - 2, W + 200, grosor, { isStatic: true, render: { visible: false } }),
        Bodies.rectangle(-grosor / 2 + 2, H / 2, grosor, H + 200, { isStatic: true, render: { visible: false } }),
        Bodies.rectangle(W + grosor / 2 - 2, H / 2, grosor, H + 200, { isStatic: true, render: { visible: false } }),
      ];
      World.add(engine.world, paredes);
      const api = { engine, world: engine.world, W, H, Matter, render };
      // arrastrar con el mouse/dedo
      try {
        const mouse = Mouse.create(render.canvas);
        const mc = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } });
        World.add(engine.world, mc);
        render.mouse = mouse;
      } catch (e) {}
      if (typeof setup === "function") setup(api);
      // Tocar/clic para soltar-uno-nuevo — PERO solo si el punto está VACÍO.
      // Si el clic (mouse o dedo) cae sobre un cuerpo existente, se deja que
      // MouseConstraint lo arrastre en su lugar; si no, antes cada clic sobre
      // una pelota para arrastrarla también soltaba una duplicada encima.
      if (typeof onTap === "function") {
        tapHandler = (ev) => {
          const rect = render.canvas.getBoundingClientRect();
          const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
          const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
          const px = cx * (W / rect.width), py = cy * (H / rect.height);
          try {
            const { Query, Composite } = Matter;
            const hit = Query.point(Composite.allBodies(engine.world).filter((b) => !b.isStatic), { x: px, y: py });
            if (hit && hit.length) return; // había algo ahí: que lo arrastre, no soltar encima
          } catch (e) {}
          onTap(api, px, py);
        };
        render.canvas.addEventListener("pointerdown", tapHandler);
      }
      Render.run(render);
      Runner.run(runner, engine);
      refs.current = { engine, render, runner, tapHandler };
      if (typeof onApi === "function") onApi(api);
    } catch (e) { /* si algo falla, el panel simplemente no anima */ }
    return () => {
      try {
        const { Render, Runner, World, Engine } = Matter;
        if (refs.current.render) { if (refs.current.tapHandler) refs.current.render.canvas.removeEventListener("pointerdown", refs.current.tapHandler); Render.stop(refs.current.render); if (refs.current.render.canvas && refs.current.render.canvas.parentNode) refs.current.render.canvas.parentNode.removeChild(refs.current.render.canvas); refs.current.render.textures = {}; }
        if (refs.current.runner) Runner.stop(refs.current.runner);
        if (refs.current.engine) { World.clear(refs.current.engine.world, false); Engine.clear(refs.current.engine); }
      } catch (e) {}
      refs.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  if (!Matter || PREFIERE_ESTATICO) return null;
  return <div ref={cont} style={{ width: "100%", height: alto, borderRadius: 10, overflow: "hidden", border: `1.5px solid ${CI.ink}`, background: CI.papel2, touchAction: "none" }} />;
}

// Botón + panel plegable de simulador, para colgar la física BAJO el SVG de un
// interactivo sin quitar nada de lo que ya existe.
function PanelSimulador({ titulo = "🎮 Simulador (arrástralo / lánzalo)", children, nota }) {
  const [abierto, setAbierto] = useState(false);
  if (!Matter || PREFIERE_ESTATICO) return null; // sin Matter, no se ofrece
  return (
    <div style={{ marginTop: 12 }}>
      {!abierto ? (
        <button className="tab" style={{ width: "100%", padding: "9px 0", fontSize: 12.5 }} onClick={() => setAbierto(true)}>{titulo}</button>
      ) : (
        <div style={{ background: CI.papel2, border: `1.5px solid ${CI.azul}`, borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.azul, textTransform: "uppercase" }}>Simulador de física</span>
            <button className="tab" style={{ flex: "none", padding: "3px 9px", fontSize: 11 }} onClick={() => setAbierto(false)}>Cerrar</button>
          </div>
          {children}
          {nota && <p style={{ fontSize: 12, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>{nota}</p>}
        </div>
      )}
    </div>
  );
}

// ---------------------------- NÚCLEO DE CÁLCULO (parser propio, sin dependencias)
// ============================================================================
// NÚCLEO DE CÁLCULO — parser + evaluador de expresiones matemáticas.
// Sin dependencias externas (nada de mathjs): más ligero, y evita usar eval()
// sobre texto escrito por el usuario (riesgo de seguridad innecesario).
// Soporta: + - * / ^ % paréntesis, unario -, funciones trig/log/raíz,
// constantes pi/e, y una variable libre "x" (para el graficador).
// ============================================================================

class MathError extends Error {}

// ---- Tokenizer ----
function tokenize(src) {
  const s = src.replace(/\s+/g, "").replace(/π/g, "pi").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  const tokens = [];
  let i = 0;
  const isDigit = (c) => c >= "0" && c <= "9";
  const isAlpha = (c) => /[a-zA-Z_]/.test(c);
  while (i < s.length) {
    const c = s[i];
    if (isDigit(c) || (c === "." && isDigit(s[i + 1]))) {
      let j = i;
      while (j < s.length && (isDigit(s[j]) || s[j] === ".")) j++;
      tokens.push({ t: "num", v: parseFloat(s.slice(i, j)) });
      i = j;
    } else if (isAlpha(c)) {
      let j = i;
      while (j < s.length && isAlpha(s[j])) j++;
      tokens.push({ t: "id", v: s.slice(i, j) });
      i = j;
    } else if ("+-*/^(),%".includes(c)) {
      tokens.push({ t: c });
      i++;
    } else {
      throw new MathError(`Carácter no reconocido: "${c}"`);
    }
  }
  return tokens;
}

// ---- Parser recursivo (precedencia: + - < * / < ^ < unario < función/paréntesis) ----
function parseExpr(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (t) => { if (!peek() || peek().t !== t) throw new MathError(`Se esperaba "${t}"`); return next(); };

  function parseAdd() {
    let node = parseMul();
    while (peek() && (peek().t === "+" || peek().t === "-")) {
      const op = next().t;
      node = { type: "bin", op, l: node, r: parseMul() };
    }
    return node;
  }
  function parseMul() {
    let node = parsePow();
    while (peek() && (peek().t === "*" || peek().t === "/" || peek().t === "%")) {
      const op = next().t;
      node = { type: "bin", op, l: node, r: parsePow() };
    }
    return node;
  }
  function parsePow() {
    let node = parseUnary();
    if (peek() && peek().t === "^") {
      next();
      const r = parsePow(); // asociatividad derecha
      node = { type: "bin", op: "^", l: node, r };
    }
    return node;
  }
  function parseUnary() {
    if (peek() && peek().t === "-") { next(); return { type: "neg", v: parseUnary() }; }
    if (peek() && peek().t === "+") { next(); return parseUnary(); }
    return parseAtom();
  }
  function parseAtom() {
    const tk = peek();
    if (!tk) throw new MathError("Expresión incompleta");
    if (tk.t === "num") { next(); return { type: "num", v: tk.v }; }
    if (tk.t === "(") {
      next();
      const node = parseAdd();
      expect(")");
      return node;
    }
    if (tk.t === "id") {
      next();
      const name = tk.v.toLowerCase();
      if (peek() && peek().t === "(") {
        next();
        const args = [parseAdd()];
        while (peek() && peek().t === ",") { next(); args.push(parseAdd()); }
        expect(")");
        return { type: "call", name, args };
      }
      return { type: "id", name };
    }
    throw new MathError(`Token inesperado: "${tk.t}"`);
  }

  const result = parseAdd();
  if (pos < tokens.length) throw new MathError("Expresión mal formada (sobran caracteres)");
  return result;
}

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: (x) => { if (x < 0) throw new MathError("Raíz de negativo"); return Math.sqrt(x); },
  abs: Math.abs,
  log: Math.log10, ln: Math.log,
  exp: Math.exp,
  round: Math.round, floor: Math.floor, ceil: Math.ceil,
};
const CONSTS = { pi: Math.PI, e: Math.E };

function evalNode(node, scope) {
  switch (node.type) {
    case "num": return node.v;
    case "neg": return -evalNode(node.v, scope);
    case "id": {
      const nm = node.name;
      if (nm in CONSTS) return CONSTS[nm];
      if (scope && nm in scope) return scope[nm];
      throw new MathError(`Variable no definida: "${nm}"`);
    }
    case "call": {
      const fn = FUNCS[node.name];
      if (!fn) throw new MathError(`Función no reconocida: "${node.name}"`);
      const args = node.args.map((a) => evalNode(a, scope));
      return fn(...args);
    }
    case "bin": {
      const l = evalNode(node.l, scope), r = evalNode(node.r, scope);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": if (r === 0) throw new MathError("División entre cero"); return l / r;
        case "%": if (r === 0) throw new MathError("Módulo entre cero"); return l % r;
        case "^": return Math.pow(l, r);
        default: throw new MathError(`Operador no reconocido: "${node.op}"`);
      }
    }
    default: throw new MathError("Nodo no reconocido");
  }
}

// API pública: evalúa una expresión de texto, opcionalmente con variables (ej. {x: 3})
function evaluarExpresion(texto, scope) {
  if (!texto || !texto.trim()) throw new MathError("Expresión vacía");
  const tokens = tokenize(texto);
  const ast = parseExpr(tokens);
  const v = evalNode(ast, scope);
  if (typeof v !== "number" || Number.isNaN(v)) throw new MathError("Resultado indefinido (NaN)");
  if (!Number.isFinite(v)) throw new MathError("Resultado infinito");
  return v;
}

// Derivada numérica por diferencia central (para el graficador y PM V)
function derivadaNumerica(texto, x0, h = 0.0001) {
  const f = (x) => evaluarExpresion(texto, { x });
  return (f(x0 + h) - f(x0 - h)) / (2 * h);
}

// Genera puntos (x,y) de una expresión en un rango, para graficar.
// Omite puntos donde la evaluación falla (asíntotas, dominios restringidos).
function muestrearFuncion(texto, xmin, xmax, pasos = 200) {
  const pts = [];
  const paso = (xmax - xmin) / pasos;
  for (let i = 0; i <= pasos; i++) {
    const x = xmin + i * paso;
    try {
      const y = evaluarExpresion(texto, { x });
      pts.push({ x, y });
    } catch (e) { /* punto fuera de dominio, se omite */ }
  }
  return pts;
}

// ============================================================================
// MOTOR DE PASOS (Fases 1-4) — 10 familias, con TÍTULO por paso y doble
// resaltado: ROJO = lo que se opera / lo que sigue, DORADO = resultado nuevo.
// ============================================================================
// ============================================================================
// MOTOR DE PASOS (Fases 1-2) — genera el desglose de un problema tecleado,
// sobre el núcleo de cálculo (parser propio, sin CAS). 9 familias.
// ============================================================================

// ---- Multiplicación implícita: 2x → 2*x, 2(3+1) → 2*(3+1) ----
function normImplicito(s) {
  return s.replace(/(\d)\s*([a-zA-Z(])/g, "$1*$2").replace(/(\))\s*([a-zA-Z0-9(])/g, "$1*$2");
}
function numStr(x) {
  if (Object.is(x, -0)) x = 0;
  if (Number.isInteger(x)) return String(x);
  const r = Math.round(x * 10000) / 10000;
  return String(r);
}
function dispNum(x) { return numStr(x).replace("-", "−"); }
function restaBonita(a, b) { return b < 0 ? `${dispNum(a)} + ${dispNum(Math.abs(b))}` : `${dispNum(a)} − ${dispNum(b)}`; }

// ---- Render AST → texto ----
const PREC = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 3, "^": 4 };
const SIGNO = { "+": "+", "-": "−", "*": "×", "/": "÷", "%": "mód", "^": "^" };
function astToStr(node, parentPrec = 0, side = "l") {
  switch (node.type) {
    case "num": return numStr(node.v);
    case "id": return node.name;
    case "neg": return "−" + astToStr(node.v, 4);
    case "call": return node.name + "(" + node.args.map((a) => astToStr(a, 0)).join(", ") + ")";
    case "bin": {
      const p = PREC[node.op];
      const l = astToStr(node.l, p, "l");
      const rExtra = (node.op === "-" || node.op === "/" || node.op === "%");
      const r = astToStr(node.r, rExtra ? p + 0.5 : p, "r");
      let s = `${l} ${SIGNO[node.op]} ${r}`;
      if (p < parentPrec || (p === parentPrec && side === "r")) s = `(${s})`;
      return s;
    }
    default: return "?";
  }
}
function esNumerico(n) { return n.type === "num" || (n.type === "neg" && n.v.type === "num"); }
function valorDe(n) { return n.type === "neg" ? -n.v.v : n.v; }
function buscarReducible(node) {
  if (node.type === "bin") {
    const izq = buscarReducible(node.l); if (izq) return izq;
    const der = buscarReducible(node.r); if (der) return der;
    if (esNumerico(node.l) && esNumerico(node.r)) return { node };
  } else if (node.type === "neg") {
    const d = buscarReducible(node.v); if (d) return d;
  } else if (node.type === "call") {
    for (const a of node.args) { const r = buscarReducible(a); if (r) return r; }
    if (node.args.every(esNumerico)) return { node };
  }
  return null;
}
const NOMBRE_OP = { "+": "la suma", "-": "la resta", "*": "la multiplicación", "/": "la división", "%": "el módulo", "^": "la potencia" };

// ============================ 1) JERARQUÍA ============================
function resolverJerarquia(expr) {
  let ast;
  try { ast = parseExpr(tokenize(normImplicito(expr))); }
  catch (e) { return { ok: false, error: "No pude leer la expresión. Revisa paréntesis y operadores." }; }
  const tieneVar = (n) => n.type === "id" ? true : n.type === "bin" ? (tieneVar(n.l) || tieneVar(n.r)) : n.type === "neg" ? tieneVar(n.v) : n.type === "call" ? n.args.some(tieneVar) : false;
  if (tieneVar(ast)) return { ok: false, error: "Esta herramienta es para operaciones numéricas (sin variables). Para ecuaciones usa \"Ecuación lineal\"." };
  const nomTit = { "+": "Resolver la suma", "-": "Resolver la resta", "*": "Resolver la multiplicación", "/": "Resolver la división", "%": "Resolver el módulo", "^": "Resolver la potencia" };
  const strReducible = (nn) => nn.type === "call" ? astToStr(nn) : `${dispNum(valorDe(nn.l))} ${SIGNO[nn.op]} ${dispNum(valorDe(nn.r))}`;
  const prox0 = buscarReducible(ast);
  const pasos = [{ linea: astToStr(ast), titulo: "Expresión original", nota: prox0 ? `Lo primero que toca resolver (por jerarquía) va marcado en rojo.` : "Expresión original.", rojo: prox0 ? strReducible(prox0.node) : undefined }];
  let guard = 0;
  while (!esNumerico(ast) && guard++ < 60) {
    const ref = buscarReducible(ast); if (!ref) break;
    const n = ref.node; let val, desc, tit;
    try {
      if (n.type === "call") { val = evaluarExpresion(astToStr(n)); tit = `Evaluar ${n.name}`; desc = `Evalúo ${n.name}(${n.args.map((a) => dispNum(valorDe(a))).join(", ")}) = ${dispNum(val)}.`; }
      else { const a = valorDe(n.l), b = valorDe(n.r); val = evaluarExpresion(`${a} ${n.op} ${b}`); tit = nomTit[n.op]; desc = `Resuelvo ${NOMBRE_OP[n.op]}: ${dispNum(a)} ${SIGNO[n.op]} ${dispNum(b)} = ${dispNum(val)}.`; }
    } catch (e) { return { ok: false, error: e.message || "Error al evaluar un paso." }; }
    n.type = "num"; n.v = val; delete n.l; delete n.r; delete n.name; delete n.args;
    const prox = buscarReducible(ast);
    pasos.push({ linea: astToStr(ast), titulo: tit, nota: desc + (prox ? " En rojo, lo que sigue." : ""), resalta: dispNum(val), rojo: prox ? strReducible(prox.node) : undefined });
  }
  pasos[pasos.length - 1].titulo = "Resultado final";
  pasos[pasos.length - 1].nota = "Resultado final.";
  return { ok: true, visual: "none", pasos, resumen: `Resultado: ${dispNum(valorDe(ast))}` };
}

// ============================ 2) LINEAL ============================
function coefLineal(texto) {
  const f0 = evaluarExpresion(texto, { x: 0 }), f1 = evaluarExpresion(texto, { x: 1 }), f2 = evaluarExpresion(texto, { x: 2 });
  const a = f1 - f0, b = f0;
  if (Math.abs((f2 - f0) - 2 * a) > 1e-9) throw new MathError("no lineal");
  return { a, b };
}
function termX(a, v = "x") { if (a === 1) return v; if (a === -1) return "−" + v; return dispNum(a) + v; }
function ladoLineal(a, b) { if (a === 0) return dispNum(b); let s = termX(a); if (b > 0) s += " + " + dispNum(b); else if (b < 0) s += " − " + dispNum(Math.abs(b)); return s; }
function resolverLineal(entrada) {
  if (!entrada.includes("=")) return { ok: false, error: "Escribe una ecuación con un signo = (por ejemplo 2x + 3 = 11)." };
  const partes = entrada.split("="); if (partes.length !== 2) return { ok: false, error: "Debe haber exactamente un signo =." };
  const pIzq = normImplicito(partes[0]), pDer = normImplicito(partes[1]); let L, R;
  try { L = coefLineal(pIzq); R = coefLineal(pDer); } catch (e) { return { ok: false, error: "No pude leerla como ecuación lineal (grado 1 en x). Debe ser de la forma ax + b = cx + d." }; }
  const pasos = []; const eq = (a, b, c, d, nota, resalta) => pasos.push({ linea: `${ladoLineal(a, b)} = ${ladoLineal(c, d)}`, izq: ladoLineal(a, b), der: ladoLineal(c, d), nota, resalta });
  eq(L.a, L.b, R.a, R.b, "Ecuación original.", undefined); pasos[0].titulo = "Ecuación original"; if (R.a !== 0) pasos[0].rojo = termX(R.a); else if (L.b !== 0) pasos[0].rojo = dispNum(Math.abs(L.b));
  if (L.a === R.a) {
    if (L.b === R.b) return { ok: true, visual: "balanza", pasos: [...pasos, { linea: `${ladoLineal(L.a, L.b)} = ${ladoLineal(R.a, R.b)}`, izq: ladoLineal(L.a, L.b), der: ladoLineal(R.a, R.b), titulo: "Analizar la igualdad", nota: "Ambos lados son idénticos: cualquier valor de x cumple. Infinitas soluciones." }], resumen: "Infinitas soluciones" };
    return { ok: true, visual: "balanza", pasos: [...pasos, { linea: `${dispNum(L.b)} = ${dispNum(R.b)}`, izq: dispNum(L.b), der: dispNum(R.b), titulo: "Analizar la igualdad", nota: "Los términos con x se cancelan y queda una igualdad falsa: no hay solución." }], resumen: "Sin solución" };
  }
  const a1 = L.a - R.a; eq(a1, L.b, 0, R.b, `Junto los términos con x en la izquierda: ${termX(L.a)} y ${termX(-R.a)} dan ${termX(a1)}.`, termX(a1));
  pasos[pasos.length - 1].titulo = "Juntar los términos con x"; if (L.b !== 0) pasos[pasos.length - 1].rojo = dispNum(Math.abs(L.b));
  const d2 = R.b - L.b; eq(a1, 0, 0, d2, `Junto las constantes en la derecha: ${restaBonita(R.b, L.b)} = ${dispNum(d2)}.`, dispNum(d2));
  pasos[pasos.length - 1].titulo = "Juntar las constantes"; pasos[pasos.length - 1].rojo = termX(a1).replace("x", "");
  const sol = d2 / a1; pasos.push({ linea: `x = ${dispNum(sol)}`, izq: "x", der: dispNum(sol), titulo: "Despejar x (dividir)", nota: `Divido ambos lados entre ${dispNum(a1)}: x = ${dispNum(d2)} ÷ ${dispNum(a1)} = ${dispNum(sol)}.`, resalta: dispNum(sol) });
  const ci = evaluarExpresion(pIzq, { x: sol }), cd = evaluarExpresion(pDer, { x: sol });
  pasos.push({ linea: `${dispNum(ci)} = ${dispNum(cd)}`, izq: dispNum(ci), der: dispNum(cd), titulo: "Comprobar la solución", nota: `Compruebo sustituyendo x = ${dispNum(sol)}: ambos lados dan ${dispNum(ci)}. ✓` });
  return { ok: true, visual: "balanza", pasos, resumen: `Solución: x = ${dispNum(sol)}`, sol };
}

// ============================ 3) REGLA DE TRES ============================
function parseNumeros(entrada, n) {
  const partes = entrada.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  if (partes.length !== n) throw new MathError(`Se esperaban ${n} números`);
  return partes.map((p) => { const asNum = Number(p); if (p !== "" && !Number.isNaN(asNum)) return asNum; return evaluarExpresion(normImplicito(p)); });
}
function resolverReglaTres(entrada) {
  let A, B, C;
  try { [A, B, C] = parseNumeros(entrada, 3); } catch (e) { return { ok: false, error: "Escribe tres números separados por coma. Si A da B, ¿cuánto da C? Ejemplo: 3, 12, 5." }; }
  if (A === 0) return { ok: false, error: "El primer número (A) no puede ser 0." };
  const x = (B * C) / A;
  const pasos = [
    { linea: `${dispNum(A)} → ${dispNum(B)}\n${dispNum(C)} → x`, A, B, C, x: "x", titulo: "Plantear la proporción", nota: "Planteo la proporción: si A corresponde a B, entonces C corresponde a x (regla de tres directa)." },
    { linea: `${dispNum(A)} · x = ${dispNum(B)} · ${dispNum(C)}`, A, B, C, x: "x", titulo: "Multiplicar en cruz", nota: "Multiplico en cruz: A por x es igual a B por C.", resalta: `${dispNum(B)} · ${dispNum(C)}` },
    { linea: `x = (${dispNum(B)} · ${dispNum(C)}) ÷ ${dispNum(A)}`, A, B, C, x: "x", titulo: "Despejar x", nota: `Despejo x dividiendo entre A: x = ${dispNum(B * C)} ÷ ${dispNum(A)}.`, rojo: `÷ ${dispNum(A)}` },
    { linea: `x = ${dispNum(x)}`, A, B, C, x: dispNum(x), titulo: "Resultado", nota: "Resultado.", resalta: dispNum(x) },
  ];
  return { ok: true, visual: "proporcion", pasos, resumen: `x = ${dispNum(x)}`, sol: x };
}

// ============================ 4) SISTEMA 2×2 ============================
function coefBivar(texto) {
  const f00 = evaluarExpresion(texto, { x: 0, y: 0 });
  const fx = evaluarExpresion(texto, { x: 1, y: 0 }) - f00;
  const fy = evaluarExpresion(texto, { x: 0, y: 1 }) - f00;
  // verificar linealidad
  const chk = evaluarExpresion(texto, { x: 2, y: 3 });
  if (Math.abs(chk - (2 * fx + 3 * fy + f00)) > 1e-9) throw new MathError("no lineal");
  return { ax: fx, ay: fy, k: f00 };
}
function ecStr(ax, ay, d) {
  let t = [];
  if (ax !== 0) t.push(termX(ax, "x"));
  if (ay !== 0) t.push((ay > 0 && t.length ? "+ " : "") + termX(ay, "y").replace("−", t.length ? "− " : "−"));
  let izq = t.join(" ").replace("+ −", "− ") || "0";
  // recomponer de forma limpia
  izq = (ax !== 0 ? termX(ax, "x") : "") + (ay !== 0 ? (ay > 0 ? " + " + termX(ay, "y") : " − " + termX(Math.abs(ay), "y")) : "");
  if (ax === 0) izq = termX(ay, "y");
  return `${izq.trim()} = ${dispNum(d)}`;
}
function resolverSistema(entrada) {
  const parts = entrada.split(";").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return { ok: false, error: "Escribe DOS ecuaciones separadas por punto y coma. Ejemplo: x + y = 5 ; x − y = 1." };
  const eqs = [];
  for (const p of parts) {
    if (!p.includes("=")) return { ok: false, error: "Cada ecuación necesita un signo =." };
    const [l, r] = p.split("=");
    try {
      const cl = coefBivar(normImplicito(l)), cr = coefBivar(normImplicito(r));
      eqs.push({ ax: cl.ax - cr.ax, ay: cl.ay - cr.ay, d: cr.k - cl.k, lRaw: normImplicito(l), rRaw: normImplicito(r) });
    } catch (e) { return { ok: false, error: "No pude leerlas como sistema lineal en x, y. Revisa el formato (ax + by = c)." }; }
  }
  const [e1, e2] = eqs;
  const D = e1.ax * e2.ay - e2.ax * e1.ay;
  if (Math.abs(D) < 1e-12) return { ok: true, visual: "none", pasos: [{ linea: `${ecStr(e1.ax, e1.ay, e1.d)}\n${ecStr(e2.ax, e2.ay, e2.d)}`, titulo: "Analizar el sistema", nota: "El determinante es 0: las rectas son paralelas o coincidentes — no hay una única solución." }], resumen: "Sin solución única" };
  const x = (e1.d * e2.ay - e2.d * e1.ay) / D;
  const y = (e1.ax * e2.d - e2.ax * e1.d) / D;
  // despeje de x en ec1 (o ec2 si ax1=0)
  const base = e1.ax !== 0 ? e1 : e2, otra = e1.ax !== 0 ? e2 : e1;
  const pasos = [];
  const sisLinea = `${ecStr(e1.ax, e1.ay, e1.d)}\n${ecStr(e2.ax, e2.ay, e2.d)}`;
  pasos.push({ linea: sisLinea, x, y, e1, e2, titulo: "Sistema original", nota: "Sistema original: dos ecuaciones, dos incógnitas." });
  pasos.push({ linea: `x = (${dispNum(base.d)} − ${termX(base.ay, "y")}) ÷ ${dispNum(base.ax)}`, x, y, e1, e2, titulo: "Despejar x en una ecuación", nota: "Despejo x de la primera ecuación para sustituirla en la otra." });
  pasos.push({ linea: `y = ${dispNum(y)}`, x, y, e1, e2, titulo: "Sustituir y resolver para y", nota: "Sustituyo y resuelvo: al eliminar x queda una ecuación con una sola incógnita, y.", resalta: dispNum(y) });
  pasos.push({ linea: `x = ${dispNum(x)}`, x, y, e1, e2, titulo: "Regresar para hallar x", nota: `Regreso el valor de y para hallar x = ${dispNum(x)}.`, resalta: dispNum(x) });
  // comprobación en ec1
  const cc = e1.ax * x + e1.ay * y;
  pasos.push({ linea: `(${dispNum(x)}, ${dispNum(y)})`, x, y, e1, e2, titulo: "Comprobar", nota: `Compruebo en la primera ecuación: ${dispNum(cc)} = ${dispNum(e1.d)}. ✓` });
  return { ok: true, visual: "sistema", pasos, resumen: `Solución: x = ${dispNum(x)}, y = ${dispNum(y)}`, sol: { x, y } };
}

// ============================ 5) CUADRÁTICA ============================
function resolverCuadratica(entrada) {
  let texto = entrada.includes("=") ? (() => { const [l, r] = entrada.split("="); return `(${l}) - (${r})`; })() : entrada;
  texto = normImplicito(texto);
  let a, b, c;
  try {
    const f0 = evaluarExpresion(texto, { x: 0 }), f1 = evaluarExpresion(texto, { x: 1 }), fm1 = evaluarExpresion(texto, { x: -1 }), f2 = evaluarExpresion(texto, { x: 2 });
    c = f0; a = (f1 + fm1) / 2 - c; b = (f1 - fm1) / 2;
    if (Math.abs(a) < 1e-12) throw new MathError("no cuadrática");
    if (Math.abs((a * 4 + b * 2 + c) - f2) > 1e-9) throw new MathError("no cuadrática");
  } catch (e) { return { ok: false, error: "No pude leerla como cuadrática (grado 2 en x). Ejemplo: x^2 - 5x + 6 = 0." }; }
  const disc = b * b - 4 * a * c;
  const pasos = [
    { linea: `${termX(a, "x²")} ${b >= 0 ? "+ " + termX(b, "x") : "− " + termX(Math.abs(b), "x")} ${c >= 0 ? "+ " + dispNum(c) : "− " + dispNum(Math.abs(c))} = 0`, a, b, c, disc, titulo: "Identificar el tipo y los coeficientes", nota: `Identifico los coeficientes: a = ${dispNum(a)}, b = ${dispNum(b)}, c = ${dispNum(c)}.`, resalta: "= 0" },
    { linea: `Δ = ${b<0?`(${dispNum(b)})`:dispNum(b)}² − 4·${a<0?`(${dispNum(a)})`:dispNum(a)}·${c<0?`(${dispNum(c)})`:dispNum(c)}`, a, b, c, disc, titulo: "Calcular el discriminante", nota: "Calculo el discriminante Δ = b² − 4ac. Su signo dice cuántas soluciones reales hay." },
    { linea: `Δ = ${dispNum(disc)}`, a, b, c, disc, titulo: "Leer el signo de Δ", nota: disc > 0 ? "Δ > 0: hay dos soluciones reales distintas." : disc === 0 ? "Δ = 0: hay una sola solución real (raíz doble)." : "Δ < 0: no hay soluciones reales (las raíces son complejas).", resalta: dispNum(disc) },
  ];
  if (disc < 0) return { ok: true, visual: "parabola", pasos, resumen: "Sin raíces reales", a, b, c, disc };
  const r = Math.sqrt(disc);
  const x1 = (-b + r) / (2 * a), x2 = (-b - r) / (2 * a);
  pasos.push({ linea: `x = (${dispNum(-b)} ± √${dispNum(disc)}) ÷ ${dispNum(2 * a)}`, a, b, c, disc, x1, x2, titulo: "Aplicar la fórmula general", nota: "Aplico la fórmula general x = (−b ± √Δ) / (2a).", rojo: `√${dispNum(disc)}` });
  if (disc === 0) pasos.push({ linea: `x = ${dispNum(x1)}`, a, b, c, disc, x1, x2, titulo: "Solución (raíz doble)", nota: "Raíz doble.", resalta: dispNum(x1) });
  else pasos.push({ linea: `x₁ = ${dispNum(x1)},  x₂ = ${dispNum(x2)}`, a, b, c, disc, x1, x2, titulo: "Las dos soluciones", nota: "Las dos soluciones.", resalta: dispNum(x1) });
  return { ok: true, visual: "parabola", pasos, resumen: disc === 0 ? `x = ${dispNum(x1)}` : `x₁ = ${dispNum(x1)}, x₂ = ${dispNum(x2)}`, a, b, c, disc, x1, x2 };
}

// ============================ 6-9) CNEyT CUANTITATIVO ============================
function resolverDensidad(entrada) {
  let m, V; try { [m, V] = parseNumeros(entrada, 2); } catch (e) { return { ok: false, error: "Escribe masa y volumen separados por coma. Ejemplo: 240, 30 (masa en g, volumen en cm³)." }; }
  if (V === 0) return { ok: false, error: "El volumen no puede ser 0." };
  const rho = m / V;
  const pasos = [
    { linea: "ρ = m / V", titulo: "Escribir la fórmula", nota: "La densidad es la masa dividida entre el volumen que ocupa." },
    { linea: `ρ = ${dispNum(m)} g ÷ ${dispNum(V)} cm³`, titulo: "Sustituir los datos", nota: "Sustituyo los datos (masa en gramos, volumen en cm³).", resalta: `${dispNum(m)} g ÷ ${dispNum(V)} cm³` },
    { linea: `ρ = ${dispNum(rho)} g/cm³`, titulo: "Calcular e interpretar", nota: `Resultado: ${dispNum(rho)} g/cm³. ${rho > 1 ? "Mayor que el agua (1 g/cm³): se hunde." : rho < 1 ? "Menor que el agua: flota." : "Igual que el agua."}`, resalta: `${dispNum(rho)} g/cm³` },
  ];
  return { ok: true, visual: "none", pasos, resumen: `ρ = ${dispNum(rho)} g/cm³`, sol: rho };
}
function resolverPH(entrada) {
  let h; try { [h] = parseNumeros(entrada, 1); } catch (e) { return { ok: false, error: "Escribe la concentración de iones H⁺ en mol/L. Ejemplo: 0.001 (o 1e-3)." }; }
  if (h <= 0) return { ok: false, error: "La concentración debe ser un número positivo." };
  const pH = -Math.log10(h);
  const clase = pH < 7 ? "ácida" : pH > 7 ? "básica (alcalina)" : "neutra";
  const pasos = [
    { linea: "pH = −log₁₀[H⁺]", titulo: "Escribir la fórmula", nota: "El pH es el logaritmo negativo de la concentración de iones hidrógeno." },
    { linea: `pH = −log₁₀(${entrada.trim()})`, titulo: "Sustituir la concentración", nota: "Sustituyo la concentración de H⁺ (en mol/L).", resalta: entrada.trim() },
    { linea: `pH = ${dispNum(pH)}`, pH, titulo: "Calcular e interpretar", nota: `Resultado: pH = ${dispNum(pH)} → disolución ${clase}.`, resalta: dispNum(pH) },
  ];
  return { ok: true, visual: "phscale", pasos, resumen: `pH = ${dispNum(pH)} (${clase})`, pH, sol: pH };
}
function resolverOhm(entrada) {
  let I, R; try { [I, R] = parseNumeros(entrada, 2); } catch (e) { return { ok: false, error: "Escribe corriente y resistencia separadas por coma. Ejemplo: 2, 5 (corriente en A, resistencia en Ω)." }; }
  const Vv = I * R;
  const pasos = [
    { linea: "V = I · R", titulo: "Escribir la ley de Ohm", nota: "Ley de Ohm: el voltaje es el producto de la corriente por la resistencia." },
    { linea: `V = ${dispNum(I)} A · ${dispNum(R)} Ω`, titulo: "Sustituir los datos", nota: "Sustituyo los datos.", resalta: `${dispNum(I)} A · ${dispNum(R)} Ω` },
    { linea: `V = ${dispNum(Vv)} V`, titulo: "Calcular", nota: `Resultado: ${dispNum(Vv)} volts.`, resalta: `${dispNum(Vv)} V` },
  ];
  return { ok: true, visual: "none", pasos, resumen: `V = ${dispNum(Vv)} V`, sol: Vv };
}
function resolverCinetica(entrada) {
  let m, v; try { [m, v] = parseNumeros(entrada, 2); } catch (e) { return { ok: false, error: "Escribe masa y velocidad separadas por coma. Ejemplo: 4, 3 (masa en kg, velocidad en m/s)." }; }
  const v2 = v * v, Ec = 0.5 * m * v2;
  const pasos = [
    { linea: "Ec = ½ · m · v²", titulo: "Escribir la fórmula", nota: "La energía cinética depende de la masa y del CUADRADO de la velocidad." },
    { linea: `Ec = ½ · ${dispNum(m)} · ${dispNum(v)}²`, titulo: "Sustituir los datos", nota: "Sustituyo masa (kg) y velocidad (m/s).", rojo: `${dispNum(v)}²` },
    { linea: `Ec = ½ · ${dispNum(m)} · ${dispNum(v2)}`, titulo: "Elevar la velocidad al cuadrado", nota: `Primero elevo la velocidad al cuadrado: ${dispNum(v)}² = ${dispNum(v2)}.`, resalta: dispNum(v2) },
    { linea: `Ec = ${dispNum(Ec)} J`, titulo: "Calcular", nota: `Resultado: ${dispNum(Ec)} joules. Al duplicar la velocidad, la energía se cuadruplica (por el cuadrado).`, resalta: `${dispNum(Ec)} J` },
  ];
  return { ok: true, visual: "none", pasos, resumen: `Ec = ${dispNum(Ec)} J`, sol: Ec };
}

// ============================ 10) DERIVADA (regla de la potencia) ============================
// f(x) = k·x^n → f'(x) = k·n·x^(n−1). Paramétrico puro, sin CAS. Cubre PM V · PF6.
function resolverDerivadaPotencia(entrada) {
  const s = entrada.replace(/\s+/g, "").replace(/−/g, "-");
  const m = s.match(/^(?:f\(x\)=)?(-?\d*\.?\d*)\*?x(?:\^|\*\*)?(-?\d+)?$/i);
  if (!m) return { ok: false, error: "Escribe una potencia de x, por ejemplo: 5x^3 (también vale x^2 o 7x)." };
  let k = m[1] === "" || m[1] === "-" ? (m[1] === "-" ? -1 : 1) : parseFloat(m[1]);
  let n = m[2] === undefined ? 1 : parseInt(m[2]);
  const kn = k * n, n1 = n - 1;
  const xPow = (p) => p === 0 ? "" : p === 1 ? "x" : `x^${dispNum(p)}`;
  const fStr = `${k === 1 ? "" : k === -1 ? "−" : dispNum(k)}${xPow(n) || "1"}`;
  const pasos = [
    { linea: `f(x) = ${fStr}`, titulo: "Identificar k y n", nota: `La función es una potencia: coeficiente k = ${dispNum(k)}, exponente n = ${dispNum(n)}.`, rojo: n === 1 ? undefined : `^${dispNum(n)}` },
    { linea: `f′(x) = k · n · x^(n−1)`, titulo: "Escribir la regla de la potencia", nota: "El exponente baja multiplicando y el nuevo exponente es n − 1." },
    { linea: `f′(x) = ${dispNum(k)} · ${dispNum(n)} · x^(${dispNum(n)}−1)`, titulo: "Sustituir k y n", nota: `Sustituyo k = ${dispNum(k)} y n = ${dispNum(n)}.`, rojo: `${dispNum(n)} · ` },
    { linea: `f′(x) = ${dispNum(kn)}${xPow(n1) ? " " + xPow(n1) : ""}` , titulo: "Simplificar", nota: `Multiplico ${dispNum(k)} × ${dispNum(n)} = ${dispNum(kn)}${n1 === 0 ? " (x⁰ = 1, queda constante)" : ""}.`, resalta: dispNum(kn) },
  ];
  return { ok: true, visual: "none", pasos, resumen: `f′(x) = ${dispNum(kn)}${xPow(n1) ? " " + xPow(n1) : ""}` };
}


// ============================================================================
// DESGLOSE INLINE EN EJERCICIOS (Fases 3-4) — cobertura PM I-VI completa en
// los propósitos operables. El botón se decide POR PREGUNTA: si la variante
// generada no es extraíble, el extractor devuelve null y no aparece nada.
// ============================================================================
// DESGLOSE_MAP v2 — extractores por (materia:código), cubriendo PM I-VI.
// Cada extractor devuelve la ENTRADA para el motor, o null si la variante de
// pregunta no es desglosable (los generadores mezclan variantes; el botón solo
// aparece cuando el extractor + motor devuelven un desglose válido).
const supMap = { "²": "^2", "³": "^3", "⁴": "^4" };
function normSup(t) { return t.replace(/[²³⁴]/g, (s) => supMap[s]).replace(/√(\d+(?:\.\d+)?)/g, "sqrt($1)"); }
const num = "-?\\d+(?:\\.\\d+)?";

const DESGLOSE_MAP = {
  // ===== PM I =====
  "pm1:PF3": { tipo: "jerarquia", extraer: (t) => t.startsWith("Calcula:") ? t.replace(/^[^:]*:\s*/, "") : null },
  "pm1:PF5": { tipo: "jerarquia", extraer: (t) => t.startsWith("Calcula:") ? normSup(t.replace(/^[^:]*:\s*/, "")) : null },
  "pm1:PF6": { tipo: "jerarquia", extraer: (t) => t.startsWith("Calcula:") ? t.replace(/^[^:]*:\s*/, "") : null },
  "pm1:PF7": { tipo: "jerarquia", extraer: (t) => t.startsWith("Calcula:") ? t.replace(/^[^:]*:\s*/, "") : null },
  // ===== PM II =====
  "pm2:PF6": { tipo: "lineal", extraer: (t) => t.startsWith("Resuelve la ecuación:") ? t.replace(/^[^:]*:\s*/, "") : null },
  // ===== PM III =====
  "pm3:P1": { tipo: "lineal", extraer: (t) => t.startsWith("Resuelve:") ? t.replace(/^[^:]*:\s*/, "") : null },
  "pm3:P2": { tipo: "jerarquia", extraer: (t) => { const m = t.match(new RegExp(`y = (${num})x\\s*([+−-]\\s*${num}), ¿cuánto vale y cuando x = (${num})`)); return m ? `${m[1]}*(${m[3]}) ${m[2]}` : null; } },
  "pm3:P3": { tipo: "sistema", extraer: (t) => { const m = t.match(/sistema:\s*(.+?;.+?)(?:\.\s*¿|\s*$)/); return m ? m[1] : null; } },
  "pm3:P4": { tipo: "cuadratica", extraer: (t) => { const m = t.match(/x²[^=]*=\s*[−-]?\s*\d+/); return m ? m[0].replace(/²/g, "^2") : null; } },
  // ===== PM IV =====
  "pm4:PF1": { tipo: "jerarquia", extraer: (t) => { const m = t.match(new RegExp(`A\\(0, 0\\) y B\\((${num}), (${num})\\)`)); return m ? `sqrt((${m[1]})^2 + (${m[2]})^2)` : null; } },
  "pm4:PF3": { tipo: "jerarquia", extraer: (t) => { const m = t.match(new RegExp(`P\\(x, y\\) = x² \\+ y² en el punto \\((${num}), (${num})\\)`)); return m ? `(${m[1]})^2 + (${m[2]})^2` : null; } },
  "pm4:PF4": { tipo: "jerarquia", extraer: (t) => { const m = t.match(new RegExp(`y = (${num})x\\s*([+−-]\\s*${num}), ¿cuánto vale y cuando x = (${num})`)); return m ? `${m[1]}*(${m[3]}) ${m[2]}` : null; } },
  // ===== PM V =====
  "pm5:PF1": { tipo: "jerarquia", extraer: (t) => { const m = t.match(new RegExp(`f\\(x\\) = (${num})x².*?entre x = (${num}) y x = (${num})`)); return m ? `(${m[1]}*(${m[3]})^2 - ${m[1]}*(${m[2]})^2) / ((${m[3]}) - (${m[2]}))` : null; } },
  "pm5:PF4": { tipo: "jerarquia", extraer: (t) => { const m = t.match(new RegExp(`lím\\(x→(${num})\\) \\[(${num})x\\s*([+−-]\\s*${num})\\]`)); return m ? `${m[2]}*(${m[1]}) ${m[3]}` : null; } },
  "pm5:PF6": { tipo: "derivada", extraer: (t) => { const m = t.match(/Deriva:\s*(.+)$/); return m ? m[1] : null; } },
  // ===== PM VI =====
  "pm6:PF3": { tipo: "jerarquia", extraer: (t) => { const m = t.match(new RegExp(`A tiene (${num}) elementos, B tiene (${num}), y A∩B tiene (${num})`)); return m ? `${m[1]} + ${m[2]} - ${m[3]}` : null; } },
  "pm6:PF4": { tipo: "jerarquia", extraer: (t) => { const m = t.match(/ordenar (\d+) libros/); if (!m) return null; const n = parseInt(m[1]); return Array.from({ length: n }, (_, i) => n - i).join(" * "); } },
};
function tieneDesglose(matId, code) { return !!DESGLOSE_MAP[`${matId}:${code}`]; }
function resolverInline(matId, code, texto) {
  const m = DESGLOSE_MAP[`${matId}:${code}`];
  if (!m) return null;
  const entrada = m.extraer(texto || "");
  if (!entrada) return null;
  const prep = entrada.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  const fn = { jerarquia: resolverJerarquia, lineal: resolverLineal, cuadratica: resolverCuadratica, sistema: resolverSistema, derivada: resolverDerivadaPotencia }[m.tipo];
  try { const r = fn(prep); return r && r.ok ? r : null; } catch (e) { return null; }
}








// ============================================================================
// ENTRENAMÁTICO v26 · Pensamiento Matemático I-VI + CNEyT I-VI (MCCEMS 2025)
// Compañero digital de los 12 cuadernillos extendidos del ecosistema.
// ACTUALIZACIÓN v26 (12 jul 2026) — FASE 12: CIERRE DE CABOS SUELTOS.
// Una auditoría del código (con grep, no de memoria) encontró 3 pendientes de
// las fases de librerías gráficas; aquí se cierran los 3:
// 1) DRAW-ON DE CURVAS (trazarSVG): la función existía pero no se usaba en
//    ningún lado. Ahora las 5 curvas de los interactivos gráficos se "dibujan
//    solas" al aparecer (Parabola, RectaInteractiva, SistemaDosRectas,
//    CirculoEcuacion, AreaBajoCurva) — cada una con un useEffect de montaje que
//    llama trazarSVG sobre su <polyline>/<line>/<circle>. Solo al aparecer, no
//    en cada movimiento de slider (sería entrecortado).
// 2) PULIDO DE SLIDERS (transversal, los 81 de una vez): en vez de meter GSAP en
//    81 sliders sueltos a ciegas, se agregó UNA regla CSS compartida en el
//    bloque de estilos: thumb personalizado (verde milpa, borde papel, sombra)
//    con transición suave y crecimiento al presionar. Respeta reduced-motion.
// 3) CONFETI EN GUIADO: el modo "Practicar guiado" tenía su propia lógica de
//    respuesta y no disparaba festejar(); ahora sí lo hace al acertar el intento.
// Verificado en navegador: curvas siguen renderizando tras el draw-on, slider
// con thumb personalizado aplicado, regresión completa 9/9 + glosario 6/6 +
// gaps 4/4, 0 errores. (Las animaciones GSAP/confetti reales siguen sin poder
// probarse aquí por falta de las librerías — validación visual en el deploy.)
// Aditivo: MATERIAS, DESGLOSE_MAP, GEN_PM1 idénticos a v21. STORAGE_KEY sin
// cambios. Un solo archivo — package.json no cambia.
// ---
// v25 (12 jul 2026) — FASE 11: GLOSARIO DE SÍMBOLOS.
// Nueva 4ta pestaña en Herramientas: "📖 Glosario" (junto a Calculadora,
// Graficador, Resolvedor). Componente GlosarioSimbolos + dato GLOSARIO (uno
// por cada una de las 12 materias, 4-8 símbolos c/u, con símbolo + nombre +
// significado en una línea + mini-ejemplo). Filtrado por la materia ACTIVA
// únicamente (sin toggle "ver todos", por decisión explícita — más simple).
// Mismo patrón de datos que ATAJOS_CALC/FORMULAS_RAPIDAS (ya existían), pero
// de referencia/definición, no de cálculo — tarjetas de solo lectura.
// Verificado en navegador: pestaña visible, contenido correcto por materia
// (PM I muestra lógica/notación científica; CNEyT V muestra F=ma/Newton y NO
// mezcla símbolos de otras materias) — 6/6, más regresión completa 9/9, 0
// errores. Aditivo: MATERIAS, DESGLOSE_MAP y GEN_PM1 idénticos a v21.
// STORAGE_KEY sin cambios. Un solo archivo — package.json no cambia.
// ---
// v24 (12 jul 2026) — FASE 10: RESOLVEDOR EMBEBIDO PLEGABLE.
// Pedido: mantener minimalismo visual — "Juega con el resolvedor" (Fase 6) ya
// no aparece siempre abierto en Aprender. Nuevo componente
// PanelResolvedorEmbebido: arranca CERRADO (solo título + una línea), se abre
// al tocarlo, y se vuelve a cerrar solo al cambiar de propósito (no arrastra
// el estado abierto de un tema al siguiente). Mismo patrón visual que ya
// usábamos para "🎮 Simulador" (Fase 8), así que ahora es consistente: todo
// lo "extra" en Aprender vive plegado hasta que el alumno lo pide.
// Verificado en navegador (con stubs, igual razón de siempre — sin red en
// este entorno): cerrado por defecto, abre al clic, botón "Cerrar" colapsa de
// nuevo — 3/3, más regresión completa 9/9, 0 errores.
// Aditivo: MATERIAS y DESGLOSE_MAP idénticos a v21. STORAGE_KEY sin cambios.
// package.json NO cambia esta vez — vuelve a ser un solo archivo a reemplazar.
// ---
// v23 (12 jul 2026) — FASE 9: CORRECCIÓN MOUSE EN SIMULADORES.
// Bug real encontrado por revisión de código (no probado en vivo, sin las
// librerías instaladas en este entorno): en LienzoFisica, el manejador de
// "tocar para soltar" (pointerdown) no comprobaba si el clic caía sobre un
// cuerpo YA existente. Resultado: al dar clic con el MOUSE sobre una pelota
// para arrastrarla, el mismo clic también soltaba una pelota nueva encima —
// se sentía como que el arrastre con mouse no funcionaba bien.
// CORREGIDO: antes de soltar, se hace Matter.Query.point contra los cuerpos
// del mundo; si el clic cae sobre algo, se deja que MouseConstraint lo
// arrastre (mouse o dedo) y NO se suelta uno nuevo encima. Un solo cambio en
// el componente base LienzoFisica corrige el comportamiento en los 8
// simuladores a la vez (todos lo comparten).
// Aditivo: contenido curricular, motor y DESGLOSE_MAP idénticos a v22
// (auditado). STORAGE_KEY sin cambios.
// Verificado con stubs (sin las librerías reales, igual que en Fase 8): app
// arranca, navega, Escape, panel de simulador abre sin colgar — 9/9, 0
// errores. La corrección de arrastre en sí no se pudo probar con Matter.js
// real por la misma razón de siempre (sin red en este entorno) — es la
// prueba visual que te toca a ti en el deploy.
// ---
// v22 (12 jul 2026) — FASE 8: LIBRERÍAS GRÁFICAS + ESCAPE.
// Se agregan TRES librerías, todas EMPAQUETADAS (funcionan sin internet en las
// PC de la escuela una vez cargada la app; requieren `npm install`, que corre
// Cloudflare en el build). IMPORTANTE: esta versión NECESITA que también se
// suba el package.json actualizado, no solo este archivo.
// 1) GSAP (~13KB): pulido transversal. El desglose paso a paso entra con rebote
//    elástico (back.out). Helpers defensivos animar/animarDesde/trazarSVG —
//    si la librería no cargara, la app sigue y solo omite el adorno.
// 2) canvas-confetti (~3KB): recompensa visual. Confeti al DOMINAR un propósito,
//    al SUBIR DE NIVEL y cada 5 aciertos seguidos (helper festejar()).
// 3) Matter.js (~30KB): física REAL en 8 interactivos donde el contenido ES
//    movimiento/fuerzas. Componente base reutilizable LienzoFisica (crea motor,
//    lo corre y —clave— lo DESMONTA por completo al salir; paredes invisibles;
//    arrastrar y tocar-para-soltar) + PanelSimulador plegable. Ambos ADITIVOS:
//    si Matter no está o el sistema pide "reducir movimiento", no se ofrece el
//    panel y el SVG de siempre queda intacto. Los 8: caída libre (CNEyT V·PF1),
//    Arquímedes/flotación (CNEyT V·PF6), densidad (CNEyT I·PF3), estados/
//    movimiento molecular (CNEyT I·PF7), energía cinética (CNEyT II·PF2),
//    proyectil parabólico (PM IV / Parabola), posición-tiempo (PM V·PF2), dado
//    que rueda (PM VI·PF2).
// 4) TECLA ESCAPE (PC): cierra Ajustes si está abierto; si no, regresa a los
//    propósitos desde cualquier vista. En celular siguen los botones "Volver".
// Respeta prefers-reduced-motion (accesibilidad): sin animaciones ni simulador.
// Aditivo: contenido curricular, generadores, motor y DESGLOSE_MAP byte por byte
// idénticos a v21 (auditado). STORAGE_KEY sin cambios.
// ADVERTENCIA DE PRUEBAS: este entorno NO tiene las 3 librerías instaladas (sin
// red), así que las ANIMACIONES no se pudieron probar aquí — solo la lógica con
// stubs (app arranca, navega, Escape, y los paneles abren sin colgar: verificado
// en navegador, 9/9, 0 errores). La validación visual final es en el deploy.
// Rollback a v21 disponible si algo falla.
// ---
// v21 (12 jul 2026) — FASE 7: CORRECCIÓN DEL MODO GUIADO.
// Reporte real del usuario: en Notación científica (PM I·PF6), el resolvedor
// embebido no traía ejemplo, y "Guiado" estaba en mal lugar (entre Aprender y
// Practicar). Se investigó con datos, no adivinando — auditoría de las 3
// causas encontradas:
// 1) BUG REAL — nivel del alumno, no "no aplica": simulando 300 intentos por
//    nivel en los 17 propósitos operables, 9 solo generan su variante
//    desglosable en CIERTOS niveles (ej. Notación científica: 0% en nivel 1-2,
//    100% en nivel 3 — un alumno nuevo SIEMPRE está en nivel 1, así que nunca
//    veía ejemplo). Corregido: generarDesglosable ahora busca en los 3 niveles,
//    no solo el del alumno — el modo guiado es una herramienta de ENSEÑANZA,
//    no de práctica adaptativa. Verificado: 200/200 en los 17 propósitos para
//    un alumno nuevo (antes había 9 con fallos parciales).
// 2) EJEMPLO GENÉRICO — el resolvedor embebido sugería el placeholder del TIPO
//    ("6 + 4 × 2" para cualquier propósito tipo jerarquía), no uno del
//    PROPÓSITO. Corregido: ahora genera y sugiere un ejemplo real de ESE
//    propósito (ej. "(2 × 10^2) × (3 × 10^4)" para notación científica).
// 3) UBICACIÓN: "Guiado 🧩" salió de la fila de la tarjeta (entre Aprender y
//    Practicar) y ahora vive DENTRO de Aprender, como botón secundario arriba
//    de "Ya lo entendí — practicar", junto al resolvedor embebido.
// De regalo: se unificaron PROP_A_TIPO y DESGLOSE_MAP (antes desincronizados:
// 8 propósitos de PM III-VI tenían desglose al responder pero NO mostraban el
// resolvedor embebido en Aprender — P2 La recta, distancia, límites, tasa de
// variación, conjuntos, permutaciones). tipoResolvedorDe ahora deriva de
// DESGLOSE_MAP como única fuente de verdad — ya no puede desincronizarse.
// TAMBIÉN se corrigió un bug de React encontrado en el proceso ("Rendered more
// hooks than during the previous render"): un useMemo había quedado después del
// guard de carga (if (!prog) return) — viola las reglas de hooks y solo se
// manifestaba en el primer render real de la app, no en las pruebas anteriores.
// Reubicado antes del guard, auditado que no queden más hooks después de él.
// Verificado: regresión completa (práctica, inline, Aprender, calculadora,
// graficador, cascada, settings, y el caso exacto reportado de Notación
// científica) — 12/12 pruebas, 0 errores de consola.
// STORAGE_KEY sin cambios; contenido curricular idéntico a v20.
// ---
// v20 (12 jul 2026) — FASE 6: RESOLVEDOR EN APRENDER + SETTINGS.
// 1) RESOLVEDOR EMBEBIDO EN APRENDER: en cada propósito operable, arriba de
//    "Ya lo entendí", aparece "🧩 Juega con el resolvedor" ya filtrado al tipo
//    del propósito (lineal, cuadrática, densidad, etc.), con proponer-problema.
//    El alumno resuelve uno él mismo paso a paso antes de practicar. Activo en
//    los 13 propósitos con tipo de resolvedor (PROP_A_TIPO), en TODAS las
//    materias; los conceptuales no lo muestran.
// 2) SETTINGS ⚙️ en la esquina superior: panel con 3 TEMAS visuales (Cuaderno
//    de campo -default-, Sepia cálido, Alto contraste) y TAMAÑO DE TEXTO
//    (chico/normal/grande). Se guardan en window.storage (clave "entrenador-ui",
//    separada del progreso). Los temas funcionan enrutando ~200 colores del
//    chrome por el objeto CI (mutable) + interpolando el CSS con \${CI.x}, así
//    que la app entera cambia de color sin tocar la lógica.
// 3) SELLO DE VERSIÓN al pie (BUILD) ya presente desde v19.
// Todo aditivo: contenido curricular, generadores, motor y DESGLOSE_MAP quedaron
// byte por byte idénticos a v19 (auditado). STORAGE_KEY sin cambios.
// Verificado: resolvedor embebido aparece solo en operables y resuelve; los 3
// temas cambian el fondo real (campo #F6F1E3 / contraste #FFF / sepia #F3E9D8) y
// la escala sube el texto; regresión de práctica/inline/Aprender/guiado/
// calculadora/graficador/cascada/settings OK; cero errores. Un solo archivo.
// ---
// v19 (12 jul 2026) — FASE 5: CASCADA + CALCULADORA + GUIADO.
// 1) MODO CASCADA: DesglosePasos gana un alternador "Paso a paso ↔ Cascada".
//    En cascada se ven los N pasos apilados a la vez (como Photomath), cada uno
//    con su título y su resaltado rojo/dorado. El paso-a-paso sigue igual.
// 2) DESGLOSE EN LA CALCULADORA: al calcular una operación aritmética de varios
//    pasos, aparece "🧩 ¿Cómo se resuelve?" que abre su desglose (reusa el motor
//    de jerarquía). La calculadora deja de ser caja negra y enseña el proceso.
// 3) PRACTICAR GUIADO (par ejemplo-problema, respaldado por la teoría de carga
//    cognitiva): tercer botón "Guiado 🧩" en cada propósito operable, junto a
//    Aprender y Practicar. Muestra un ejemplo resuelto (datos que pone la app),
//    luego "ahora yo" con OTRO problema del mismo tipo y números distintos que el
//    alumno responde, con opción de ver su desglose y de pedir "otro par".
//    Solo aparece en los 17 propósitos operables (usa tieneDesglose); los
//    conceptuales no lo muestran.
// Todo aditivo: motor, generadores, DESGLOSE_MAP y contenido curricular quedaron
// byte por byte idénticos a v18 (auditado). STORAGE_KEY sin cambios.
// Incluye SELLO DE VERSIÓN visible al pie (const BUILD) para confirmar en el
// sitio en vivo que cargó la última versión.
// Verificado: cascada, desglose-en-calculadora y guiado (par completo:
// ejemplo→intento→feedback→desglose→otro par) probados en navegador real sin
// errores; regresión de práctica/inline/Aprender/calculadora/graficador/
// Resolvedor OK. NO integrado aún — un solo archivo a reemplazar.
// ---
// v18 (12 jul 2026) — FASE 4: SEÑALIZACIÓN + COBERTURA PM I-VI.
// 1) TÍTULOS DE PASO: cada paso del desglose lleva nombre pedagógico visible
//    ("Calcular el discriminante", "Juntar los términos con x", "Comprobar la
//    solución"), estilo Symbolab — le da vocabulario al procedimiento.
// 2) DOBLE RESALTADO (principio de señalización, estilo Photomath):
//    ROJO = lo que se está operando / lo que sigue; DORADO = resultado recién
//    calculado. Si se traslapan, el dorado se anida dentro del rojo.
// 3) NUEVA FAMILIA: Derivada (regla de la potencia) — paramétrica, sin CAS —
//    en el Resolvedor (10 tipos ya) y en el inline de PM V·PF6.
// 4) COBERTURA INLINE PM I-VI COMPLETA (17 propósitos mapeados):
//    PM I: PF3 enteros, PF5 potencias/raíces, PF6 notación científica, PF7 jerarquía
//    PM II: PF6 ecuaciones · PM III: P1 lineales, P2 evaluar recta, P3 sistemas, P4 cuadráticas
//    PM IV: PF1 distancia, PF3 evaluar curvas, PF4 evaluar recta
//    PM V: PF1 tasa de variación, PF4 límites, PF6 derivada · PM VI: PF3 conjuntos (A∪B), PF4 permutaciones (n!)
//    El botón se decide POR PREGUNTA: los generadores mezclan variantes, y si la
//    variante no es desglosable el extractor devuelve null y no aparece nada.
//    Los propósitos genuinamente conceptuales (simetría, muestreo, cónicas…)
//    quedan honestamente fuera — no hay algoritmo que desglosar.
// Respaldo pedagógico: worked-example effect (teoría de carga cognitiva) +
// principio de señalización; alineado a Meta M3/Categoría Procedural del MCCEMS
// ("comprueba los procedimientos usados… empleando recursos tecnológicos").
// Verificado: motor v3 con títulos/rojo probado en Node (todas las familias);
// 23 extracciones correctas contra plantillas reales + 5 variantes null esperadas;
// inline probado en navegador en LOS 6 SEMESTRES sin errores; doble resaltado
// verificado en el DOM (rojo "6 × 3" → siguiente paso oro "18" anidado en rojo
// "8 + 18"); auditoría: contenido curricular idéntico a v17; regresión 9/9.
// STORAGE_KEY sin cambios. NO integrado al zip de despliegue.
// ---
// v17 (11 jul 2026) — FASE 3 del RESOLVEDOR: DESGLOSE INLINE.
// Tras responder un ejercicio, en los propósitos OPERABLES aparece el botón
// "🧩 Ver este ejercicio paso a paso": abre el mismo componente DesglosePasos
// del Resolvedor, resolviendo LA INSTANCIA EXACTA que el alumno acaba de ver.
// Mecanismo aditivo y central (DESGLOSE_MAP): mapea (materia:código) → familia
// del motor y EXTRAE el problema del texto ya generado — no se tocó ningún
// generador. Piloto en 3 propósitos operables: pm1·PF7 (jerarquía), pm3·P1
// (ecuación lineal), pm3·P4 (cuadrática). Los propósitos no operables (o no
// mapeados) no muestran el botón: comportamiento aditivo, no rompe nada.
// Extender a más propósitos = añadir una entrada al DESGLOSE_MAP.
// Verificado: extracción + motor dan la solución correcta en las 3 familias;
// prueba en navegador real (practicar → responder → ver desglose del mismo
// ejercicio) OK en las 3, y confirmado que un propósito no operable (pm3·P2,
// "La recta") NO muestra el botón; compila sin errores; sin errores de consola.
// STORAGE_KEY sin cambios. NO integrado al zip de despliegue.
// Pendiente Fase 3+: mapear sistemas (pm3·P3) y las 4 familias de CNEyT
// cuantitativo a sus propósitos, cuando su texto generado sea extraíble.
// ---
// v16 (11 jul 2026): Fase 2 del Resolvedor (9 familias + visuales).
// v15 (11 jul 2026): Fase 1 del Resolvedor (jerarquía + ecuación lineal).
// v14 (6 jul 2026): Se elimina la repetición detectada por el
// usuario en los interactivos "Aprender" (el caso más notorio: "Descubrimiento
// de la célula" en CNEyT VI repetía el dato de Hooke/microscopio/corcho hasta
// 3 veces). Auditoría reveló que el problema era sistemático: 81 de los 90
// interactivos (todos excepto los 9 originales de v2) tenían el párrafo
// interno casi calcando la caja "¿Por qué funciona?" de arriba. Se reescribieron
// los 81 párrafos para aportar información NUEVA (lectura de un valor límite,
// error común, o extensión práctica) en vez de repetir el mismo concepto.
// También se diversificó la pregunta de práctica PF2 de CNEyT VI (antes
// repetía Hooke por tercera vez; ahora alterna con un dato distinto sobre
// van Leeuwenhoek). Verificado: sintaxis OK, similitud de texto <50% en 80/81
// pares (el único caso >50% comparte vocabulario técnico inevitable pero dice
// algo distinto), y los 90 "Aprender" abren sin errores en navegador real.
// NOTA: esta versión NO se integró al zip de despliegue -- pendiente de que
// el usuario confirme antes de subirla.
// v13: Renombrado de "Entrenador" a "Entrenamático"
// en toda la interfaz (título, textos de diagnóstico y pie de página). Sin
// cambios de datos ni de lógica -- STORAGE_KEY se dejó igual ("entrenador-v2")
// a propósito, para no perder el progreso ya guardado de quien use el sitio
// desplegado.
// v12: SE REVIERTE la v11. Aquella corrección fue
// un ERROR: se basó en una búsqueda de project_knowledge_search que se cortó
// justo tras el propósito 3 (mismo problema de truncamiento ya detectado antes
// en PM II). Al buscar más específicamente los PF4-PF8, SÍ existen en el
// documento oficial (MCC_CIENCIAS-NATURALES.pdf) y coinciden exactamente con
// los 8 propósitos que ya se habían construido desde el principio. CNEyT I
// vuelve a PF1-PF8 tal cual estaba en v10. Se auditó también CNEyT III y IV
// por el mismo posible error: AMBAS tienen igualmente 8 propósitos oficiales
// confirmados, sin cambios necesarios. Lección: los splits automáticos de
// project_knowledge_search pueden cortar una tabla a la mitad; antes de
// concluir un conteo de propósitos hay que buscar explícitamente los PF
// siguientes, no asumir que el primer resultado trae la tabla completa.
// NOTA: ExamLab (la app externa auditada) SÍ tiene este error real en su
// propio código para CNEyT I/III/IV -- no se debe copiar esa "corrección".
// v11 (REVERTIDA): CORRECCIÓN CURRICULAR — CNEyT I tenía 8
// propósitos, pero la Tabla 1 oficial (MCC_CIENCIAS-NATURALES.pdf) solo
// define 3 (verificado contra el documento fuente). Los 5 restantes
// (sustancia/mezcla, átomo, enlaces, estados de agregación, naturaleza dual)
// NO son parte del programa oficial de CNEyT I -- se conservan (con sus
// interactivos y generadores intactos, nada se borró) pero renombrados de
// PF4-PF8 a EXTRA1-EXTRA5, con insignia visual "➕ complementario" para que
// quede honestamente distinguido de los 3 propósitos formativos reales.
// Hallazgo surgido al auditar la última edición de ExamLab, que ya tenía
// esta misma corrección aplicada. Verificado: 90/90 propósitos con
// generador, 5/5 insignias visibles, práctica funcional en un EXTRA.
// v10: El Graficador ahora SÍ varía por materia.
// Registro GRAFICOS_PRESET: 18 funciones repartidas en las 12 materias, cada
// una ligada a un propósito real (ej. PM V trae cúbica con máx/mín + 1/x con
// asíntota; CNEyT V trae caída libre y onda mecánica; CNEyT I trae masa vs
// volumen para densidad). Cada preset trae su propia ventana de x apropiada
// al fenómeno, y una nota de a qué propósito conecta. Verificado: 18/18
// presets con muestreo válido, 18/18 probados en navegador en sus 12
// materias sin errores, función y nota confirmadas por extracción del DOM.
// v9: Nueva sección Herramientas (Calculadora
// científica contextual + Graficador de funciones), construida sobre un
// núcleo de cálculo propio (parser recursivo, sin mathjs ni eval() sobre
// texto del usuario). La calculadora destaca atajos y fórmulas rápidas
// distintas según la materia activa (MATERIAS ya existente). El graficador
// muestra la curva y, opcionalmente, la recta tangente + derivada numérica
// en un punto — útil sobre todo para PM V. Verificado: 36/36 pruebas del
// núcleo, 0 crashes en 2000 expresiones aleatorias, y verificación
// funcional en navegador de los cálculos reales mostrados en pantalla.
// v8: Casos reales completos en las 12 materias
// (antes: 5/12, 6 casos pasivos). Las 4 fases: (1) CNEyT II-VI construidos,
// (2) PM VI construido, (3) los 6 casos viejos de PM I-V enriquecidos con
// planteamiento + interactivo reutilizado + autoverifica, (4) verificado
// abriendo los 13 casos de las 12 materias en navegador real: 0 errores,
// 0 interactivos faltantes.
// v7: Nuevo componente CasoCard para "Casos reales"
// con 3 capas (comprensión -> interactivo en vivo -> auto-verificación).
// Retrocompatible con los 6 casos existentes. UN caso de muestra construido
// completo (CNEyT I) para validar el patrón antes de escalarlo a las demás
// materias -- ver ruta de trabajo en la bitácora / chat.
// v6: COBERTURA COMPLETA — los 90 propósitos de las
// 12 materias tienen ahora interactivo "Aprender" en vivo (antes: 22/90, 24%).
// Se agregaron 69 interactivos nuevos organizados en 4 lotes (PM I y III, PM IV-VI,
// CNEyT I y III, CNEyT II/IV/V/VI restantes). Verificado abriendo los 90 botones
// "Aprender" en un navegador real: 0 fallos, 0 errores de consola.
// v5: +12 interactivos "Aprender" en vivo para las
// materias nuevas (TasaVariacion, DerivadaPotencia, Optimizacion, VennConjuntos,
// CampanaNormal, EnergiaCinetica, EscalasTemperatura, EscalaPH, SegundaLeyNewton,
// OndaInteractiva, LeyOhm, CuadroPunnett), con el mismo patrón que los de v2:
// SVG en vivo + deslizadores + ¿por qué funciona?. Verificados en navegador.
// v4: 12 materias integradas. El selector superior
// ahora tiene DOS niveles: primero se elige el ÁREA (Matemáticas / CNEyT) y
// debajo aparecen sus 6 semestres. Cada propósito conserva Aprender + Practicar.
// v3 integró PM V, PM VI y CNEyT I-VI (8 materias
// nuevas, 64 propósitos nuevos). Cada una con su propio generador de
// reactivos (GEN_PM5, GEN_PM6, GEN_CNEYT1..6), probado 4,500 veces sin error
// antes de integrarse. Ninguna de estas 8 materias nuevas trae todavía
// interactivo en vivo ni casos reales curados — eso queda como pendiente
// explícito (ver más abajo), igual que ocurrió con PM I-IV al principio.
// Fusiona el motor robusto del v1 con la librería de animaciones:
//   · Dominio adaptativo (confianza sube con aciertos consecutivos, baja con
//     errores; "dominado" al cruzar umbral ≈ BKT-lite).
//   · Diagnóstico inicial + siembra de confianza por propósito (mapa de partida).
//   · Fluidez por tiempo de respuesta; freno de sobre-práctica al dominar.
//   · Tres niveles por propósito (Andamiaje → Consolidación → Reto).
//   · Sección "Aprender" con interactivos en vivo (BarraPorcentaje, Parabola,
//     BalanzaEcuacion, RectaInteractiva) — la misma figura del cuadernillo,
//     movible, con "¿por qué funciona?". Una sola fuente por progresión
//     alimenta aprender y practicar.
//
// NOTAS DE DISEÑO (3 jul 2026, indicación del usuario):
//   · El Entrenador es el lugar donde viven los gráficos interactivos (no el
//     cuadernillo en papel). Todo módulo nuevo con gráfica o función debería,
//     cuando sea posible, tener su propio interactivo aquí.
//   · Patrón obligatorio por interactivo: primero EXPLICAR el proceso (con
//     opción de avanzar paso a paso), después PREGUNTAR (practicar). Ver
//     BalanzaEcuacion: "Siguiente paso →" explica cómo se despeja x, y
//     "Saltar a la solución" permite saltar directo al resultado.
//   · Pendiente (si hay chance): sumar interactivo a más propósitos con
//     gráficas/funciones. Cubiertos hasta ahora: PM II·PF5 (%), PM III·P1
//     (ecuaciones lineales, con animación paso a paso), PM III·P2 (la recta),
//     PM IV·PF5 (parábola). Sin cubrir: PM III·P4 (cuadráticas — hereda
//     Parabola si se reutiliza), PM IV·PF1-2 (punto/recta, trigonometría),
//     PM IV·PF6-7 (circunferencia, cónicas).
//   · PENDIENTE (3 jul 2026, indicación del usuario — SIN INTEGRAR AÚN):
//     gamificar el puente diagnóstico → animación. Hoy la vista "mapaDiag"
//     (mapa de partida) solo marca verde/barro y manda a "Empezar a
//     entrenar" (practicar directo). El cambio: para cada propósito que
//     salió "barro" (conf < 50) Y que tiene `interactivo` registrado, el
//     mapa debe ofrecer un botón tipo "Ver cómo se resuelve, paso a paso"
//     que abre la vista "aprender" de ESE propósito específico (con su
//     animación: BalanzaEcuacion, Parabola, etc.) ANTES de mandar a
//     practicar. Para propósitos sin interactivo, cae al comportamiento
//     actual (directo a practicar). Este es el punto de conexión explícito
//     entre el diagnóstico (evaluación) y las animaciones (remediación): las
//     animaciones dejan de ser solo material de estudio libre y se vuelven
//     la respuesta directa a "esto es lo que te salió mal".
//   · HECHO (3 jul 2026, noche, 2.ª pasada): se llenaron los 5 huecos de
//     interactivo en PM II (TraductorAlgebraico, ClasificadorExpresion,
//     ModeloAreaMonomios, CuadradoBinomio, IdentidadOEcuacion) — PM II queda
//     con sus 6 propósitos cubiertos al 100%. Además, nueva sección "Casos
//     reales": botón dorado en el inicio de cada materia (si tiene casos
//     registrados en CASOS_REALES) que abre una vista con situaciones
//     cotidianas resueltas paso a paso — p. ej. por qué "50% + 20%" de
//     descuento NO es 70%. Contenido curado, no uno por cada propósito;
//     varios adaptados de las cápsulas "En el trabajo" ya verificadas en los
//     cuadernillos, todos los números verificados a mano. 9 de 26 propósitos
//     tienen interactivo ahora (todo PM II, más P1/P2 de PM III, PF5 de PM
//     IV). Pendiente si hay chance: PM I completo, PM III P3-P6, PM IV
//     PF1-4/6-7.
// Dirección de diseño: "cuaderno de campo que cobra vida". La racha es una
// milpa que crece. Paleta tierra del cuadernillo, no morado genérico.
// ============================================================================

// ---------------------------- MOTOR (verificado en Node: 11,700 gen / 0 err)
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const rndNZ = (a, b) => { let v = 0; while (v === 0) v = rnd(a, b); return v; };
const pick = (arr) => arr[rnd(0, arr.length - 1)];

function armar(correct, distractors) {
  const seen = new Set([String(correct)]);
  const opts = [String(correct)];
  for (const d of distractors) {
    const s = String(d);
    if (!seen.has(s) && opts.length < 4) { seen.add(s); opts.push(s); }
  }
  let extra = 1;
  while (opts.length < 4) {
    const s = String(Number.isFinite(Number(correct)) ? Number(correct) + extra * 3 : correct + "·" + extra);
    if (!seen.has(s)) { seen.add(s); opts.push(s); }
    extra++;
  }
  for (let i = opts.length - 1; i > 0; i--) { const j = rnd(0, i); [opts[i], opts[j]] = [opts[j], opts[i]]; }
  return { opciones: opts, correcta: opts.indexOf(String(correct)) };
}

const GEN_PM1 = {
  PF1: (nv, _d) => {
    const p = rnd(0, 1) === 1, q = rnd(0, 1) === 1;
    const V = (b) => (b ? "V" : "F");
    const exprs = [
      { t: "p ∧ q", v: p && q }, { t: "p ∨ q", v: p || q },
      { t: "¬p", v: !p }, { t: "¬q", v: !q },
      { t: "¬(p ∧ q)", v: !(p && q) }, { t: "¬(p ∨ q)", v: !(p || q) },
      { t: "p → q", v: !p || q }, { t: "q → p", v: !q || p },
    ];
    const pool = nv === 1 ? exprs.slice(0, 6) : exprs;
    const trues = pool.filter((e) => e.v), falses = pool.filter((e) => !e.v);
    if ((trues.length === 0 || falses.length < 3) && (_d || 0) < 12) return GEN_PM1.PF1(nv, (_d || 0) + 1);
    if (trues.length === 0 || falses.length < 3) return GEN_PM1.PF3(1);
    const c = pick(trues);
    const ds = falses.sort(() => Math.random() - 0.5).slice(0, 3).map((e) => e.t);
    const { opciones, correcta } = armar(c.t, ds);
    return {
      texto: `Si p es ${V(p)} y q es ${V(q)}, ¿cuál de estas proposiciones es VERDADERA?`,
      opciones, correcta,
      explica: `Con p = ${V(p)} y q = ${V(q)}: "${c.t}" resulta verdadera. Recuerda: ∧ exige que ambas sean V; ∨ basta con una V; → solo es falsa cuando el antecedente es V y el consecuente F.`,
    };
  },
  PF2: (nv) => {
    if (nv <= 2) {
      const digitos = nv === 1 ? 4 : 5;
      const n = rnd(Math.pow(10, digitos - 1), Math.pow(10, digitos) - 1);
      const s = String(n);
      let posIdx = rnd(0, s.length - 1);
      if (s[posIdx] === "0") posIdx = 0;
      const d = Number(s[posIdx]);
      const potencia = s.length - 1 - posIdx;
      const valor = d * Math.pow(10, potencia);
      const nombres = ["unidades", "decenas", "centenas", "unidades de millar", "decenas de millar"];
      const { opciones, correcta } = armar(valor, [d, d * Math.pow(10, Math.max(0, potencia - 1)), d * Math.pow(10, potencia + 1)]);
      return {
        texto: `En el número ${n.toLocaleString("es-MX")}, ¿qué valor representa el dígito ${d} (posición de ${nombres[potencia]})?`,
        opciones, correcta,
        explica: `El ${d} ocupa la posición de ${nombres[potencia]}, así que vale ${d} × ${Math.pow(10, potencia).toLocaleString("es-MX")} = ${valor.toLocaleString("es-MX")}.`,
      };
    }
    const ent = rnd(1, 40);
    const dec = rnd(1, 9), cen = rnd(1, 9);
    const lugar = pick(["décimos", "centésimos"]);
    const num = `${ent}.${dec}${cen}`;
    const d = lugar === "décimos" ? dec : cen;
    const valor = lugar === "décimos" ? d / 10 : d / 100;
    const { opciones, correcta } = armar(valor, [d, lugar === "décimos" ? d / 100 : d / 10, d * 10]);
    return {
      texto: `En el número ${num}, ¿qué valor representa el dígito ${d} en la posición de los ${lugar}?`,
      opciones, correcta,
      explica: `Los ${lugar} valen ${lugar === "décimos" ? "1/10" : "1/100"}: el ${d} representa ${valor}.`,
    };
  },
  PF3: (nv) => {
    if (nv === 1) {
      const a = rndNZ(-9, 9), b = rndNZ(-9, 9);
      const r = a + b;
      const { opciones, correcta } = armar(r, [a - b, -r, r + rndNZ(-2, 2)]);
      return {
        texto: `Calcula: (${a}) + (${b})`,
        opciones, correcta,
        explica: `${(a >= 0) === (b >= 0) ? "Signos iguales: suma los valores absolutos y conserva el signo." : "Signos distintos: resta los valores absolutos y toma el signo del mayor."} Resultado: ${r}.`,
      };
    }
    if (nv === 2) {
      const a = rndNZ(-20, 20), b = rndNZ(-20, 20);
      const r = a - b;
      const { opciones, correcta } = armar(r, [a + b, b - a, r + rndNZ(-3, 3)]);
      return { texto: `Calcula: (${a}) − (${b})`, opciones, correcta, explica: `Restar es sumar el opuesto: (${a}) + (${-b}) = ${r}.` };
    }
    const t0 = rnd(-8, 5), sube = rnd(3, 12), baja = rnd(3, 12);
    const r = t0 + sube - baja;
    const { opciones, correcta } = armar(r, [t0 - sube + baja, r + rndNZ(-3, 3), -r === r ? r + 1 : -r]);
    return {
      texto: `La temperatura al amanecer era de ${t0} °C. Al mediodía subió ${sube} °C y en la noche bajó ${baja} °C. ¿Cuál fue la temperatura final?`,
      opciones, correcta,
      explica: `${t0} + ${sube} − ${baja} = ${r} °C. Los enteros modelan subidas y bajadas con signo.`,
    };
  },
  PF4: (nv) => {
    if (nv === 1) {
      const p = pick([10, 25, 50, 20]);
      const base = pick([40, 60, 80, 100, 120, 200, 300, 500]);
      const r = (p * base) / 100;
      const { opciones, correcta } = armar(r, [r * 2, r / 2, r + 10]);
      return { texto: `¿Cuánto es el ${p}% de ${base}?`, opciones, correcta, explica: `${p}% = ${p}/100. Entonces ${p}/100 × ${base} = ${r}.` };
    }
    if (nv === 2) {
      const p = pick([5, 15, 30, 35, 40, 45, 60, 75]);
      const base = rnd(4, 30) * 20;
      const r = (p * base) / 100;
      const { opciones, correcta } = armar(r, [r + p, (base * (100 - p)) / 100, r * 2]);
      return {
        texto: `Un producto de $${base.toLocaleString("es-MX")} tiene ${p}% de descuento. ¿De cuánto es el descuento?`,
        opciones, correcta,
        explica: `Descuento = ${p}% de ${base} = ${p}/100 × ${base} = $${r.toLocaleString("es-MX")}.`,
      };
    }
    const k1 = rnd(2, 6), precioU = rnd(8, 25);
    const c1 = k1 * precioU;
    const k2 = k1 + rnd(2, 6);
    const r = k2 * precioU;
    const { opciones, correcta } = armar(r, [c1 + k2, r + precioU, r - precioU]);
    return {
      texto: `Si ${k1} kg de maíz cuestan $${c1}, ¿cuánto cuestan ${k2} kg al mismo precio? (regla de tres)`,
      opciones, correcta,
      explica: `Precio por kg: ${c1} ÷ ${k1} = $${precioU}. Entonces ${k2} × ${precioU} = $${r}.`,
    };
  },
  PF5: (nv) => {
    if (nv === 1) {
      if (rnd(0, 1)) {
        const n = rnd(3, 12);
        const r = n * n;
        const { opciones, correcta } = armar(r, [n * 2, r + n, (n + 1) * (n + 1)]);
        return { texto: `Calcula: ${n}²`, opciones, correcta, explica: `${n}² = ${n} × ${n} = ${r}. Elevar al cuadrado es multiplicar el número por sí mismo.` };
      }
      const n = rnd(3, 12);
      const cuad = n * n;
      const { opciones, correcta } = armar(n, [n + 1, n - 1, Math.round(cuad / 2)]);
      return { texto: `Calcula: √${cuad}`, opciones, correcta, explica: `√${cuad} = ${n}, porque ${n} × ${n} = ${cuad}.` };
    }
    if (nv === 2) {
      const b = rnd(2, 5), e = rnd(3, 4);
      const r = Math.pow(b, e);
      const { opciones, correcta } = armar(r, [b * e, Math.pow(b, e - 1), r + b]);
      return { texto: `Calcula: ${b}${e === 3 ? "³" : "⁴"}`, opciones, correcta, explica: `${b}${e === 3 ? "³" : "⁴"} = ${Array(e).fill(b).join(" × ")} = ${r}.` };
    }
    const b = rnd(2, 7), m = rnd(2, 5), n2 = rnd(2, 5);
    const r = m + n2;
    const { opciones, correcta } = armar(r, [m * n2, Math.abs(m - n2) || r + 1, r + 1]);
    return {
      texto: `Si ${b}^${m} × ${b}^${n2} = ${b}^x, ¿cuánto vale x? (ley de exponentes)`,
      opciones, correcta,
      explica: `Con la misma base, los exponentes se SUMAN: x = ${m} + ${n2} = ${r}.`,
    };
  },
  PF6: (nv) => {
    if (nv === 1) {
      const a = rnd(2, 9), n = rnd(2, 5);
      const r = a * Math.pow(10, n);
      const { opciones, correcta } = armar(r.toLocaleString("es-MX"), [(a * Math.pow(10, n - 1)).toLocaleString("es-MX"), (a * Math.pow(10, n + 1)).toLocaleString("es-MX"), (a + n).toLocaleString("es-MX")]);
      return {
        texto: `¿Qué número es ${a} × 10^${n}?`,
        opciones, correcta,
        explica: `Multiplicar por 10^${n} recorre el punto ${n} lugares a la derecha: ${r.toLocaleString("es-MX")}.`,
      };
    }
    if (nv === 2) {
      const a = rnd(2, 9), n = rnd(3, 6);
      const num = a * Math.pow(10, n);
      const c = `${a} × 10^${n}`;
      const { opciones, correcta } = armar(c, [`${a} × 10^${n - 1}`, `${a} × 10^${n + 1}`, `${a * 10} × 10^${n}`]);
      return {
        texto: `Expresa ${num.toLocaleString("es-MX")} en notación científica.`,
        opciones, correcta,
        explica: `Se escribe un solo dígito entero (${a}) por la potencia de 10: el punto se recorre ${n} lugares → ${c}.`,
      };
    }
    const a = rnd(2, 4), b = rnd(2, 3), m = rnd(2, 4), n2 = rnd(2, 4);
    const coef = a * b, exp = m + n2;
    const c = coef < 10 ? `${coef} × 10^${exp}` : `${coef / 10} × 10^${exp + 1}`;
    const d1 = coef < 10 ? `${coef} × 10^${m * n2}` : `${coef} × 10^${exp}`;
    const { opciones, correcta } = armar(c, [d1, `${a + b} × 10^${exp}`, `${coef} × 10^${exp - 1}`]);
    return {
      texto: `Calcula: (${a} × 10^${m}) × (${b} × 10^${n2})`,
      opciones, correcta,
      explica: `Se multiplican coeficientes (${a} × ${b} = ${coef}) y se suman exponentes (${m} + ${n2} = ${exp}). ${coef >= 10 ? `Como ${coef} ≥ 10, se ajusta: ${c}.` : `Resultado: ${c}.`}`,
    };
  },
  PF7: (nv) => {
    if (nv === 1) {
      const a = rnd(2, 12), b = rnd(2, 9), c = rnd(2, 9);
      const r = a + b * c;
      const { opciones, correcta } = armar(r, [(a + b) * c, a * b + c, r + b]);
      return {
        texto: `Calcula: ${a} + ${b} × ${c}`,
        opciones, correcta,
        explica: `Primero la multiplicación: ${b} × ${c} = ${b * c}. Luego ${a} + ${b * c} = ${r}. Sin paréntesis, × va antes que +.`,
      };
    }
    if (nv === 2) {
      const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 6), d = rnd(1, 10);
      const r = (a + b) * c - d;
      const { opciones, correcta } = armar(r, [a + b * c - d, (a + b) * (c - d), r + c]);
      return {
        texto: `Calcula: (${a} + ${b}) × ${c} − ${d}`,
        opciones, correcta,
        explica: `Paréntesis primero: ${a} + ${b} = ${a + b}. Luego × ${c} = ${(a + b) * c}, y al final − ${d} = ${r}.`,
      };
    }
    const c = rnd(5, 9), d = rnd(1, c - 2);
    const divisores = [2, 3, 4].filter((x) => (c - d) % x === 0);
    if (divisores.length === 0) return GEN_PM1.PF7(3);
    const e = pick(divisores);
    const a = rnd(3, 15), b = rnd(2, 6);
    const r = a + (b * (c - d)) / e;
    const { opciones, correcta } = armar(r, [(a + b) * ((c - d) / e), a + b * c - d / e, r + b]);
    return {
      texto: `Calcula: ${a} + ${b} × (${c} − ${d}) ÷ ${e}`,
      opciones, correcta,
      explica: `Paréntesis: ${c} − ${d} = ${c - d}. Luego × y ÷ de izquierda a derecha: ${b} × ${c - d} = ${b * (c - d)}, ÷ ${e} = ${(b * (c - d)) / e}. Al final + ${a} = ${r}.`,
    };
  },
};

const GEN_PM3 = {
  P1: (nv) => {
    if (nv === 1) {
      const x = rndNZ(-9, 9), a = rnd(2, 9);
      if (rnd(0, 1)) {
        const b = rnd(1, 15), c = x + b;
        const { opciones, correcta } = armar(x, [c, -x === x ? x + 2 : -x, x + rndNZ(-2, 2)]);
        return { texto: `Resuelve: x + ${b} = ${c}`, opciones, correcta, explica: `x = ${c} − ${b} = ${x}. Lo que suma de un lado, pasa restando al otro.` };
      }
      const c = a * x;
      const { opciones, correcta } = armar(x, [c - a, -x === x ? x + 2 : -x, x + rndNZ(-2, 2)]);
      return { texto: `Resuelve: ${a}x = ${c}`, opciones, correcta, explica: `x = ${c} ÷ ${a} = ${x}. Lo que multiplica, pasa dividiendo.` };
    }
    if (nv === 2) {
      const x = rndNZ(-8, 8), a = rnd(2, 7), b = rndNZ(-12, 12);
      const c = a * x + b;
      const { opciones, correcta } = armar(x, [c - b, -x === x ? x + 2 : -x, x + rndNZ(-2, 2)]);
      return {
        texto: `Resuelve: ${a}x ${b >= 0 ? "+ " + b : "− " + Math.abs(b)} = ${c}`,
        opciones, correcta,
        explica: `Primero: ${a}x = ${c} ${b >= 0 ? "− " + b : "+ " + Math.abs(b)} = ${a * x}. Luego x = ${a * x} ÷ ${a} = ${x}.`,
      };
    }
    const x = rndNZ(-6, 6), a = rnd(3, 8), c = rnd(1, a - 1), b = rndNZ(-10, 10);
    const d = (a - c) * x + b;
    const { opciones, correcta } = armar(x, [-x === x ? x + 2 : -x, x + rndNZ(-3, 3), d]);
    return {
      texto: `Resuelve: ${a}x ${b >= 0 ? "+ " + b : "− " + Math.abs(b)} = ${c}x ${d >= 0 ? "+ " + d : "− " + Math.abs(d)}`,
      opciones, correcta,
      explica: `Junta las x de un lado: ${a}x − ${c}x = ${a - c}x. Y los números del otro: ${d} ${b >= 0 ? "− " + b : "+ " + Math.abs(b)} = ${d - b}. Entonces x = ${d - b} ÷ ${a - c} = ${x}.`,
    };
  },
  P2: (nv) => {
    if (nv === 1) {
      const m = rndNZ(-3, 3), b = rndNZ(-5, 5), x0 = rndNZ(-4, 4);
      const y0 = m * x0 + b;
      const { opciones, correcta } = armar(y0, [m * x0 - b, m + b * x0, y0 + rndNZ(-3, 3)]);
      return {
        texto: `Para la recta y = ${m}x ${b >= 0 ? "+ " + b : "− " + Math.abs(b)}, ¿cuánto vale y cuando x = ${x0}?`,
        opciones, correcta,
        explica: `Sustituye: y = ${m}(${x0}) ${b >= 0 ? "+ " + b : "− " + Math.abs(b)} = ${m * x0} ${b >= 0 ? "+ " + b : "− " + Math.abs(b)} = ${y0}.`,
        plot: { kind: "recta", m, b, points: [{ x: x0, y: y0 }] },
      };
    }
    if (nv === 2) {
      const m = rndNZ(-3, 3), x1 = rnd(-4, 0), dx = rnd(1, 4);
      const x2 = x1 + dx, b = rndNZ(-4, 4);
      const y1 = m * x1 + b, y2 = m * x2 + b;
      const { opciones, correcta } = armar(m, [-m === m ? m + 1 : -m, m + rndNZ(-2, 2), dx]);
      return {
        texto: `¿Cuál es la pendiente de la recta que pasa por (${x1}, ${y1}) y (${x2}, ${y2})?`,
        opciones, correcta,
        explica: `m = (y₂ − y₁)/(x₂ − x₁) = (${y2} − ${y1})/(${x2} − ${x1}) = ${y2 - y1}/${dx} = ${m}.`,
        plot: { kind: "recta", m, b, points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] },
      };
    }
    const m = rndNZ(-3, 3), b = rndNZ(-5, 5), x0 = rndNZ(-4, 4);
    const y0 = m * x0 + b;
    const { opciones, correcta } = armar(b, [y0, m, b + rndNZ(-3, 3)]);
    return {
      texto: `Una recta con pendiente m = ${m} pasa por el punto (${x0}, ${y0}). ¿Cuánto vale b (ordenada al origen) en y = mx + b?`,
      opciones, correcta,
      explica: `Despeja b: b = y − mx = ${y0} − (${m})(${x0}) = ${y0} − ${m * x0 >= 0 ? m * x0 : "(" + m * x0 + ")"} = ${b}.`,
      plot: { kind: "recta", m, b, points: [{ x: x0, y: y0 }] },
    };
  },
  P3: (nv) => {
    const x0 = rndNZ(-5, 5), y0 = rndNZ(-5, 5);
    if (nv === 1) {
      const a = rnd(2, 4);
      const c1 = x0 + y0, c2 = a * x0 + y0;
      const { opciones, correcta } = armar(x0, [y0 === x0 ? x0 + 1 : y0, -x0 === x0 ? x0 + 2 : -x0, x0 + rndNZ(-2, 2)]);
      return {
        texto: `Del sistema:  x + y = ${c1}  ;  ${a}x + y = ${c2}.  ¿Cuánto vale x?`,
        opciones, correcta,
        explica: `Resta las ecuaciones (método de reducción): ${a}x − x = ${c2} − ${c1 >= 0 ? c1 : "(" + c1 + ")"} → ${a - 1}x = ${c2 - c1} → x = ${x0}.`,
      };
    }
    if (nv === 2) {
      const a1 = rnd(2, 4), a2 = rnd(1, 3);
      const c1 = a1 * x0 + y0, c2 = a2 * x0 - y0;
      const { opciones, correcta } = armar(y0, [x0 === y0 ? y0 + 1 : x0, -y0 === y0 ? y0 + 2 : -y0, y0 + rndNZ(-2, 2)]);
      return {
        texto: `Del sistema:  ${a1}x + y = ${c1}  ;  ${a2 === 1 ? "" : a2}x − y = ${c2}.  ¿Cuánto vale y?`,
        opciones, correcta,
        explica: `Suma las ecuaciones para eliminar y: ${a1 + a2}x = ${c1 + c2} → x = ${x0}. Sustituye: y = ${c1} − ${a1}(${x0}) = ${y0}.`,
      };
    }
    const a1 = rnd(2, 3), b1 = rnd(1, 2), b2 = rnd(1, 3);
    const c1 = a1 * x0 + b1 * y0, c2 = x0 + b2 * y0;
    const c = `x = ${x0}, y = ${y0}`;
    const { opciones, correcta } = armar(c, [`x = ${y0}, y = ${x0}`, `x = ${-x0 === x0 ? x0 + 1 : -x0}, y = ${y0}`, `x = ${x0}, y = ${-y0 === y0 ? y0 + 1 : -y0}`]);
    return {
      texto: `Resuelve el sistema:  ${a1}x + ${b1 === 1 ? "" : b1}y = ${c1}  ;  x + ${b2 === 1 ? "" : b2}y = ${c2}`,
      opciones, correcta,
      explica: `De la segunda: x = ${c2} − ${b2 === 1 ? "" : b2}y. Sustituye en la primera (método de sustitución) y resuelve: y = ${y0}, luego x = ${x0}. Comprueba: ${a1}(${x0}) + ${b1}(${y0}) = ${c1} ✓`,
    };
  },
  P4: (nv) => {
    if (nv === 1) {
      const n = rnd(2, 12);
      const k = n * n;
      const c = `x = ${n} y x = −${n}`;
      const { opciones, correcta } = armar(c, [`x = ${n}`, `x = ${k / 2}`, `x = ${n} y x = ${n}`]);
      return {
        texto: `Resuelve: x² = ${k}`,
        opciones, correcta,
        explica: `x = ±√${k} = ±${n}. Una cuadrática tiene hasta dos soluciones: ${n} y −${n}.`,
      };
    }
    const r1 = rndNZ(-6, 6);
    let r2 = rndNZ(-6, 6); if (r2 === r1) r2 = r1 > 0 ? r1 - 1 || -1 : r1 + 1 || 1;
    const B = -(r1 + r2), C = r1 * r2;
    const eq = `x² ${B >= 0 ? (B === 0 ? "" : "+ " + (B === 1 ? "" : B) + "x") : "− " + (B === -1 ? "" : Math.abs(B)) + "x"} ${C >= 0 ? "+ " + C : "− " + Math.abs(C)} = 0`;
    if (nv === 2) {
      const { opciones, correcta } = armar(r1, [-r1 === r1 ? r1 + 1 : -r1, r2, C]);
      return {
        texto: `Una de las soluciones de ${eq} es:`,
        opciones, correcta,
        explica: `Se factoriza: (x ${r1 >= 0 ? "− " + r1 : "+ " + Math.abs(r1)})(x ${r2 >= 0 ? "− " + r2 : "+ " + Math.abs(r2)}) = 0. Las soluciones son x = ${r1} y x = ${r2}. También sale con la fórmula general.`,
      };
    }
    const c = `x = ${r1} y x = ${r2}`;
    const { opciones, correcta } = armar(c, [`x = ${-r1 === r1 ? r1 + 1 : -r1} y x = ${-r2 === r2 ? r2 + 1 : -r2}`, `x = ${r1 + r2} y x = ${r1 * r2}`, `x = ${r1} y x = ${-r2 === r2 ? r2 + 1 : -r2}`]);
    return {
      texto: `Resuelve con fórmula general o factorización: ${eq}`,
      opciones, correcta,
      explica: `Se factoriza como (x ${r1 >= 0 ? "− " + r1 : "+ " + Math.abs(r1)})(x ${r2 >= 0 ? "− " + r2 : "+ " + Math.abs(r2)}) = 0, o se aplica la fórmula general. Soluciones: x = ${r1} y x = ${r2}. Comprueba sustituyendo cada una.`,
    };
  },
  P5: (nv) => {
    if (nv === 1) {
      const C = pick([1000, 2000, 5000, 10000]), i = pick([5, 10, 8, 12]), t = rnd(1, 3);
      const I = (C * i * t) / 100;
      const { opciones, correcta } = armar(I.toLocaleString("es-MX"), [((C * i) / 100).toLocaleString("es-MX"), (I * 2).toLocaleString("es-MX"), (C + I).toLocaleString("es-MX")]);
      return {
        texto: `Se ahorran $${C.toLocaleString("es-MX")} al ${i}% de interés simple anual durante ${t} año${t > 1 ? "s" : ""}. ¿Cuánto interés se gana?`,
        opciones, correcta,
        explica: `I = C · i · t = ${C.toLocaleString("es-MX")} × ${i}/100 × ${t} = $${I.toLocaleString("es-MX")}.`,
      };
    }
    if (nv === 2) {
      const C = pick([2000, 4000, 5000, 8000]), i = pick([5, 10, 15]), t = rnd(1, 3);
      const M = C + (C * i * t) / 100;
      const { opciones, correcta } = armar(M.toLocaleString("es-MX"), [((C * i * t) / 100).toLocaleString("es-MX"), (M - C / 10).toLocaleString("es-MX"), (C * (1 + i / 100)).toLocaleString("es-MX")]);
      return {
        texto: `Un préstamo de $${C.toLocaleString("es-MX")} al ${i}% simple anual se paga a los ${t} año${t > 1 ? "s" : ""}. ¿Cuál es el monto total a pagar?`,
        opciones, correcta,
        explica: `M = C(1 + i·t) = ${C.toLocaleString("es-MX")} × (1 + ${i}/100 × ${t}) = $${M.toLocaleString("es-MX")}. El monto es capital + interés.`,
      };
    }
    const P = pick([100, 200, 400, 500]), tasa = pick([10, 20, 50]);
    const P1v = P * (1 + tasa / 100), P2v = P1v * (1 + tasa / 100);
    const { opciones, correcta } = armar(P2v.toLocaleString("es-MX"), [(P * (1 + (2 * tasa) / 100)).toLocaleString("es-MX"), P1v.toLocaleString("es-MX"), (P2v + P / 10).toLocaleString("es-MX")]);
    return {
      texto: `Una población de ${P} bacterias crece ${tasa}% cada hora. ¿Cuántas habrá después de 2 horas? (crecimiento compuesto)`,
      opciones, correcta,
      explica: `Hora 1: ${P} × ${1 + tasa / 100} = ${P1v.toLocaleString("es-MX")}. Hora 2: ${P1v.toLocaleString("es-MX")} × ${1 + tasa / 100} = ${P2v.toLocaleString("es-MX")}. El % se aplica sobre el nuevo total, no sobre el inicial.`,
    };
  },
  P6: (nv, _d) => {
    if (nv === 1) {
      const a = rnd(30, 80), b = rnd(30, 80);
      const c = 180 - a - b;
      if (c < 15 && (_d || 0) < 10) return GEN_PM3.P6(1, (_d || 0) + 1);
      const cc = Math.max(c, 15);
      const { opciones, correcta } = armar(cc + "°", [180 - a + "°", 90 - (a % 60) + "°", cc + 10 + "°"]);
      return {
        texto: `En un triángulo, dos ángulos miden ${a}° y ${180 - a - cc}°. ¿Cuánto mide el tercero?`,
        opciones, correcta,
        explica: `Los ángulos internos de todo triángulo suman 180°: 180 − ${a} − ${180 - a - cc} = ${cc}°.`,
      };
    }
    const triples = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17]];
    const [ca, cb, hip] = pick(triples);
    if (nv === 2) {
      const { opciones, correcta } = armar(hip, [ca + cb, hip + 1, hip - 1]);
      return {
        texto: `Un triángulo rectángulo tiene catetos de ${ca} m y ${cb} m. ¿Cuánto mide la hipotenusa? (Pitágoras)`,
        opciones, correcta,
        explica: `c² = ${ca}² + ${cb}² = ${ca * ca} + ${cb * cb} = ${ca * ca + cb * cb}. Entonces c = √${ca * ca + cb * cb} = ${hip} m. La escuadra 3-4-5 de los albañiles usa esto mismo.`,
      };
    }
    const { opciones, correcta } = armar(cb, [hip - ca, cb + 1, Math.round(Math.sqrt(hip * hip + ca * ca))]);
    return {
      texto: `Una escalera de ${hip} m se apoya en un muro; su base queda a ${ca} m de la pared. ¿A qué altura llega la escalera?`,
      opciones, correcta,
      explica: `Es el cateto que falta: b² = ${hip}² − ${ca}² = ${hip * hip} − ${ca * ca} = ${cb * cb}. Entonces b = √${cb * cb} = ${cb} m.`,
    };
  },
};

// ---------------------------- GENERADORES PM II y PM IV (verificados: 15,600 gen / 0 err)
// r2 y sup: utilidades compartidas por los generadores nuevos
function r2(x) { return Math.round(x * 100) / 100; }
const sup = (n) => ({ 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸" }[n] || "^" + n);

const GEN_PM2 = {
  // PF1 · lenguaje algebraico
  PF1: (nv) => {
    if (nv === 1) {
      const casos = [
        { f: "el doble de un número n", e: "2n" }, { f: "el triple de un número n", e: "3n" },
        { f: "un número n aumentado en 5", e: "n + 5" }, { f: "un número n disminuido en 4", e: "n − 4" },
        { f: "la mitad de un número n", e: "n/2" }, { f: "el cuadrado de un número n", e: "n²" },
      ];
      const c = pick(casos);
      const { opciones, correcta } = armar(c.e, ["n + " + rnd(2, 9), rnd(2, 5) + "n", "n − " + rnd(2, 9)].filter((x) => x !== c.e));
      return { texto: `Traduce a lenguaje algebraico: «${c.f}».`, opciones, correcta, explica: `«${c.f}» se escribe ${c.e}. El lenguaje algebraico usa letras para representar cantidades desconocidas.` };
    }
    if (nv === 2) {
      const n = rnd(2, 8), a = rnd(2, 6), b = rnd(1, 9);
      const r = a * n + b;
      const { opciones, correcta } = armar(r, [a + n + b, a * n - b, a * (n + b)]);
      return { texto: `Si n = ${n}, ¿cuánto vale la expresión ${a}n + ${b}?`, opciones, correcta, explica: `Sustituye n = ${n}: ${a}(${n}) + ${b} = ${a * n} + ${b} = ${r}.` };
    }
    const cuota = rnd(20, 60), porHora = rnd(8, 20), h = rnd(2, 6);
    const r = cuota + porHora * h;
    const { opciones, correcta } = armar(r, [cuota * h + porHora, (cuota + porHora) * h, cuota + porHora]);
    return { texto: `Un taller cobra $${cuota} fijos más $${porHora} por hora. El costo total es C = ${cuota} + ${porHora}h. ¿Cuánto cuesta un trabajo de ${h} horas?`, opciones, correcta, explica: `C = ${cuota} + ${porHora}(${h}) = ${cuota} + ${porHora * h} = $${r}.` };
  },
  // PF2 · clasificación de expresiones
  PF2: (nv) => {
    if (nv === 1) {
      const casos = [
        { e: "5x", t: "monomio" }, { e: "3x + 2", t: "binomio" }, { e: "x² + x + 1", t: "trinomio" },
        { e: "7xy", t: "monomio" }, { e: "2a − b", t: "binomio" }, { e: "x³ + x² + x + 1", t: "polinomio" },
      ];
      const c = pick(casos);
      const { opciones, correcta } = armar(c.t, ["monomio", "binomio", "trinomio", "polinomio"].filter((x) => x !== c.t));
      return { texto: `¿Cómo se clasifica la expresión ${c.e} por su número de términos?`, opciones, correcta, explica: `${c.e} tiene ${c.t === "monomio" ? "un término (monomio)" : c.t === "binomio" ? "dos términos (binomio)" : c.t === "trinomio" ? "tres términos (trinomio)" : "cuatro o más términos (polinomio)"}.` };
    }
    if (nv === 2) {
      const coef = rndNZ(-9, 9), e1 = rnd(1, 4), e2 = rnd(1, 3);
      const grado = e1 + e2;
      const { opciones, correcta } = armar(grado, [e1, e2, e1 * e2]);
      return { texto: `¿Cuál es el grado del monomio ${coef}x${sup(e1)}y${sup(e2)}?`, opciones, correcta, explica: `El grado de un monomio es la suma de los exponentes de sus variables: ${e1} + ${e2} = ${grado}.` };
    }
    const coef = rndNZ(2, 9), e1 = rnd(2, 4);
    const { opciones, correcta } = armar(coef, [e1, coef + e1, coef * e1]);
    return { texto: `En el monomio ${coef}x${sup(e1)}, ¿cuál es el coeficiente?`, opciones, correcta, explica: `El coeficiente es el número que multiplica a la variable: ${coef}. El exponente (${e1}) es distinto del coeficiente.` };
  },
  // PF3 · operaciones con monomios y binomios
  PF3: (nv) => {
    if (nv === 1) {
      const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9);
      const r = a + c; // ax + bx? use like terms: a x + c x with same var
      const { opciones, correcta } = armar(`${a + c}x`, [`${a * c}x`, `${a + c}x²`, `${Math.abs(a - c)}x`]);
      return { texto: `Simplifica: ${a}x + ${c}x`, opciones, correcta, explica: `Términos semejantes: se suman los coeficientes. ${a}x + ${c}x = ${a + c}x.` };
    }
    if (nv === 2) {
      const a = rnd(2, 6), b = rnd(2, 6), e1 = rnd(2, 4), e2 = rnd(2, 4);
      const r = `${a * b}x${sup(e1 + e2)}`;
      const { opciones, correcta } = armar(r, [`${a + b}x${sup(e1 + e2)}`, `${a * b}x${sup(e1 * e2)}`, `${a * b}x${sup(Math.abs(e1 - e2) || 1)}`]);
      return { texto: `Multiplica: (${a}x${sup(e1)})(${b}x${sup(e2)})`, opciones, correcta, explica: `Multiplica coeficientes (${a}×${b}=${a * b}) y suma exponentes de la misma base (${e1}+${e2}=${e1 + e2}): ${r}.` };
    }
    const f = rnd(2, 5), a = rnd(2, 6), b = rnd(2, 6);
    const r = `${f}x(${a}x + ${b})`; // factored form check: expand f*a x² + f*b x
    const exp = `${f * a}x² + ${f * b}x`;
    const { opciones, correcta } = armar(`${f}x(${a}x + ${b})`, [`${f}x(${a}x − ${b})`, `${f}(${a}x + ${b})`, `x(${f * a}x + ${f * b})`]);
    return { texto: `Factoriza sacando el factor común: ${exp}`, opciones, correcta, explica: `El factor común es ${f}x: ${exp} = ${f}x(${a}x + ${b}).` };
  },
  // PF4 · trinomios, polinomios y productos notables
  PF4: (nv) => {
    if (nv === 1) {
      const a = rnd(1, 6), b = rnd(1, 6), c = rnd(1, 6), d = rnd(1, 6);
      const r = `${a + c}x + ${b + d}`;
      const { opciones, correcta } = armar(r, [`${a + c}x + ${b * d}`, `${a * c}x + ${b + d}`, `${a + c}x − ${b + d}`]);
      return { texto: `Suma: (${a}x + ${b}) + (${c}x + ${d})`, opciones, correcta, explica: `Suma términos semejantes: (${a}+${c})x = ${a + c}x, y ${b}+${d} = ${b + d}. Resultado: ${r}.` };
    }
    if (nv === 2) {
      const n = rnd(2, 9);
      const r = `x² + ${2 * n}x + ${n * n}`;
      const { opciones, correcta } = armar(r, [`x² + ${n}x + ${n * n}`, `x² + ${2 * n}x + ${n}`, `x² + ${n * n}x + ${2 * n}`]);
      return { texto: `Desarrolla el producto notable: (x + ${n})²`, opciones, correcta, explica: `(a+b)² = a² + 2ab + b². Con a=x, b=${n}: x² + 2(${n})x + ${n}² = ${r}.` };
    }
    const n = rnd(2, 9);
    const r = `(x + ${n})(x − ${n})`;
    const { opciones, correcta } = armar(`x² − ${n * n}`, [`x² + ${n * n}`, `x² − ${n}`, `x² − ${2 * n}x + ${n * n}`]);
    return { texto: `Desarrolla los binomios conjugados: (x + ${n})(x − ${n})`, opciones, correcta, explica: `(a+b)(a−b) = a² − b². Con a=x, b=${n}: x² − ${n}² = x² − ${n * n}.` };
  },
  // PF5 · el álgebra en situaciones (presupuesto, recetas, %)
  PF5: (nv) => {
    if (nv === 1) {
      const p = pick([10, 20, 25, 50]), base = pick([80, 120, 200, 240, 300]);
      const r = (p * base) / 100;
      const { opciones, correcta } = armar(r, [r * 2, r / 2, r + 10]);
      return { texto: `¿Cuánto es el ${p}% de $${base}?`, opciones, correcta, explica: `${p}% = ${p}/100. ${p}/100 × ${base} = $${r}.` };
    }
    if (nv === 2) {
      const base = rnd(4, 20) * 50, d = pick([10, 15, 20, 25, 30]);
      const r = base * (1 - d / 100);
      const { opciones, correcta } = armar(r, [base - d, (base * d) / 100, base * (1 + d / 100)]);
      return { texto: `Una prenda de $${base} tiene ${d}% de descuento. ¿Cuál es el precio final?`, opciones, correcta, explica: `Descuento = ${d}% de ${base} = $${(base * d) / 100}. Precio final = ${base} − ${(base * d) / 100} = $${r}.` };
    }
    const pers1 = pick([4, 6, 8]), g = rnd(4, 12) * pers1, pers2 = pick([2, 3, 10, 12]);
    const porPersona = g / pers1, r = porPersona * pers2;
    const { opciones, correcta } = armar(r, [g * pers2, r + porPersona, (g / pers2) * pers1]);
    return { texto: `Una receta para ${pers1} personas usa ${g} g de harina. ¿Cuánta harina se necesita para ${pers2} personas?`, opciones, correcta, explica: `Por persona: ${g} ÷ ${pers1} = ${porPersona} g. Para ${pers2}: ${porPersona} × ${pers2} = ${r} g.` };
  },
  // PF6 · concepto de ecuación
  PF6: (nv) => {
    if (nv === 1) {
      const x = rnd(2, 20), a = rnd(1, 15), b = x + a;
      const { opciones, correcta } = armar(x, [b + a, b, a]);
      return { texto: `Resuelve la ecuación: x + ${a} = ${b}`, opciones, correcta, explica: `Resta ${a} a ambos lados: x = ${b} − ${a} = ${x}.` };
    }
    if (nv === 2) {
      const x = rnd(2, 12), a = rnd(2, 9), b = a * x;
      const { opciones, correcta } = armar(x, [b, b - a, a]);
      return { texto: `Resuelve la ecuación: ${a}x = ${b}`, opciones, correcta, explica: `Divide ambos lados entre ${a}: x = ${b} ÷ ${a} = ${x}.` };
    }
    const casos = [
      { e: "2(x + 3) = 2x + 6", t: "identidad" }, { e: "3x + 1 = 10", t: "ecuación" },
      { e: "5(x − 1) = 5x − 5", t: "identidad" }, { e: "4x = 20", t: "ecuación" },
    ];
    const c = pick(casos);
    const { opciones, correcta } = armar(c.t, ["identidad", "ecuación"].filter((x) => x !== c.t).concat(["ninguna", "ambas"]));
    return { texto: `¿La igualdad ${c.e} es una identidad (se cumple para cualquier x) o una ecuación (solo para ciertos valores)?`, opciones, correcta, explica: `${c.e} es ${c.t === "identidad" ? "una identidad: al simplificar, ambos lados son idénticos para cualquier x." : "una ecuación: solo se cumple para un valor específico de x."}` };
  },
};

// ══════════════ PM IV · Trigonometría y geometría analítica (7 propósitos) ══════════════
const GEN_PM4 = {
  // PF1 · punto y recta
  PF1: (nv) => {
    if (nv === 1) {
      const triples = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]];
      const [dx, dy, d] = pick(triples);
      const { opciones, correcta } = armar(d, [dx + dy, d + 1, Math.round(Math.sqrt(dx * dx + dy * dy)) + 2]);
      return { texto: `¿Cuál es la distancia entre los puntos A(0, 0) y B(${dx}, ${dy})?`, opciones, correcta, explica: `d = √[(${dx})² + (${dy})²] = √[${dx * dx} + ${dy * dy}] = √${dx * dx + dy * dy} = ${d}.` };
    }
    if (nv === 2) {
      const x1 = rnd(0, 6) * 2, y1 = rnd(0, 6) * 2, x2 = rnd(0, 6) * 2, y2 = rnd(0, 6) * 2;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const { opciones, correcta } = armar(`(${mx}, ${my})`, [`(${x1 + x2}, ${y1 + y2})`, `(${Math.abs(x2 - x1)}, ${Math.abs(y2 - y1)})`, `(${my}, ${mx})`]);
      return { texto: `¿Cuál es el punto medio entre M(${x1}, ${y1}) y N(${x2}, ${y2})?`, opciones, correcta, explica: `Punto medio = ((x₁+x₂)/2, (y₁+y₂)/2) = ((${x1}+${x2})/2, (${y1}+${y2})/2) = (${mx}, ${my}).` };
    }
    const r = rnd(3, 8);
    const { opciones, correcta } = armar("tangente", ["secante", "tangente", "no la toca", "diámetro"].filter((x, i, s) => s.indexOf(x) === i));
    return { texto: `La circunferencia x² + y² = ${r * r} tiene radio ${r}. La recta x = ${r} la toca en un solo punto. ¿Es tangente o secante?`, opciones, correcta, explica: `Tocar la circunferencia en un solo punto es la definición de recta tangente (en este caso, el punto (${r}, 0)).` };
  },
  // PF2 · razones trigonométricas
  PF2: (nv) => {
    const triples = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17]];
    const [op, ad, hip] = pick(triples);
    if (nv === 1) {
      const { opciones, correcta } = armar(`${op}/${hip}`, [`${ad}/${hip}`, `${op}/${ad}`, `${hip}/${op}`]);
      return { texto: `En un triángulo rectángulo, el cateto opuesto a θ mide ${op} y la hipotenusa ${hip}. ¿Cuánto vale sen θ?`, opciones, correcta, explica: `sen θ = cateto opuesto / hipotenusa = ${op}/${hip}.` };
    }
    if (nv === 2) {
      const { opciones, correcta } = armar(`${ad}/${hip}`, [`${op}/${hip}`, `${ad}/${op}`, `${hip}/${ad}`]);
      return { texto: `Triángulo rectángulo con cateto adyacente a θ = ${ad} e hipotenusa ${hip}. ¿Cuánto vale cos θ?`, opciones, correcta, explica: `cos θ = cateto adyacente / hipotenusa = ${ad}/${hip}.` };
    }
    const { opciones, correcta } = armar("1", ["0", "2", `${op}/${hip}`]);
    return { texto: `Para cualquier ángulo agudo θ, ¿cuánto vale sen²θ + cos²θ? (identidad pitagórica)`, opciones, correcta, explica: `La identidad pitagórica fundamental dice que sen²θ + cos²θ = 1, para todo ángulo θ.` };
  },
  // PF3 · polinomios de dos variables en el plano
  PF3: (nv) => {
    if (nv === 1) {
      const x = rnd(1, 5), y = rnd(1, 5);
      const r = x * x + y * y;
      const { opciones, correcta } = armar(r, [x + y, x * y, (x + y) * (x + y)]);
      return { texto: `Evalúa P(x, y) = x² + y² en el punto (${x}, ${y}).`, opciones, correcta, explica: `P(${x}, ${y}) = ${x}² + ${y}² = ${x * x} + ${y * y} = ${r}.` };
    }
    if (nv === 2) {
      const r2v = rnd(3, 7);
      const { opciones, correcta } = armar("sí pertenece", ["no pertenece", "sí pertenece", "solo si x=0", "faltan datos"].filter((x, i, s) => s.indexOf(x) === i));
      return { texto: `¿El punto (${r2v}, 0) pertenece a la curva x² + y² = ${r2v * r2v}?`, opciones, correcta, explica: `Sustituye: ${r2v}² + 0² = ${r2v * r2v}, que es igual al lado derecho. Sí pertenece (es un círculo de radio ${r2v}).` };
    }
    const { opciones, correcta } = armar("eje y", ["eje x", "origen", "ninguna"]);
    return { texto: `La curva y = x² es simétrica respecto a…`, opciones, correcta, explica: `Al sustituir x por −x: y = (−x)² = x², idéntica. Por eso es simétrica respecto al eje y.` };
  },
  // PF4 · ecuación de la recta
  PF4: (nv) => {
    if (nv === 1) {
      const x1 = rnd(0, 4), y1 = rnd(0, 4), dx = rnd(1, 4), dy = rnd(1, 5) * rnd(1, 3);
      const x2 = x1 + dx, y2 = y1 + dy;
      const m = dy / dx;
      const { opciones, correcta } = armar(Number.isInteger(m) ? m : r2(m), [dx / dy, dy + dx, -m]);
      return { texto: `¿Cuál es la pendiente de la recta que pasa por (${x1}, ${y1}) y (${x2}, ${y2})?`, opciones, correcta, explica: `m = (y₂−y₁)/(x₂−x₁) = (${y2}−${y1})/(${x2}−${x1}) = ${dy}/${dx} = ${Number.isInteger(m) ? m : r2(m)}.` };
    }
    if (nv === 2) {
      const m = rndNZ(-4, 4), b = rndNZ(-6, 6);
      const { opciones, correcta } = armar(`y = ${m}x ${b >= 0 ? "+ " + b : "− " + -b}`, [`y = ${b}x ${m >= 0 ? "+ " + m : "− " + -m}`, `y = ${m}x ${b >= 0 ? "− " + b : "+ " + -b}`, `y = ${m + 1}x ${b >= 0 ? "+ " + b : "− " + -b}`]);
      return { texto: `Escribe la ecuación de la recta con pendiente m = ${m} y ordenada al origen b = ${b}. (forma y = mx + b)`, opciones, correcta, explica: `Sustituye directamente en y = mx + b: y = ${m}x ${b >= 0 ? "+ " + b : "− " + -b}.` };
    }
    const m = rndNZ(-3, 3), b = rndNZ(-5, 5), x = rnd(1, 5);
    const y = m * x + b;
    const { opciones, correcta } = armar(y, [m + x + b, m * (x + b), y + m]);
    return { texto: `Para la recta y = ${m}x ${b >= 0 ? "+ " + b : "− " + -b}, ¿cuánto vale y cuando x = ${x}?`, opciones, correcta, explica: `y = ${m}(${x}) ${b >= 0 ? "+ " + b : "− " + -b} = ${m * x} ${b >= 0 ? "+ " + b : "− " + -b} = ${y}.` };
  },
  // PF5 · la parábola
  PF5: (nv) => {
    if (nv === 1) {
      const h = rndNZ(-4, 4), k = rndNZ(-5, 5);
      const { opciones, correcta } = armar(`(${h}, ${k})`, [`(${k}, ${h})`, `(${-h}, ${k})`, `(${h}, ${-k})`]);
      return { texto: `¿Cuál es el vértice de la parábola y = (x ${h >= 0 ? "− " + h : "+ " + -h})² ${k >= 0 ? "+ " + k : "− " + -k}?`, opciones, correcta, explica: `En la forma y = (x−h)² + k, el vértice es (h, k) = (${h}, ${k}).` };
    }
    if (nv === 2) {
      const a = rndNZ(-3, 3);
      const { opciones, correcta } = armar(a > 0 ? "hacia arriba" : "hacia abajo", ["hacia arriba", "hacia abajo", "hacia la derecha", "hacia la izquierda"].filter((x, i, s) => s.indexOf(x) === i));
      return { texto: `¿Hacia dónde abre la parábola y = ${a}x²?`, opciones, correcta, explica: `El signo del coeficiente de x² decide: ${a} es ${a > 0 ? "positivo → abre hacia arriba (vértice mínimo)" : "negativo → abre hacia abajo (vértice máximo)"}.` };
    }
    const g = rnd(4, 6), tMax = rnd(2, 5);
    const a = -5, b = 10 * tMax; // h(t) = -5t² + b t, vértice en t = b/10 = tMax
    const hMax = a * tMax * tMax + b * tMax;
    const { opciones, correcta } = armar(tMax + " s", [b + " s", (b / 5) + " s", (tMax + 1) + " s"]);
    return { texto: `La altura de un balón es h(t) = −5t² + ${b}t. ¿En qué tiempo alcanza su altura máxima? (vértice: t = −b/2a)`, opciones, correcta, explica: `t = −b/(2a) = −${b}/(2·−5) = ${b}/10 = ${tMax} s. Ahí está el vértice (altura máxima ${hMax} m).` };
  },
  // PF6 · circunferencia, elipse y Kepler
  PF6: (nv) => {
    if (nv === 1) {
      const r = rnd(2, 10);
      const { opciones, correcta } = armar(`x² + y² = ${r * r}`, [`x² + y² = ${r}`, `x² + y² = ${2 * r}`, `x + y = ${r * r}`]);
      return { texto: `Escribe la ecuación de la circunferencia con centro en el origen y radio ${r}.`, opciones, correcta, explica: `Con centro en (0,0): x² + y² = r². Con r = ${r}: x² + y² = ${r * r}.` };
    }
    if (nv === 2) {
      const r = rnd(2, 12);
      const { opciones, correcta } = armar(r, [r * r, r / 2, 2 * r]);
      return { texto: `¿Cuál es el radio de la circunferencia x² + y² = ${r * r}?`, opciones, correcta, explica: `x² + y² = r², así que r² = ${r * r} y r = √${r * r} = ${r}.` };
    }
    const { opciones, correcta } = armar("elíptica, con el Sol en un foco", ["circular, con el Sol en el centro", "elíptica, con el Sol en un foco", "recta", "espiral"].filter((x, i, s) => s.indexOf(x) === i));
    return { texto: `Según la primera ley de Kepler, ¿qué forma tienen las órbitas planetarias?`, opciones, correcta, explica: `La primera ley de Kepler (1609) establece que las órbitas son elípticas, con el Sol en uno de los focos — no en el centro.` };
  },
  // PF7 · secciones cónicas
  PF7: (nv) => {
    const casos = [
      { e: "x² + y² = 9", t: "circunferencia" }, { e: "y = x² + 1", t: "parábola" },
      { e: "x²/4 + y²/9 = 1", t: "elipse" }, { e: "x²/4 − y²/9 = 1", t: "hipérbola" },
    ];
    let c;
    if (nv === 1) c = pick(casos.slice(0, 2));
    else if (nv === 2) c = pick(casos.slice(0, 3));
    else c = pick(casos);
    const { opciones, correcta } = armar(c.t, ["circunferencia", "parábola", "elipse", "hipérbola"].filter((x) => x !== c.t));
    return { texto: `Identifica la sección cónica: ${c.e}`, opciones, correcta, explica: `${c.e} es una ${c.t}. ${c.t === "circunferencia" ? "x² y y² con igual coeficiente y signo +." : c.t === "parábola" ? "Solo una variable está al cuadrado." : c.t === "elipse" ? "Los términos se suman con denominadores distintos." : "Los términos se restan."}` };
  },
};


// ---------------------------- GENERADORES NUEVOS: PM V, PM VI, CNEyT I-VI
// Helpers asumidos ya definidos en el archivo principal: rnd, rndNZ, pick, armar, r2

const GEN_PM5 = {
  // PF1 · Origen del cálculo: variación
  PF1: (nv) => {
    const x1 = rnd(1, 5), x2 = x1 + rnd(1, 4);
    const m = rndNZ(1, 5);
    const y1 = m * x1 * x1, y2 = m * x2 * x2; // f(x)=mx²
    const tvm = r2((y2 - y1) / (x2 - x1));
    const { opciones, correcta } = armar(tvm, [r2((y2 - y1) / x2), r2(y2 - y1), tvm + rnd(1, 3)]);
    return { texto: `Para f(x) = ${m}x², calcula la tasa de variación promedio entre x = ${x1} y x = ${x2}.`, opciones, correcta,
      explica: `TVM = (f(${x2})−f(${x1}))/(${x2}−${x1}) = (${y2}−${y1})/${x2 - x1} = ${tvm}. Es la pendiente de la recta secante entre esos dos puntos.` };
  },
  // PF2 · Recta tangente y movimiento
  PF2: (nv) => {
    const { opciones, correcta } = armar("la recta tangente", ["la recta secante", "el eje x", "una asíntota"]);
    return { texto: `En el estudio del movimiento, la velocidad instantánea de un objeto en un punto se representa gráficamente como la pendiente de…`, opciones, correcta,
      explica: `La velocidad instantánea es el límite de la velocidad promedio cuando el intervalo de tiempo tiende a cero: geométricamente, es la pendiente de la recta tangente a la curva posición-tiempo en ese punto.` };
  },
  // PF3 · Funciones y su representación gráfica
  PF3: (nv) => {
    const casos = [{ f: "f(x) = x²", t: "par (simétrica al eje y)" }, { f: "f(x) = x³", t: "impar (simétrica al origen)" }, { f: "f(x) = x⁴ + 1", t: "par (simétrica al eje y)" }];
    const c = pick(casos);
    const { opciones, correcta } = armar(c.t, ["par (simétrica al eje y)", "impar (simétrica al origen)", "ninguna simetría"].filter(x => x !== c.t));
    return { texto: `¿Qué tipo de simetría tiene la función ${c.f}?`, opciones, correcta, explica: `${c.f} es ${c.t}: verifica sustituyendo x por −x y comparando con f(x) o con −f(x).` };
  },
  // PF4 · El concepto de límite
  PF4: (nv) => {
    const a = rnd(1, 4), b = rnd(1, 6);
    const x0 = rnd(1, 5);
    const L = a * x0 + b;
    const { opciones, correcta } = armar(L, [a * x0, L + rnd(1, 3), a + b]);
    return { texto: `Calcula: lím(x→${x0}) [${a}x + ${b}]`, opciones, correcta, explica: `Para funciones polinomiales, el límite se calcula por sustitución directa: ${a}(${x0}) + ${b} = ${L}.` };
  },
  // PF5 · Funciones trascendentes
  PF5: (nv) => {
    if (nv === 1) {
      const { opciones, correcta } = armar("1", ["0", "10", "log(10)"]);
      return { texto: `¿Cuánto vale log₁₀(10)?`, opciones, correcta, explica: `Por definición, log₁₀(10) = 1, porque 10¹ = 10.` };
    }
    const angs = [{ a: "0°", s: "0", c: "1" }, { a: "90°", s: "1", c: "0" }];
    const c = pick(angs);
    const { opciones, correcta } = armar(c.s, ["0", "1", "−1"].filter(x => x !== c.s));
    return { texto: `¿Cuánto vale sen(${c.a})?`, opciones, correcta, explica: `sen(${c.a}) = ${c.s}. Recuerda el círculo unitario: en 0° el seno es 0, en 90° el seno alcanza su valor máximo, 1.` };
  },
  // PF6 · La derivada
  PF6: (nv) => {
    const n = rnd(2, 5), coef = rnd(2, 6);
    const dcoef = coef * n;
    const { opciones, correcta } = armar(`${dcoef}x^${n - 1}`, [`${coef}x^${n - 1}`, `${dcoef}x^${n}`, `${coef * (n - 1)}x^${n - 1}`]);
    return { texto: `Deriva: f(x) = ${coef}x^${n}`, opciones, correcta, explica: `Regla de la potencia: d/dx[axⁿ] = a·n·x^(n−1). Con a=${coef}, n=${n}: f'(x) = ${coef}·${n}·x^${n - 1} = ${dcoef}x^${n - 1}.` };
  },
  // PF7 · Optimización
  PF7: (nv) => {
    const p = rnd(20, 40) * 2;
    const xMax = p / 4;
    const { opciones, correcta } = armar(xMax, [p / 2, xMax + rnd(1, 3), p]);
    return { texto: `Con ${p} m de cerca para un corral rectangular, ¿qué medida de lado x maximiza el área (A = x(${p / 2}−x))?`, opciones, correcta,
      explica: `Deriva A(x) = ${p / 2}x − x²: A'(x) = ${p / 2} − 2x. Iguala a 0: x = ${p / 2}/2 = ${xMax}. Ese es el punto crítico que maximiza el área (un cuadrado).` };
  },
  // PF8 · Teorema Fundamental del Cálculo
  PF8: (nv) => {
    const { opciones, correcta } = armar("son operaciones inversas", ["son la misma operación", "no tienen relación", "la derivada siempre es mayor"]);
    return { texto: `Según el Teorema Fundamental del Cálculo, ¿qué relación hay entre la derivada y la integral?`, opciones, correcta,
      explica: `El Teorema Fundamental del Cálculo establece que derivar e integrar son procesos inversos: integrar la derivada de una función regresa a la función original (salvo una constante).` };
  },
};

const GEN_PM6 = {
  // PF1 · Recolección de datos: determinista vs aleatorio
  PF1: (nv) => {
    const casos = [{ e: "dejar caer un objeto desde 2 m de altura", t: "determinista" }, { e: "lanzar un dado", t: "aleatorio" }, { e: "calentar agua a 100°C a nivel del mar", t: "determinista" }, { e: "el resultado de una moneda al lanzarla", t: "aleatorio" }];
    const c = pick(casos);
    const { opciones, correcta } = armar(c.t, ["determinista", "aleatorio"].filter(x => x !== c.t));
    return { texto: `Clasifica el evento: ${c.e}. ¿Es determinista o aleatorio?`, opciones, correcta, explica: `Es ${c.t}: ${c.t === "determinista" ? "bajo las mismas condiciones, siempre da el mismo resultado" : "su resultado no se puede predecir con certeza, aunque se repita en las mismas condiciones"}.` };
  },
  // PF2 · Simulación y frecuencia
  PF2: (nv) => {
    const caras = rnd(1, 6);
    const { opciones, correcta } = armar("1/6", ["1/2", "1/3", "1/12"]);
    return { texto: `Al lanzar un dado justo de 6 caras, ¿cuál es la probabilidad teórica de obtener el número ${caras}?`, opciones, correcta, explica: `Con 6 resultados igualmente probables, la probabilidad de cualquier cara específica es 1/6 (equiprobabilidad).` };
  },
  // PF3 · Teoría de conjuntos
  PF3: (nv) => {
    const a = rnd(4, 8), b = rnd(3, 7), inter = rnd(1, Math.min(a, b) - 1);
    const union = a + b - inter;
    const { opciones, correcta } = armar(union, [a + b, a + b + inter, union - 2]);
    return { texto: `El conjunto A tiene ${a} elementos, B tiene ${b}, y A∩B tiene ${inter}. ¿Cuántos elementos tiene A∪B?`, opciones, correcta, explica: `|A∪B| = |A| + |B| − |A∩B| = ${a} + ${b} − ${inter} = ${union}. Se resta la intersección porque se contó dos veces.` };
  },
  // PF4 · Técnicas de conteo
  PF4: (nv) => {
    if (nv === 1) {
      const n = rnd(3, 5);
      const fact = [1, 1, 2, 6, 24, 120][n];
      const { opciones, correcta } = armar(fact, [n * n, n, fact + n]);
      return { texto: `¿De cuántas formas distintas se pueden ordenar ${n} libros diferentes en un estante?`, opciones, correcta, explica: `Son permutaciones de ${n} elementos: ${n}! = ${Array.from({length:n},(_,i)=>i+1).join(" × ")} = ${fact}.` };
    }
    const n = rnd(4, 6), r = 2;
    const comb = (n * (n - 1)) / 2;
    const { opciones, correcta } = armar(comb, [n * (n - 1), n + (n - 1), comb + 2]);
    return { texto: `¿De cuántas formas se pueden elegir ${r} representantes de un grupo de ${n} personas (sin importar el orden)?`, opciones, correcta, explica: `Es una combinación C(${n},${r}) = ${n}×${n-1}/2 = ${comb}. No importa el orden, por eso se divide entre las formas de ordenar los ${r} elegidos.` };
  },
  // PF5 · Representaciones gráficas
  PF5: (nv) => {
    const casos = [{ d: "el color favorito de un grupo (categórica)", g: "gráfica de barras" }, { d: "la estatura de 40 estudiantes (cuantitativa continua)", g: "histograma" }, { d: "el número de hermanos de cada estudiante (cuantitativa discreta)", g: "gráfico de puntos" }];
    const c = pick(casos);
    const { opciones, correcta } = armar(c.g, ["gráfica de barras", "histograma", "gráfico de puntos"].filter(x => x !== c.g));
    return { texto: `Para representar ${c.d}, ¿qué tipo de gráfica es más adecuada?`, opciones, correcta, explica: `Se recomienda ${c.g} para este tipo de dato, según si la variable es categórica o cuantitativa (continua o discreta).` };
  },
  // PF6 · Relación entre variables
  PF6: (nv) => {
    const { opciones, correcta } = armar("correlación", ["independencia", "causalidad directa", "conjuntos disjuntos"]);
    return { texto: `Cuando dos variables cuantitativas tienden a aumentar o disminuir juntas, ¿qué concepto estadístico describe esa relación?`, opciones, correcta, explica: `Se llama correlación: mide qué tan relacionadas están dos variables cuantitativas, sin implicar necesariamente que una cause a la otra.` };
  },
  // PF7 · Muestreo
  PF7: (nv) => {
    const { opciones, correcta } = armar("muestreo aleatorio simple", ["muestreo por conveniencia", "censo completo", "muestreo sesgado"]);
    return { texto: `Si cada persona de una población tiene la misma probabilidad de ser elegida para la muestra, ¿qué método de muestreo se está usando?`, opciones, correcta, explica: `Eso define al muestreo aleatorio simple: cada elemento de la población tiene la misma probabilidad de selección, lo que da representatividad a la muestra.` };
  },
  // PF8 · Distribución normal
  PF8: (nv) => {
    const datos = Array.from({ length: 5 }, () => rnd(1, 9)).sort((a, b) => a - b);
    const mediana = datos[2];
    const { opciones, correcta } = armar(mediana, [datos[0], datos[4], Math.round(datos.reduce((a, b) => a + b) / 5)]);
    return { texto: `Para el conjunto de datos {${datos.join(", ")}}, ¿cuál es la mediana?`, opciones, correcta, explica: `Con los datos ordenados {${datos.join(", ")}}, la mediana es el valor central: ${mediana}.` };
  },
};

const GEN_CNEYT1 = {
  PF1: (nv) => {
    const { opciones, correcta } = armar("colectiva y social", ["individual y aislada", "puramente teórica", "inmutable con el tiempo"]);
    return { texto: `Según el enfoque de este semestre, la ciencia se entiende como una actividad principalmente…`, opciones, correcta, explica: `La ciencia se concibe como una actividad creativa, social y colectiva: se construye entre comunidades científicas que plantean preguntas y buscan explicaciones verificables, no como el trabajo aislado de un genio.` };
  },
  PF2: (nv) => {
    const { opciones, correcta } = armar("de forma interrelacionada", ["de forma completamente aislada", "sin ninguna relación entre disciplinas", "solo desde la física"]);
    return { texto: `Los fenómenos de la naturaleza pueden estudiarse especializadamente, pero en realidad ocurren…`, opciones, correcta, explica: `Los fenómenos naturales están interrelacionados: física, química y biología los explican desde distintos ángulos, pero ningún fenómeno ocurre verdaderamente aislado de los demás.` };
  },
  PF3: (nv) => {
    const m = rnd(10, 200), v = rnd(2, 20);
    const d = r2(m / v);
    const { opciones, correcta } = armar(d, [r2(v / m), m * v, d + rnd(1, 3)]);
    return { texto: `Un objeto tiene masa de ${m} g y volumen de ${v} cm³. ¿Cuál es su densidad?`, opciones, correcta, explica: `Densidad = masa / volumen = ${m}/${v} = ${d} g/cm³.` };
  },
  PF4: (nv) => {
    const casos = [{ e: "agua de mar (agua + sal + otros minerales)", t: "mezcla" }, { e: "oxígeno (O₂)", t: "sustancia pura (elemento)" }, { e: "agua pura (H₂O)", t: "sustancia pura (compuesto)" }, { e: "ensalada de frutas", t: "mezcla" }];
    const c = pick(casos);
    const { opciones, correcta } = armar(c.t, ["mezcla", "sustancia pura (elemento)", "sustancia pura (compuesto)"].filter(x => x !== c.t));
    return { texto: `Clasifica: ${c.e}.`, opciones, correcta, explica: `${c.e} se clasifica como ${c.t}.` };
  },
  PF5: (nv) => {
    const p = rnd(6, 20);
    const { opciones, correcta } = armar(p, [p + rnd(1, 3), p * 2, p - 1]);
    return { texto: `Un átomo neutro tiene número atómico ${p} (protones). ¿Cuántos electrones tiene?`, opciones, correcta, explica: `En un átomo neutro, el número de electrones es igual al número de protones (número atómico): ${p} electrones.` };
  },
  PF6: (nv) => {
    const { opciones, correcta } = armar("enlace iónico", ["enlace covalente", "enlace metálico", "fuerza de Van der Waals"]);
    return { texto: `Cuando un átomo transfiere completamente uno o más electrones a otro (como en el NaCl), ¿qué tipo de enlace se forma?`, opciones, correcta, explica: `Es un enlace iónico: hay transferencia completa de electrones, formando iones con cargas opuestas que se atraen.` };
  },
  PF7: (nv) => {
    const m = rnd(1, 5), v = rnd(2, 8);
    const ec = r2(0.5 * m * v * v);
    const { opciones, correcta } = armar(ec, [r2(m * v), r2(m * v * v), ec + rnd(1, 3)]);
    return { texto: `Calcula la energía cinética de una partícula de ${m} kg que se mueve a ${v} m/s (Ec = ½mv²).`, opciones, correcta, explica: `Ec = ½(${m})(${v})² = ½(${m})(${v * v}) = ${ec} J.` };
  },
  PF8: (nv) => {
    const { opciones, correcta } = armar("energética y corpuscular", ["solo energética", "solo corpuscular", "ni energética ni corpuscular"]);
    return { texto: `La visión integral de la materia que cierra este semestre la describe con una doble naturaleza:`, opciones, correcta, explica: `La materia tiene naturaleza energética y corpuscular a la vez: está hecha de partículas (átomos, iones, moléculas) y también participa en fenómenos energéticos.` };
  },
};

const GEN_CNEYT2 = {
  PF1: (nv) => {
    const casos = [{ e: "un panel solar que produce electricidad", t: "luminosa → eléctrica" }, { e: "una pila que enciende un foco", t: "química → eléctrica → luminosa" }, { e: "un objeto que cae desde una altura", t: "potencial → cinética" }];
    const c = pick(casos);
    const otras = ["luminosa → eléctrica", "química → eléctrica → luminosa", "potencial → cinética"].filter(x => x !== c.t);
    const { opciones, correcta } = armar(c.t, otras);
    return { texto: `¿Qué transformación de energía ocurre en: ${c.e}?`, opciones, correcta, explica: `Se transforma: ${c.t}. La energía nunca se crea ni se destruye, según la ley de conservación de la energía.` };
  },
  PF2: (nv) => {
    const m = rnd(1, 6), v = rnd(2, 10);
    const ec = r2(0.5 * m * v * v);
    const { opciones, correcta } = armar(ec, [r2(m * v), r2(m * v * v), ec + rnd(1, 4)]);
    return { texto: `Un cuerpo de ${m} kg se mueve a ${v} m/s. Calcula su energía cinética (Ec = ½mv²).`, opciones, correcta, explica: `Ec = ½(${m})(${v}²) = ½(${m})(${v * v}) = ${ec} J.` };
  },
  PF3: (nv) => {
    const c = rnd(-20, 40);
    const f = Math.round((9 / 5) * c + 32);
    const { opciones, correcta } = armar(f, [c + 32, Math.round(c * 9 / 5), f + rnd(1, 5)]);
    return { texto: `Convierte ${c} °C a grados Fahrenheit (F = 9/5·C + 32).`, opciones, correcta, explica: `F = (9/5)(${c}) + 32 = ${r2((9/5)*c)} + 32 = ${f} °F.` };
  },
  PF4: (nv) => {
    const casos = [{ e: "el mango de una cuchara metida en sopa caliente que se calienta", t: "conducción" }, { e: "el aire caliente que sube cerca del techo", t: "convección" }, { e: "el calor del Sol que llega a la Tierra sin medio material", t: "radiación" }];
    const c = pick(casos);
    const { opciones, correcta } = armar(c.t, ["conducción", "convección", "radiación"].filter(x => x !== c.t));
    return { texto: `¿Qué tipo de propagación de calor explica: ${c.e}?`, opciones, correcta, explica: `Es ${c.t}.` };
  },
  PF5: (nv) => {
    const cal = rnd(20, 300);
    const j = Math.round(cal * 4.184);
    const { opciones, correcta } = armar(j, [cal, cal * 4, j + rnd(5, 20)]);
    return { texto: `Convierte ${cal} calorías a Joules (1 cal ≈ 4.184 J).`, opciones, correcta, explica: `${cal} × 4.184 ≈ ${j} J.` };
  },
  PF6: (nv) => {
    const q = rnd(200, 900), w = rnd(50, q - 50);
    const du = q - w;
    const { opciones, correcta } = armar(du, [q + w, w - q, du + rnd(10, 50)]);
    return { texto: `A un sistema se le suministran ${q} J de calor y realiza ${w} J de trabajo. Calcula ΔU (primera ley: ΔU = Q − W).`, opciones, correcta, explica: `ΔU = ${q} − ${w} = ${du} J.` };
  },
  PF7: (nv) => {
    const { opciones, correcta } = armar("de mayor a menor temperatura", ["de menor a mayor temperatura", "en ambas direcciones por igual", "no fluye espontáneamente"]);
    return { texto: `Según la segunda ley de la termodinámica, el calor fluye espontáneamente…`, opciones, correcta, explica: `El calor fluye espontáneamente de los cuerpos de mayor temperatura a los de menor temperatura, nunca al revés, hasta alcanzar el equilibrio térmico.` };
  },
  PF8: (nv) => {
    const { opciones, correcta } = armar("un aerogenerador", ["una regla", "un microscopio óptico simple", "una lupa"]);
    return { texto: `¿Cuál de las siguientes tecnologías transforma energía cinética del viento en energía eléctrica?`, opciones, correcta, explica: `Un aerogenerador (turbina eólica) convierte la energía cinética del viento en energía mecánica de rotación, y luego en energía eléctrica mediante un generador.` };
  },
};

const GEN_CNEYT3 = {
  PF1: (nv) => {
    const { opciones, correcta } = armar("subsistemas interconectados", ["partes totalmente independientes", "un solo bloque sin partes", "solo la atmósfera"]);
    return { texto: `Este semestre entiende a la Tierra como un sistema formado por…`, opciones, correcta, explica: `La Tierra se comprende como un sistema de subsistemas interconectados: geosfera, hidrosfera, atmósfera y biosfera, que interactúan entre sí.` };
  },
  PF2: (nv) => {
    const { opciones, correcta } = armar("hidrosfera", ["geosfera", "biosfera", "criosfera"]);
    return { texto: `¿Qué nombre recibe el subsistema terrestre formado por toda el agua del planeta (océanos, ríos, lagos, agua subterránea)?`, opciones, correcta, explica: `Se llama hidrosfera: incluye toda el agua en sus distintos estados y ubicaciones del planeta.` };
  },
  PF3: (nv) => {
    const { opciones, correcta } = armar("equilibrio ecológico", ["deterioro ambiental", "efecto invernadero", "erosión"]);
    return { texto: `El estado de balance dinámico entre los organismos de un ecosistema y su ambiente se llama…`, opciones, correcta, explica: `Se llama equilibrio ecológico: un balance dinámico que se mantiene mientras los flujos de materia y energía (como en la cadena trófica) se sostienen.` };
  },
  PF4: (nv) => {
    const { opciones, correcta } = armar("se reorganizan los átomos de los reactivos", ["los átomos desaparecen", "se crean átomos nuevos", "la masa aumenta sin razón"]);
    return { texto: `En una reacción química, ¿qué sucede realmente con los átomos de los reactivos?`, opciones, correcta, explica: `Los átomos se reorganizan para formar los productos: no se crean ni se destruyen (ley de conservación de la masa).` };
  },
  PF5: (nv) => {
    const { opciones, correcta } = armar("organismos fotosintéticos", ["la actividad volcánica", "la radiación cósmica", "el deshielo"]);
    return { texto: `La oxigenación de la atmósfera primitiva de la Tierra se debió principalmente a la actividad de…`, opciones, correcta, explica: `Los organismos fotosintéticos (como las cianobacterias) liberaron oxígeno como producto de la fotosíntesis, oxigenando gradualmente la atmósfera primitiva.` };
  },
  PF6: (nv) => {
    const { opciones, correcta } = armar("dióxido de carbono y agua", ["oxígeno y agua", "glucosa y nitrógeno", "solo agua"]);
    return { texto: `¿Qué dos sustancias son los reactivos principales de la fotosíntesis (además de la luz solar)?`, opciones, correcta, explica: `La fotosíntesis usa dióxido de carbono (CO₂) y agua (H₂O) como reactivos, liberando glucosa y oxígeno como productos.` };
  },
  PF7: (nv) => {
    const { opciones, correcta } = armar("deterioro ambiental", ["equilibrio térmico", "principio de Arquímedes", "reacción endotérmica"]);
    return { texto: `El impacto negativo y medible de la actividad humana sobre los subsistemas terrestres se denomina…`, opciones, correcta, explica: `Se denomina deterioro ambiental: se analiza con evidencia (no solo opinión), identificando escalas y manifestaciones concretas.` };
  },
  PF8: (nv) => {
    const { opciones, correcta } = armar("paneles solares", ["motores de combustión interna sin filtro", "quema de leña sin control", "uso indiscriminado de plaguicidas"]);
    return { texto: `¿Cuál de las siguientes es una innovación tecnológica que ayuda a reducir el deterioro ambiental?`, opciones, correcta, explica: `Los paneles solares aprovechan energía renovable, reduciendo la dependencia de combustibles fósiles y su impacto en los subsistemas terrestres.` };
  },
};

const GEN_CNEYT4 = {
  PF1: (nv) => {
    const casos = [{ e: "2H₂ + O₂ → 2H₂O (libera calor y luz)", t: "síntesis y exotérmica" }, { e: "CaCO₃ → CaO + CO₂ (necesita calentarse)", t: "descomposición y endotérmica" }, { e: "HCl + NaOH → NaCl + H₂O", t: "neutralización" }];
    const c = pick(casos);
    const { opciones, correcta } = armar(c.t, ["síntesis y exotérmica", "descomposición y endotérmica", "neutralización"].filter(x => x !== c.t));
    return { texto: `Clasifica la reacción: ${c.e}`, opciones, correcta, explica: `Es una reacción de ${c.t}.` };
  },
  PF2: (nv) => {
    const casos = [{ e: "H₂ + Cl₂ → __HCl", r: 2 }, { e: "N₂ + __H₂ → 2NH₃", r: 3 }, { e: "__Fe + 3O₂ → 2Fe₂O₃", r: 4 }];
    const c = pick(casos);
    const { opciones, correcta } = armar(c.r, [c.r + 1, c.r - 1, c.r + 2]);
    return { texto: `Balancea por tanteo: ${c.e} — ¿qué coeficiente va en el espacio?`, opciones, correcta, explica: `El coeficiente correcto es ${c.r}, para que el número de átomos de cada elemento coincida en ambos lados (ley de conservación de la masa).` };
  },
  PF3: (nv) => {
    const { opciones, correcta } = armar("ocurre en ambos sentidos a la vez", ["solo ocurre hacia adelante", "se detiene por completo", "no depende de la temperatura"]);
    return { texto: `En una reacción reversible en equilibrio químico (⇌), ¿qué está ocurriendo realmente?`, opciones, correcta, explica: `La reacción directa e inversa ocurren simultáneamente a la misma velocidad: es un equilibrio dinámico, no estático.` };
  },
  PF4: (nv) => {
    const ph = rnd(1, 13);
    const t = ph < 7 ? "ácida" : ph > 7 ? "básica" : "neutra";
    const { opciones, correcta } = armar(t, ["ácida", "básica", "neutra"].filter(x => x !== t));
    return { texto: `Una sustancia tiene pH = ${ph}. ¿Es ácida, básica o neutra?`, opciones, correcta, explica: `Con pH ${ph < 7 ? "menor" : ph > 7 ? "mayor" : "igual"} a 7, la sustancia es ${t}.` };
  },
  PF5: (nv) => {
    const { opciones, correcta } = armar("pierde electrones", ["gana electrones", "no cambia su carga", "gana protones"]);
    return { texto: `En una reacción redox, ¿qué le sucede a un átomo cuando se OXIDA?`, opciones, correcta, explica: `Oxidarse significa perder electrones. El átomo que gana esos electrones se reduce.` };
  },
  PF6: (nv) => {
    const { opciones, correcta } = armar("4", ["2", "3", "6"]);
    return { texto: `¿Cuántos enlaces covalentes puede formar típicamente un átomo de carbono?`, opciones, correcta, explica: `El carbono forma típicamente 4 enlaces covalentes, lo que le da su enorme versatilidad para formar cadenas y anillos.` };
  },
  PF7: (nv) => {
    const casos = [{ e: "la glucosa", t: "carbohidrato" }, { e: "un fosfolípido de la membrana celular", t: "lípido" }, { e: "la hemoglobina", t: "proteína" }];
    const c = pick(casos);
    const { opciones, correcta } = armar(c.t, ["carbohidrato", "lípido", "proteína"].filter(x => x !== c.t));
    return { texto: `Clasifica la biomolécula: ${c.e}.`, opciones, correcta, explica: `${c.e} es un ejemplo de ${c.t}.` };
  },
  PF8: (nv) => {
    const { opciones, correcta } = armar("ácido láctico", ["etanol", "oxígeno", "glucosa"]);
    return { texto: `¿Qué producto se forma en la fermentación láctica (respiración anaerobia en músculos)?`, opciones, correcta, explica: `Se forma ácido láctico, resultado de la fermentación cuando no hay suficiente oxígeno disponible para la respiración aerobia completa.` };
  },
};

const GEN_CNEYT5 = {
  PF1: (nv) => {
    const f = rnd(5, 40), m = rnd(2, 10);
    const a = r2(f / m);
    const { opciones, correcta } = armar(a, [r2(f * m), r2(m / f), a + rnd(1, 3)]);
    return { texto: `Se aplica una fuerza neta de ${f} N a un objeto de ${m} kg. Calcula su aceleración (F = m·a).`, opciones, correcta, explica: `a = F/m = ${f}/${m} = ${a} m/s².` };
  },
  PF2: (nv) => {
    const f = rnd(50, 500);
    const { opciones, correcta } = armar(`${f} N en sentido contrario`, [`${f * 2} N en el mismo sentido`, `${f / 2} N en sentido contrario`, "0 N"]);
    return { texto: `Si un cohete expulsa gases hacia abajo con una fuerza de ${f} N, ¿qué fuerza de reacción recibe el cohete? (tercera ley de Newton)`, opciones, correcta, explica: `Por la tercera ley de Newton, la fuerza de reacción es igual en magnitud (${f} N) y de sentido contrario a la de acción.` };
  },
  PF3: (nv) => {
    const { opciones, correcta } = armar("se reduce a la cuarta parte", ["se duplica", "se reduce a la mitad", "no cambia"]);
    return { texto: `Si la distancia entre dos cuerpos se duplica, ¿qué pasa con la fuerza gravitacional entre ellos? (F = Gm₁m₂/d²)`, opciones, correcta, explica: `Como la fuerza es inversamente proporcional al cuadrado de la distancia, al duplicar d, el denominador se multiplica por 4: la fuerza se reduce a la cuarta parte.` };
  },
  PF4: (nv) => {
    const f = rnd(2, 20), l = rnd(1, 5);
    const v = f * l;
    const { opciones, correcta } = armar(v, [r2(f / l), f + l, v + rnd(1, 4)]);
    return { texto: `Una onda tiene frecuencia ${f} Hz y longitud de onda ${l} m. Calcula su velocidad de propagación (v = λ·f).`, opciones, correcta, explica: `v = λ·f = ${l} × ${f} = ${v} m/s.` };
  },
  PF5: (nv) => {
    const { opciones, correcta } = armar("reflexión", ["refracción", "difracción", "polarización"]);
    return { texto: `Cuando la luz rebota en un espejo manteniendo el mismo ángulo con el que llegó, ¿qué fenómeno óptico es?`, opciones, correcta, explica: `Es reflexión: el ángulo de incidencia es igual al ángulo de reflexión.` };
  },
  PF6: (nv) => {
    const dens = 1000, vol = r2(rnd(1, 20) / 10);
    const g = 10;
    const emp = r2(dens * vol * g);
    const { opciones, correcta } = armar(emp, [r2(emp / 2), r2(emp * 2), emp + rnd(5, 15)]);
    return { texto: `Un objeto desplaza ${vol} m³ de agua (densidad 1000 kg/m³). Calcula el empuje que recibe (E = ρ·V·g, g=10 m/s²).`, opciones, correcta, explica: `E = 1000 × ${vol} × 10 = ${emp} N (principio de Arquímedes).` };
  },
  PF7: (nv) => {
    const r = rnd(2, 20), i = rnd(1, 8);
    const v = r * i;
    const { opciones, correcta } = armar(v, [r2(r / i), r + i, v + rnd(1, 4)]);
    return { texto: `Un circuito tiene resistencia de ${r} Ω y corriente de ${i} A. Calcula el voltaje (Ley de Ohm: V = I·R).`, opciones, correcta, explica: `V = I×R = ${i} × ${r} = ${v} V.` };
  },
  PF8: (nv) => {
    const { opciones, correcta } = armar("relatividad de Einstein", ["ley de Ohm", "principio de Arquímedes", "leyes de Kepler"]);
    return { texto: `¿Qué teoría de la física moderna es indispensable corregir para que el GPS funcione con precisión?`, opciones, correcta, explica: `Los satélites GPS deben corregir efectos de la teoría de la relatividad especial y general de Einstein; sin esa corrección, acumularían errores de varios kilómetros al día.` };
  },
};

const GEN_CNEYT6 = {
  PF1: (nv) => {
    const { opciones, correcta } = armar("aminoácidos", ["ADN completo", "una célula viva", "proteínas complejas"]);
    return { texto: `En el experimento de Miller-Urey (1953), ¿qué tipo de moléculas orgánicas se obtuvieron a partir de gases inorgánicos?`, opciones, correcta, explica: `Se obtuvieron aminoácidos, los componentes básicos de las proteínas, apoyando la teoría quimiosintética del origen de la vida.` };
  },
  PF2: (nv) => {
    if (nv === 1) {
      const { opciones, correcta } = armar("todos los seres vivos están formados por células", ["solo los animales tienen células", "las plantas no tienen células", "las células solo existen en organismos grandes"]);
      return { texto: `¿Cuál es uno de los postulados centrales de la teoría celular?`, opciones, correcta, explica: `La teoría celular establece que todos los seres vivos están formados por una o más células, sin excepción — desde una bacteria hasta una ballena.` };
    }
    const { opciones, correcta } = armar("microorganismos vivos", ["cristales minerales", "gas comprimido", "polvo estelar"]);
    return { texto: `Anton van Leeuwenhoek, con microscopios que él mismo construía, fue el primero en observar con vida propia a:`, opciones, correcta, explica: `Van Leeuwenhoek observó por primera vez microorganismos vivos (que llamó "animálculos") en agua de charca, semen y placa dental — un paso más allá de las celdas vacías que había visto Hooke.` };
  },
  PF3: (nv) => {
    const { opciones, correcta } = armar("procariota", ["eucariota", "ninguna de las anteriores", "ambas por igual"]);
    return { texto: `Una célula bacteriana, sin núcleo definido ni organelos membranosos, se clasifica como…`, opciones, correcta, explica: `Se clasifica como procariota: carece de núcleo delimitado por membrana y de organelos membranosos.` };
  },
  PF4: (nv) => {
    const bases = { A: "T", T: "A", G: "C", C: "G" };
    const secuencia = Array.from({ length: 4 }, () => pick(["A", "T", "G", "C"]));
    const compl = secuencia.map(b => bases[b]);
    const { opciones, correcta } = armar(compl.join("-"), [secuencia.join("-"), [...compl].reverse().join("-"), compl.map(b=>bases[b]).join("-")]);
    return { texto: `Escribe la cadena complementaria de ADN para: ${secuencia.join("-")}`, opciones, correcta, explica: `Recuerda: A empareja con T, y G empareja con C. Cada base de la secuencia original (${secuencia.join("-")}) da su complementaria: ${compl.join("-")}.` };
  },
  PF5: (nv) => {
    const cromo = pick([46, 24, 20, 40]);
    const { opciones, correcta } = armar(cromo, [cromo / 2, cromo * 2, cromo + 2]);
    return { texto: `Una célula tiene ${cromo} cromosomas antes de dividirse. ¿Cuántos cromosomas tendrá cada célula hija después de una MITOSIS?`, opciones, correcta, explica: `La mitosis produce células genéticamente idénticas con el mismo número de cromosomas que la célula original: ${cromo}.` };
  },
  PF6: (nv) => {
    const { opciones, correcta } = armar("25%", ["50%", "75%", "100%"]);
    return { texto: `En un cruce Aa × Aa, ¿qué porcentaje de la descendencia se espera que sea homocigota recesiva (aa)?`, opciones, correcta, explica: `Con un cuadro de Punnett para Aa × Aa: 25% AA, 50% Aa, 25% aa. La proporción homocigota recesiva es 25%.` };
  },
  PF7: (nv) => {
    const { opciones, correcta } = armar("selección natural", ["herencia de caracteres adquiridos (Lamarck)", "generación espontánea", "panspermia"]);
    return { texto: `Darwin y Wallace propusieron en 1858 que los individuos mejor adaptados a su ambiente tienden a sobrevivir y reproducirse más. ¿Cómo se llama este mecanismo?`, opciones, correcta, explica: `Se llama selección natural: el mecanismo central de la teoría evolutiva de Darwin y Wallace.` };
  },
  PF8: (nv) => {
    const { opciones, correcta } = armar("organización celular, metabolismo y reproducción", ["solo tamaño y color", "solo la capacidad de moverse", "solo la composición química"]);
    return { texto: `¿Cuáles son características que comparten todos los seres vivos?`, opciones, correcta, explica: `Todos los seres vivos comparten, entre otras: organización celular, metabolismo, capacidad de reproducirse, respuesta a estímulos y evolución por selección natural.` };
  },
};

// ---------------------------- CATÁLOGO DE MATERIAS (de los cuadernillos)
const MATERIAS = {
  pm1: {
    area: "mate",
    nombre: "Pensamiento Matemático I",
    corto: "PM I",
    eje: "Pensamiento aritmético · 1er semestre",
    cuadernillo: "Cuadernillo PM I Extendido",
    gen: GEN_PM1,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "Lógica matemática", desc: "Proposiciones, tablas de verdad, ∧ / ∨ / →", icono: "◆", interactivo: "TablaVerdad" },
      { code: "PF2", parcial: 1, titulo: "Sistemas numéricos", desc: "Valor posicional, naturales y decimales", icono: "●", interactivo: "ValorPosicional" },
      { code: "PF3", parcial: 1, titulo: "Números enteros", desc: "Suma, resta y leyes de los signos", icono: "±", interactivo: "RectaEnteros" },
      { code: "PF4", parcial: 2, titulo: "Fracciones y %", desc: "Proporciones, regla de tres, porcentajes", icono: "½", interactivo: "PorcentajeFraccion" },
      { code: "PF5", parcial: 2, titulo: "Potencias y raíces", desc: "Exponentes, radicación y sus leyes", icono: "xⁿ", interactivo: "CrecimientoPotencias" },
      { code: "PF6", parcial: 3, titulo: "Notación científica", desc: "Medición y potencias de 10", icono: "10ⁿ", interactivo: "NotacionCientifica" },
      { code: "PF7", parcial: 3, titulo: "Jerarquía", desc: "Orden de operaciones", icono: "( )", interactivo: "JerarquiaOperaciones" },
    ],
  },
  pm2: {
    area: "mate",
    nombre: "Pensamiento Matemático II",
    corto: "PM II",
    eje: "Introducción al álgebra · 2º semestre",
    cuadernillo: "Cuadernillo PM II Extendido",
    gen: GEN_PM2,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "Lenguaje algebraico", desc: "Del lenguaje común a las letras", icono: "n", interactivo: "TraductorAlgebraico" },
      { code: "PF2", parcial: 1, titulo: "Clasificar expresiones", desc: "Monomio, binomio, trinomio, grado", icono: "▤", interactivo: "ClasificadorExpresion" },
      { code: "PF3", parcial: 2, titulo: "Monomios y binomios", desc: "Operar y factorizar factor común", icono: "×", interactivo: "ModeloAreaMonomios" },
      { code: "PF4", parcial: 2, titulo: "Productos notables", desc: "(a+b)², conjugados, polinomios", icono: "()²", interactivo: "CuadradoBinomio" },
      { code: "PF5", parcial: 3, titulo: "Álgebra en la vida", desc: "Presupuesto, recetas, descuentos", icono: "%", interactivo: "BarraPorcentaje" },
      { code: "PF6", parcial: 3, titulo: "Ecuaciones", desc: "Igualdad, identidad, despejar x", icono: "=", interactivo: "IdentidadOEcuacion" },
    ],
  },
  pm3: {
    area: "mate",
    nombre: "Pensamiento Matemático III",
    corto: "PM III",
    eje: "Álgebra e introducción a geometría plana · 3er semestre",
    cuadernillo: "Cuadernillo PM III Extendido",
    gen: GEN_PM3,
    propositos: [
      { code: "P1", parcial: 1, titulo: "Ecuaciones lineales", desc: "Primer grado con una incógnita", icono: "x", interactivo: "BalanzaEcuacion" },
      { code: "P2", parcial: 1, titulo: "La recta", desc: "y = mx + b, pendiente, plano cartesiano", icono: "╱", interactivo: "RectaInteractiva" },
      { code: "P3", parcial: 2, titulo: "Sistemas 2×2", desc: "Reducción, sustitución, igualación", icono: "≡", interactivo: "SistemaDosRectas" },
      { code: "P4", parcial: 2, titulo: "Cuadráticas", desc: "Factorización y fórmula general", icono: "x²", interactivo: "FactorizacionCuadratica" },
      { code: "P5", parcial: 3, titulo: "Aplicaciones", desc: "Interés simple y crecimiento", icono: "$", interactivo: "InteresSimpleCompuesto" },
      { code: "P6", parcial: 3, titulo: "Geometría plana", desc: "Ángulos, Pitágoras, escuadra 3-4-5", icono: "△", interactivo: "TeoremaPitagoras" },
    ],
  },
  pm4: {
    area: "mate",
    nombre: "Pensamiento Matemático IV",
    corto: "PM IV",
    eje: "Trigonometría y geometría analítica · 4º semestre",
    cuadernillo: "Cuadernillo PM IV Extendido",
    gen: GEN_PM4,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "Punto y recta", desc: "Distancia, punto medio, tangente", icono: "•", interactivo: "DistanciaPuntos" },
      { code: "PF2", parcial: 1, titulo: "Razones trig.", desc: "Seno, coseno, tangente", icono: "∠", interactivo: "CirculoUnitario" },
      { code: "PF3", parcial: 1, titulo: "Curvas en el plano", desc: "Evaluar y ver simetría", icono: "∿", interactivo: "CoordenadasPolares" },
      { code: "PF4", parcial: 2, titulo: "Ecuación de la recta", desc: "Pendiente y formas de la recta", icono: "╱", interactivo: "EcuacionRecta" },
      { code: "PF5", parcial: 2, titulo: "La parábola", desc: "Vértice, apertura, modelado", icono: "∪", interactivo: "Parabola" },
      { code: "PF6", parcial: 3, titulo: "Circunferencia y Kepler", desc: "Ecuación del círculo, órbitas", icono: "◯", interactivo: "CirculoEcuacion" },
      { code: "PF7", parcial: 3, titulo: "Secciones cónicas", desc: "Identificar elipse, parábola…", icono: "◑", interactivo: "SeccionesConicas" },
    ],
  },
  pm5: {
    area: "mate",
    nombre: "Pensamiento Matemático V",
    corto: "PM V",
    eje: "Cálculo diferencial · 5º semestre",
    cuadernillo: "Cuadernillo PM V Extendido",
    gen: GEN_PM5,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "Origen del cálculo: variación", desc: "Tasa de variación promedio", icono: "Δ", interactivo: "TasaVariacion" },
      { code: "PF2", parcial: 1, titulo: "Recta tangente y movimiento", desc: "De la secante a la tangente", icono: "╱", interactivo: "PosicionTiempo" },
      { code: "PF3", parcial: 1, titulo: "Funciones y su gráfica", desc: "Simetría, crecimiento, máximos", icono: "∿", interactivo: "SimetriaFuncion" },
      { code: "PF4", parcial: 2, titulo: "El concepto de límite", desc: "Acercarse sin llegar", icono: "→", interactivo: "ConceptoLimite" },
      { code: "PF5", parcial: 2, titulo: "Funciones trascendentes", desc: "Exponenciales, log, trigonométricas", icono: "eˣ", interactivo: "FuncionesTrascendentes" },
      { code: "PF6", parcial: 2, titulo: "La derivada", desc: "Regla de la potencia", icono: "f'", interactivo: "DerivadaPotencia" },
      { code: "PF7", parcial: 3, titulo: "Optimización", desc: "El mejor valor posible", icono: "★", interactivo: "Optimizacion" },
      { code: "PF8", parcial: 3, titulo: "Teorema Fundamental", desc: "Derivada e integral, inversas", icono: "∫", interactivo: "AreaBajoCurva" },
    ],
  },
  pm6: {
    area: "mate",
    nombre: "Pensamiento Matemático VI",
    corto: "PM VI",
    eje: "Pensamiento estadístico y probabilístico · 6º semestre",
    cuadernillo: "Cuadernillo PM VI Extendido",
    gen: GEN_PM6,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "Recolección de datos", desc: "Determinista vs. aleatorio", icono: "◆", interactivo: "DeterministaAleatorio" },
      { code: "PF2", parcial: 1, titulo: "Simulación y frecuencia", desc: "Equiprobabilidad", icono: "🎲", interactivo: "SimulacionDado" },
      { code: "PF3", parcial: 1, titulo: "Teoría de conjuntos", desc: "Unión, intersección", icono: "∪", interactivo: "VennConjuntos" },
      { code: "PF4", parcial: 2, titulo: "Técnicas de conteo", desc: "Permutaciones y combinaciones", icono: "n!", interactivo: "ConteoPermutaciones" },
      { code: "PF5", parcial: 2, titulo: "Representaciones gráficas", desc: "Barras, histograma, puntos", icono: "▤", interactivo: "TipoGrafica" },
      { code: "PF6", parcial: 2, titulo: "Relación entre variables", desc: "Correlación e independencia", icono: "∝", interactivo: "CorrelacionDispersión" },
      { code: "PF7", parcial: 3, titulo: "Muestreo", desc: "Población y muestra", icono: "◎", interactivo: "PoblacionMuestra" },
      { code: "PF8", parcial: 3, titulo: "Distribución normal", desc: "La campana de Gauss", icono: "🔔", interactivo: "CampanaNormal" },
    ],
  },
  cneyt1: {
    area: "cneyt",
    nombre: "CNEyT I",
    corto: "CNEyT I",
    eje: "Invitación a la ciencia. Naturaleza de la materia · 1er semestre",
    cuadernillo: "Cuadernillo CNEyT I Extendido",
    gen: GEN_CNEYT1,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "La ciencia como actividad", desc: "Creativa, social y colectiva", icono: "🔬", interactivo: "CienciaSocial" },
      { code: "PF2", parcial: 1, titulo: "Fenómenos interrelacionados", desc: "Estudio conjunto o especializado", icono: "⚭", interactivo: "FenomenosInterrelacionados" },
      { code: "PF3", parcial: 1, titulo: "Materia, cuerpo, masa, densidad", desc: "Describir el entorno perceptible", icono: "⚖", interactivo: "DensidadObjetos" },
      { code: "PF4", parcial: 2, titulo: "Sustancia, mezcla, compuesto", desc: "Clasificar tipos de materia", icono: "🧪", interactivo: "ClasificadorMateria" },
      { code: "PF5", parcial: 2, titulo: "El átomo", desc: "Composición eléctrica de la materia", icono: "⚛", interactivo: "ModeloAtomo" },
      { code: "PF6", parcial: 2, titulo: "Enlaces químicos", desc: "Iones y moléculas", icono: "⛓", interactivo: "EnlacesQuimicos" },
      { code: "PF7", parcial: 3, titulo: "Estados de agregación", desc: "Energía cinética, potencial, interna", icono: "❄", interactivo: "EstadosAgregacion" },
      { code: "PF8", parcial: 3, titulo: "Naturaleza energética y corpuscular", desc: "Aplicaciones tecnológicas", icono: "✦", interactivo: "NaturalezaDual" },
    ],
  },
  cneyt2: {
    area: "cneyt",
    nombre: "CNEyT II",
    corto: "CNEyT II",
    eje: "El poder de la energía · 2º semestre",
    cuadernillo: "Cuadernillo CNEyT II Extendido",
    gen: GEN_CNEYT2,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "Transformación de la energía", desc: "Se transforma, no se destruye", icono: "⚡", interactivo: "CadenaEnergia" },
      { code: "PF2", parcial: 1, titulo: "Fuerza y energía mecánica", desc: "Energía cinética", icono: "→", interactivo: "EnergiaCinetica" },
      { code: "PF3", parcial: 1, titulo: "Calor y temperatura", desc: "Equilibrio térmico", icono: "🌡", interactivo: "EscalasTemperatura" },
      { code: "PF4", parcial: 2, titulo: "Propagación del calor", desc: "Conducción, convección, radiación", icono: "🔥", interactivo: "PropagacionCalor" },
      { code: "PF5", parcial: 2, titulo: "Trabajo mecánico y termodinámica", desc: "Caloría-Joule, principio cero", icono: "⚙", interactivo: "ConversorCaloriaJoule" },
      { code: "PF6", parcial: 2, titulo: "Gas ideal y primera ley", desc: "PV = nRT, ΔU = Q − W", icono: "P", interactivo: "GasIdeal" },
      { code: "PF7", parcial: 3, titulo: "Entropía y entalpía", desc: "Segunda y tercera leyes", icono: "S", interactivo: "EntropiaVisual" },
      { code: "PF8", parcial: 3, titulo: "Energía y tecnología", desc: "Aplicaciones tecnológicas", icono: "🔧", interactivo: "EficienciaEnergetica" },
    ],
  },
  cneyt3: {
    area: "cneyt",
    nombre: "CNEyT III",
    corto: "CNEyT III",
    eje: "Nuestro hogar. El sistema terrestre · 3er semestre",
    cuadernillo: "Cuadernillo CNEyT III Extendido",
    gen: GEN_CNEYT3,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "La Tierra como sistema", desc: "Subsistemas interconectados", icono: "🌍", interactivo: "TierraSistema" },
      { code: "PF2", parcial: 1, titulo: "Hidrosfera y atmósfera", desc: "Capas, composición, interacción", icono: "💧", interactivo: "CapasAtmosfera" },
      { code: "PF3", parcial: 1, titulo: "Flujos de materia y energía", desc: "Cadena trófica, equilibrio ecológico", icono: "🌿", interactivo: "CadenaTrofica" },
      { code: "PF4", parcial: 2, titulo: "Estructura de una reacción química", desc: "Transformación de la materia", icono: "🧪", interactivo: "ReaccionEstructura" },
      { code: "PF5", parcial: 2, titulo: "Oxigenación de la atmósfera", desc: "Organismos fotosintéticos", icono: "O₂", interactivo: "OxigenacionAtmosfera" },
      { code: "PF6", parcial: 2, titulo: "Fotosíntesis", desc: "Cadena trófica, captura de CO₂", icono: "🍃", interactivo: "FotosintesisVisual" },
      { code: "PF7", parcial: 3, titulo: "Deterioro ambiental", desc: "Escalas y manifestaciones", icono: "⚠", interactivo: "DeterioroAmbiental" },
      { code: "PF8", parcial: 3, titulo: "Innovaciones tecnológicas", desc: "Reducir el deterioro ambiental", icono: "♻", interactivo: "InnovacionesAmbientales" },
    ],
  },
  cneyt4: {
    area: "cneyt",
    nombre: "CNEyT IV",
    corto: "CNEyT IV",
    eje: "El poder de la química · 4º semestre",
    cuadernillo: "Cuadernillo CNEyT IV Extendido",
    gen: GEN_CNEYT4,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "Reacciones químicas", desc: "Características y clasificación", icono: "⇌", interactivo: "ClasificadorReacciones" },
      { code: "PF2", parcial: 1, titulo: "Balanceo de ecuaciones", desc: "Ley de conservación de la masa", icono: "=", interactivo: "BalanceadorEcuaciones" },
      { code: "PF3", parcial: 1, titulo: "Equilibrio químico", desc: "Reversibles e irreversibles", icono: "⇄", interactivo: "EquilibrioQuimico" },
      { code: "PF4", parcial: 2, titulo: "Ácidos y bases", desc: "Escala de pH", icono: "pH", interactivo: "EscalaPH" },
      { code: "PF5", parcial: 2, titulo: "Redox y combustión", desc: "Oxidación-reducción", icono: "e⁻", interactivo: "RedoxTransferencia" },
      { code: "PF6", parcial: 2, titulo: "Compuestos orgánicos", desc: "Estructura del carbono", icono: "C", interactivo: "EnlacesCarbono" },
      { code: "PF7", parcial: 3, titulo: "Biomoléculas", desc: "Carbohidratos, lípidos, proteínas", icono: "🧬", interactivo: "ClasificadorBiomoleculas" },
      { code: "PF8", parcial: 3, titulo: "Respiración aerobia y anaerobia", desc: "Glucólisis, fermentación", icono: "🫁", interactivo: "RespiracionComparada" },
    ],
  },
  cneyt5: {
    area: "cneyt",
    nombre: "CNEyT V",
    corto: "CNEyT V",
    eje: "Del átomo al universo. Fuerza y Energía · 5º semestre",
    cuadernillo: "Cuadernillo CNEyT V Extendido",
    gen: GEN_CNEYT5,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "Caída libre y leyes de Newton", desc: "1ª y 2ª leyes", icono: "↓", interactivo: "SegundaLeyNewton" },
      { code: "PF2", parcial: 1, titulo: "Acción y reacción", desc: "Tercera ley de Newton", icono: "⇄", interactivo: "AccionReaccion" },
      { code: "PF3", parcial: 1, titulo: "Gravitación universal", desc: "Leyes de Kepler", icono: "🪐", interactivo: "GravitacionDistancia" },
      { code: "PF4", parcial: 2, titulo: "Movimiento ondulatorio", desc: "Tipos y velocidad de onda", icono: "∿", interactivo: "OndaInteractiva" },
      { code: "PF5", parcial: 2, titulo: "Óptica", desc: "Reflexión y refracción", icono: "💡", interactivo: "OpticaRayo" },
      { code: "PF6", parcial: 2, titulo: "Fluidos", desc: "Pascal, Arquímedes, Bernoulli", icono: "🌊", interactivo: "ArquimedesFlota" },
      { code: "PF7", parcial: 3, titulo: "Electromagnetismo", desc: "Ley de Ohm, inducción de Faraday", icono: "⚡", interactivo: "LeyOhm" },
      { code: "PF8", parcial: 3, titulo: "Física moderna", desc: "Relatividad, cuántica", icono: "E=mc²", interactivo: "RelatividadDivulgativa" },
    ],
  },
  cneyt6: {
    area: "cneyt",
    nombre: "CNEyT VI",
    corto: "CNEyT VI",
    eje: "¿Qué es la vida? Evolución y diversidad biológica · 6º semestre",
    cuadernillo: "Cuadernillo CNEyT VI Extendido",
    gen: GEN_CNEYT6,
    propositos: [
      { code: "PF1", parcial: 1, titulo: "Origen de la vida", desc: "Miller-Urey, quimiosíntesis", icono: "🧫", interactivo: "MillerUreyExperimento" },
      { code: "PF2", parcial: 1, titulo: "Descubrimiento de la célula", desc: "Teoría celular", icono: "🔬", interactivo: "ZoomCelula" },
      { code: "PF3", parcial: 1, titulo: "Procariotas y eucariotas", desc: "Teoría endosimbiótica", icono: "🦠", interactivo: "ProcariotaEucariota" },
      { code: "PF4", parcial: 2, titulo: "ADN y ARN", desc: "Estructura y herencia", icono: "🧬", interactivo: "EmparejamientoBases" },
      { code: "PF5", parcial: 2, titulo: "Mitosis y meiosis", desc: "División celular", icono: "➗", interactivo: "MitosisMeiosis" },
      { code: "PF6", parcial: 2, titulo: "Herencia biológica", desc: "Leyes de Mendel", icono: "🌱", interactivo: "CuadroPunnett" },
      { code: "PF7", parcial: 3, titulo: "Evolución", desc: "Selección natural, Darwin-Wallace", icono: "🐦", interactivo: "SeleccionNatural" },
      { code: "PF8", parcial: 3, titulo: "Características de los seres vivos", desc: "Cierre e integración", icono: "❤", interactivo: "CaracteristicasVida" },
    ],
  },
};

// ---------------------------- CASOS REALES (compilatorio, tracción con la realidad)
// Casos curados con números verificados a mano (varios adaptados de las cápsulas
// "En el trabajo" ya escritas y verificadas en los cuadernillos; otros nuevos,
// también verificados). No es una lista automática de los 26 propósitos: son
// los casos con mayor "gancho" de realidad, uno o dos por materia.
const CASOS_REALES = {
  pm1: [
    { titulo: "Interés simple vs. compuesto: la diferencia se dispara con los años", materia: "PM I · Potencias y raíces",
      planteamiento: "Inviertes $10,000 al 5% anual durante 30 años. Con interés simple, ganas lo mismo cada año sobre el capital original. Con interés compuesto, cada año ganas también sobre lo ya ganado. Antes de ver los números: ¿crees que la diferencia entre ambos, después de 30 años, es poca cosa o es enorme?",
      interactivo: "InteresSimpleCompuesto",
      pasos: ["Interés simple: 10,000 + (10,000 × 0.05 × 30) = 10,000 + 15,000 = $25,000.", "Interés compuesto: 10,000 × (1.05)³⁰ = $43,219.42.", "Diferencia: $18,219.42 — más que el capital original, solo por cómo se acumula el interés.", "Prueba en el interactivo de arriba: sube los años y observa cómo la barra del compuesto se dispara mucho más rápido que la del simple."],
      moraleja: "La potencia (1.05)³⁰ no es un adorno: es la razón por la que el interés compuesto crece mucho más rápido a largo plazo.",
      autoverifica: { pregunta: "Si en vez de 30 años fueran solo 2 años, ¿la diferencia entre simple y compuesto sería…", opciones: ["Casi igual de grande", "Mucho más chica", "Mucho más grande"], correcta: 1 } },
  ],
  pm2: [
    { titulo: "50% de descuento + 20% de descuento NO es 70% de descuento", materia: "PM II · Álgebra en la vida",
      planteamiento: "Una tienda anuncia una prenda de $1,000 con \"50% + 20% de descuento\". Es tentador sumar: 50% + 20% = 70% de descuento. Antes de calcular: ¿crees que el descuento real es exactamente 70%, más, o menos?",
      pasos: ["Precio original: $1,000.", "Tras el primer 50%: 1,000 × (1 − 0.50) = $500.", "Tras el 20% adicional (sobre los $500, no sobre los $1,000): 500 × (1 − 0.20) = $400.", "Pagaste $400 de $1,000: un descuento efectivo real de 60%, no 70%."],
      moraleja: "Cada porcentaje se aplica sobre lo que queda, no sobre el original. Sumar porcentajes de descuentos sucesivos siempre da un número mayor al descuento real.",
      autoverifica: { pregunta: "Si en vez de 50%+20% fueran dos descuentos de 50%+50%, ¿el descuento total sería…", opciones: ["100% (gratis)", "75%", "50%"], correcta: 1 } },
    { titulo: "El punto de equilibrio de un changarro de comida", materia: "PM II · Ecuaciones",
      planteamiento: "Un puesto de comida tiene costos fijos de $2,000 al mes (renta, gas) y cada platillo le cuesta $15 en ingredientes. Lo vende en $35. Antes de calcular: ¿cuántos platillos crees que debe vender al mes solo para no perder dinero?",
      interactivo: "SistemaDosRectas",
      pasos: ["Ingreso total = 35x. Costo total = 2,000 + 15x.", "En el punto de equilibrio, ingreso = costo: 35x = 2,000 + 15x.", "Resuelve: 35x − 15x = 2,000 → 20x = 2,000 → x = 100.", "Comprobación: ingreso = 35(100) = $3,500; costo = 2,000 + 15(100) = $3,500. ✓", "Es exactamente el mismo concepto del interactivo de arriba: el punto de equilibrio es donde la recta de ingreso cruza la recta de costo."],
      moraleja: "Vender menos de 100 platillos al mes significa pérdida; más de 100, ganancia. Una ecuación lineal, resuelta una vez, marca la meta de todo el negocio.",
      autoverifica: { pregunta: "Si el costo fijo subiera a $3,000 (misma renta más cara), el punto de equilibrio (100 platillos)…", opciones: ["Bajaría", "Subiría", "Seguiría igual"], correcta: 1 } },
  ],
  pm3: [
    { titulo: "La escuadra 3-4-5 de los albañiles", materia: "PM III · Geometría plana",
      planteamiento: "Sin escuadra ni transportador, ¿cómo puede un albañil verificar que una esquina es exactamente de 90° usando solo una cuerda con nudos? Antes de ver la respuesta, piénsalo: ¿qué medidas de cuerda usarías?",
      interactivo: "TeoremaPitagoras",
      pasos: ["Marca 3 segmentos en un lado, 4 en el otro y 5 en el que los une, formando un triángulo con la cuerda.", "Verifica: 3² + 4² = 9 + 16 = 25, y 5² = 25 — coinciden.", "Por el teorema de Pitágoras, un triángulo con esas proporciones SIEMPRE tiene un ángulo recto exacto entre los lados 3 y 4.", "Prueba otras combinaciones en el interactivo de arriba: no cualquier terna de números funciona, solo las que cumplen a²+b²=c²."],
      moraleja: "Un truco de construcción de miles de años (se le atribuye a los egipcios) es, literalmente, el teorema de Pitágoras aplicado sin necesidad de calcularlo cada vez.",
      autoverifica: { pregunta: "¿Cuál de estas ternas también forma un ángulo recto, igual que 3-4-5?", opciones: ["5, 12, 13", "3, 4, 6", "5, 6, 7"], correcta: 0 } },
  ],
  pm4: [
    { titulo: "Cercar el corral más grande posible con la misma cerca", materia: "PM IV · La parábola",
      planteamiento: "Tienes 40 metros de cerca para un corral rectangular. Antes de calcular: ¿crees que la forma que encierra más área es un rectángulo muy alargado, o un cuadrado?",
      interactivo: "Optimizacion",
      pasos: ["Si x es un lado, el perímetro 2x + 2y = 40 da y = 20 − x.", "Área: A(x) = x(20 − x) = 20x − x² — una parábola que abre hacia abajo.", "El máximo está en el vértice: x = −b/2a = −20/(2×−1) = 10.", "Con x = 10, y = 20 − 10 = 10: es un CUADRADO de 10×10 m, área = 100 m²."],
      moraleja: "Con la misma cantidad de cerca, el cuadrado siempre encierra más área que cualquier rectángulo alargado. El vértice de la parábola te lo demuestra sin tener que probar todas las combinaciones.",
      autoverifica: { pregunta: "Con esos mismos 40 m de cerca, un rectángulo de 5×15 m tendría un área de…", opciones: ["100 m² (igual que el cuadrado)", "75 m² (menos que el cuadrado)", "125 m² (más que el cuadrado)"], correcta: 1 } },
  ],
  pm5: [
    { titulo: "El precio que maximiza la ganancia de una empresa", materia: "PM V · Optimización",
      planteamiento: "La ganancia de una empresa según las unidades vendidas (x) es G(x) = −2x² + 40x. Antes de derivar nada: ¿crees que vender siempre más unidades da siempre más ganancia, o hay un punto en que empieza a convenir menos?",
      pasos: ["Deriva: G'(x) = −4x + 40.", "En el punto óptimo, la derivada vale 0: −4x + 40 = 0 → x = 10.", "Sustituye para hallar la ganancia máxima: G(10) = −2(100) + 400 = 200."],
      moraleja: "«Derivar e igualar a 0» no es un ritual: encuentra exactamente el punto donde la ganancia deja de subir y empieza a bajar — ahí está el óptimo.",
      autoverifica: { pregunta: "Según G(x) = −2x² + 40x, ¿cuánto ganaría la empresa si vendiera 20 unidades (el doble del óptimo)?", opciones: ["400 (el doble de 200)", "0 (nada)", "800"], correcta: 1 } },
  ],
  pm6: [
    { titulo: "¿Por qué casi nadie mide 1.40 m ni 2.10 m, pero muchísima gente mide \"más o menos 1.70\"?", materia: "PM VI · Distribución normal",
      planteamiento: "Si midieras la estatura de mil personas adultas al azar, ¿esperarías ver más gente en los extremos (muy bajitos o muy altos) o concentrada cerca de un valor central?",
      interactivo: "CampanaNormal",
      pasos: ["La estatura humana sigue (aproximadamente) una distribución normal: una campana centrada en la media (μ).", "La mayoría de las personas caen cerca de la media; entre más te alejas (hacia arriba o abajo), menos gente hay ahí.", "La desviación estándar (σ) controla qué tan \"apretada\" o \"dispersa\" está esa campana alrededor de la media.", "Prueba en el interactivo de arriba: sube σ y verás que la campana se aplana — más gente en los extremos que antes."],
      moraleja: "La distribución normal no es solo un tema de examen: describe estaturas, calificaciones, tiempos de reacción y muchísimos fenómenos naturales donde la mayoría se agrupa cerca de un promedio.",
      autoverifica: { pregunta: "Si σ (la desviación estándar) fuera muy, muy pequeña, la campana se vería…", opciones: ["Muy angosta y alta (casi todos miden igual)", "Muy ancha y plana (estaturas muy variadas)", "Igual, σ no afecta la forma"], correcta: 0 } },
  ],
  cneyt1: [
    { titulo: "¿Por qué flota un barco de acero si el acero se hunde?", materia: "CNEyT I · Materia, cuerpo, masa, densidad",
      planteamiento: "Un clavo de acero se hunde en el agua al instante. Pero un barco, hecho del mismo acero y mucho más pesado, flota perfectamente. Antes de ver la respuesta: ¿qué crees que lo explica?",
      interactivo: "DensidadObjetos",
      pasos: [
        "La clave no es el peso total, sino la densidad: masa entre volumen.",
        "Un clavo sólido tiene poco volumen para su masa → densidad alta (mayor que el agua) → se hunde.",
        "Un barco tiene forma hueca: el mismo acero se reparte en mucho más volumen (incluyendo el aire interior) → su densidad PROMEDIO es menor que la del agua → flota.",
        "Prueba en el interactivo de arriba: sube el volumen manteniendo la masa y observa cómo el mismo material pasa de hundirse a flotar."
      ],
      moraleja: "Flotar no depende de cuánto pesa algo, sino de qué tan compacto es ese peso para su tamaño. Por eso un portaaviones de 100,000 toneladas flota y una moneda de 5 gramos se hunde.",
      autoverifica: { pregunta: "Si a un submarino le entra agua en sus tanques de lastre, ¿qué le pasa a su densidad promedio?", opciones: ["Aumenta y se hunde", "Disminuye y flota más", "No cambia"], correcta: 0 }
    },
  ],
  cneyt2: [
    { titulo: "¿Por qué un choque a 100 km/h es mucho más grave que uno a 50 km/h, si solo es el doble de rápido?", materia: "CNEyT II · Fuerza y energía mecánica",
      planteamiento: "Si la velocidad se duplica, es tentador pensar que el daño de un choque también se duplica. Antes de calcular: ¿crees que un choque al doble de velocidad es 2 veces más dañino, o mucho más que eso?",
      interactivo: "EnergiaCinetica",
      pasos: [
        "La energía cinética es Ec = ½mv² — el cuadrado de la velocidad, no la velocidad simple.",
        "A 50 km/h, un auto de cierta masa tiene una Ec de referencia (ponle valor 1).",
        "A 100 km/h (el doble de velocidad), la Ec no se duplica: se multiplica por 2² = 4.",
        "Prueba en el interactivo de arriba: duplica la velocidad y observa cómo la energía se cuadruplica, no se duplica."
      ],
      moraleja: "Por eso los límites de velocidad importan tanto: no es una relación de \"el doble de rápido, el doble de peligroso\" — es mucho peor que eso.",
      autoverifica: { pregunta: "Si la velocidad se TRIPLICA (×3), la energía cinética se multiplica por…", opciones: ["3", "6", "9"], correcta: 2 } },
  ],
  cneyt3: [
    { titulo: "¿Por qué hay muchísimas más plantas que leones en cualquier ecosistema?", materia: "CNEyT III · Flujos de materia y energía",
      planteamiento: "En cualquier ecosistema (una selva, un lago) hay muchísimas plantas, bastantes herbívoros, y muy pocos depredadores tope. Antes de ver la explicación: ¿por qué crees que pasa esto?",
      interactivo: "CadenaTrofica",
      pasos: [
        "La energía se transfiere de un nivel trófico al siguiente, pero se pierde una gran parte como calor en cada paso (respiración, movimiento).",
        "En promedio, solo cerca del 10% de la energía de un nivel pasa al siguiente nivel.",
        "Por eso se necesitan muchísimas plantas para sostener pocos herbívoros, y muchos herbívoros para sostener pocos depredadores.",
        "En el interactivo de arriba, cada nivel es más angosto que el anterior — así se ve esa pérdida de energía."
      ],
      moraleja: "Las pirámides ecológicas no son una elección de diseño: son consecuencia directa de que la energía se \"fuga\" como calor en cada eslabón de la cadena.",
      autoverifica: { pregunta: "Si un nivel trófico tiene 10,000 kg de biomasa, ¿cuánta energía aproximada llega al siguiente nivel (10%)?", opciones: ["10,000 kg", "1,000 kg", "9,000 kg"], correcta: 1 } },
  ],
  cneyt4: [
    { titulo: "¿Por qué el vinagre quita el sarro de una plancha o regadera, y el agua sola no?", materia: "CNEyT IV · Ácidos y bases",
      planteamiento: "El sarro (depósitos de cal) es un problema común en regaderas y planchas. El agua sola casi no lo quita, pero el vinagre sí. Antes de ver por qué: ¿qué propiedad química del vinagre crees que hace la diferencia?",
      interactivo: "EscalaPH",
      pasos: [
        "El sarro está compuesto principalmente de carbonato de calcio, una sal que reacciona con los ácidos.",
        "El vinagre es una sustancia ácida (pH bajo, alrededor de 2-3), mientras que el agua pura es neutra (pH 7).",
        "El ácido del vinagre reacciona con el carbonato de calcio y lo disuelve, liberando CO₂ (por eso a veces burbujea un poco).",
        "Prueba en el interactivo de arriba: mueve el indicador de pH hacia la zona ácida y compáralo con sustancias cotidianas."
      ],
      moraleja: "No es magia ni es \"más tallado\": es una reacción ácido-base real. Por eso el vinagre (ácido) funciona contra el sarro (una base/sal), y el agua neutra no.",
      autoverifica: { pregunta: "¿Cuál de estas sustancias esperarías que también sea útil contra el sarro, por ser ácida?", opciones: ["Jugo de limón", "Agua con jabón (básica)", "Agua pura"], correcta: 0 } },
  ],
  cneyt5: [
    { titulo: "¿Por qué un cargador de celular barato se calienta más que uno de marca original?", materia: "CNEyT V · Electromagnetismo",
      planteamiento: "Seguro has notado que algunos cargadores se calientan mucho al usarlos, y otros casi nada. Antes de ver la explicación: ¿qué crees que causa ese calor extra?",
      interactivo: "LeyOhm",
      pasos: [
        "La ley de Ohm dice V = I·R: a mayor resistencia (R) en los componentes internos, se necesita más voltaje para la misma corriente.",
        "Un cargador barato suele usar componentes de menor calidad, con mayor resistencia interna.",
        "Esa resistencia \"extra\" no hace nada útil: solo se convierte en calor (por eso el cargador se siente caliente).",
        "Prueba en el interactivo de arriba: sube la resistencia manteniendo la corriente y observa cuánto voltaje adicional se necesita — esa diferencia se disipa como calor."
      ],
      moraleja: "El calor que sientes en un cargador no es \"normal\": es energía eléctrica que se pierde por una resistencia interna más alta, en vez de convertirse en la carga útil de tu batería.",
      autoverifica: { pregunta: "Si dos cargadores dan la misma corriente pero uno tiene el doble de resistencia interna, ¿cuál se calienta más?", opciones: ["El de mayor resistencia", "El de menor resistencia", "Se calientan igual"], correcta: 0 } },
  ],
  cneyt6: [
    { titulo: "Dos papás con ojos cafés pueden tener un hijo con ojos claros, ¿cómo?", materia: "CNEyT VI · Herencia biológica",
      planteamiento: "El color de ojos café suele ser dominante sobre el claro. Si ambos papás tienen ojos cafés, ¿es posible que tengan un hijo con ojos claros? Antes de ver el cruce genético: ¿tú qué crees?",
      interactivo: "CuadroPunnett",
      pasos: [
        "Si ambos padres son heterocigotos (Aa: cafés pero portadores del alelo recesivo), cada uno puede aportar A o a a sus hijos.",
        "El cuadro de Punnett para Aa × Aa da: 25% AA, 50% Aa, 25% aa.",
        "El 25% aa (homocigoto recesivo) es el único genotipo que se expresa con el rasgo claro — y sí puede ocurrir, aunque ambos padres tengan ojos cafés.",
        "Prueba en el interactivo de arriba: cambia los genotipos de los padres y observa cómo cambian las proporciones esperadas."
      ],
      moraleja: "Que un padre \"se vea\" de cierto rasgo (su fenotipo) no cuenta toda la historia genética: puede portar, sin saberlo, un alelo recesivo que solo se manifiesta si el hijo hereda dos copias de él.",
      autoverifica: { pregunta: "Si uno de los padres fuera aa (ojos claros) y el otro Aa (café portador), ¿qué proporción de hijos esperarías con ojos claros?", opciones: ["25%", "50%", "0%"], correcta: 1 } },
  ],
};

// ---------------------------- MODELO DE DOMINIO (BKT-lite, bitácora 2 jul 2026)
const UMBRAL_DOMINIO = 90;      // confianza mínima
const CONSEC_DOMINIO = 7;       // ~7-10 aciertos consecutivos (mastery learning / ITS)
const nivelDeConf = (conf) => (conf < 40 ? 1 : conf < 75 ? 2 : 3);
const NOMBRE_NIVEL = { 1: "Andamiaje", 2: "Consolidación", 3: "Reto" };

function propVacio() {
  return { conf: 0, consec: 0, vistas: 0, correctas: 0, msSum: 0, msN: 0, dominado: false };
}
function actualizarProp(p, correcto, ms) {
  const n = { ...p };
  n.vistas += 1;
  if (correcto) {
    n.conf = Math.min(100, n.conf + 8 + 2 * Math.min(n.consec, 5)); // gana más con racha
    n.consec += 1;
    n.correctas += 1;
    n.msSum += ms; n.msN += 1;
  } else {
    n.conf = Math.max(0, n.conf - 15); // el error pesa: la confianza baja
    n.consec = 0;
  }
  n.dominado = n.conf >= UMBRAL_DOMINIO && n.consec >= CONSEC_DOMINIO;
  return n;
}
function fluidez(p) {
  if (!p || p.msN < 3) return null;
  const avg = p.msSum / p.msN;
  if (avg < 12000) return { label: "Ágil", em: "⚡" };
  if (avg < 25000) return { label: "Constante", em: "🚶" };
  return { label: "Con calma", em: "🐢" };
}

// ---------------------------- GRÁFICA (rectas de PM III)
function PlotSVG({ spec }) {
  if (!spec) return null;
  const W = 260, H = 180, pad = 6;
  const xmin = -6, xmax = 6, ymin = -6, ymax = 6;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const grid = [];
  for (let g = xmin; g <= xmax; g++) grid.push(<line key={"v" + g} x1={X(g)} y1={pad} x2={X(g)} y2={H - pad} stroke="#e6ddc6" strokeWidth="1" />);
  for (let g = ymin; g <= ymax; g++) grid.push(<line key={"h" + g} x1={pad} y1={Y(g)} x2={W - pad} y2={Y(g)} stroke="#e6ddc6" strokeWidth="1" />);
  let d = "", pen = false;
  for (let i = 0; i <= 200; i++) {
    const x = xmin + ((xmax - xmin) * i) / 200;
    const y = spec.m * x + spec.b;
    if (y < ymin - 1 || y > ymax + 1) { pen = false; continue; }
    d += (pen ? " L " : " M ") + X(x).toFixed(1) + " " + Y(y).toFixed(1);
    pen = true;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 300, display: "block", margin: "10px auto", background: "#FBF7EA", border: "1px solid #d9cfae", borderRadius: 8 }}>
      {grid}
      <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1.5" />
      <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1.5" />
      <path d={d} fill="none" stroke={CI.milpa} strokeWidth="2.5" />
      {(spec.points || []).map((p, i) => (
        <circle key={i} cx={X(p.x)} cy={Y(p.y)} r="4.5" fill={CI.maiz} stroke={CI.ink} strokeWidth="1.2" />
      ))}
    </svg>
  );
}

// ---------------------------- MILPA (la racha crece)
function Milpa({ racha }) {
  const etapa = Math.min(5, Math.floor(racha / 3)); // cada 3 aciertos seguidos, crece
  const hojas = [];
  for (let i = 0; i < etapa * 2; i++) {
    const lado = i % 2 === 0 ? -1 : 1;
    const yBase = 86 - i * 12;
    hojas.push(
      <path key={i}
        d={`M 50 ${yBase} q ${18 * lado} -6 ${26 * lado} -18 q ${-14 * lado} 10 ${-26 * lado} 12 z`}
        fill={i >= etapa * 2 - 2 ? "#6FA05C" : CI.milpa} opacity="0.95" />
    );
  }
  return (
    <svg viewBox="0 0 100 100" style={{ width: 92, height: 92 }} aria-label={`Milpa, racha ${racha}`}>
      <ellipse cx="50" cy="92" rx="30" ry="6" fill="#B08650" opacity="0.5" />
      <rect x="47.5" y={92 - 12 - etapa * 13} width="5" height={12 + etapa * 13} rx="2.5" fill={CI.milpa} />
      {hojas}
      {etapa >= 4 && <ellipse cx="50" cy={92 - 16 - etapa * 13} rx="7" ry="12" fill={CI.maiz} stroke="#B08650" strokeWidth="1.5" />}
      {etapa === 0 && <circle cx="50" cy="86" r="5" fill="#6FA05C" />}
    </svg>
  );
}

// ---------------------------- LIBRERÍA DE ANIMACIONES (interactivos de la sección Aprender)
//  Una sola fuente por progresión: el mismo interactivo que se ve aquí, pausado,
//  es la figura del cuadernillo; su lógica alimenta los generadores de práctica.
// Paleta central. Es un objeto MUTABLE: cambiar de tema hace Object.assign sobre
// él y re-renderiza; como todos los componentes leen CI.* en cada render, la app
// entera cambia de color sin refactorizar. TEMAS más abajo.
const CI = { milpaD: "#2F5233", milpa: "#3D6B35", milpaS: "#EAF1E3", maiz: "#D9A526", maizS: "#FBF3DC", ink: "#2E2A21", muted: "#8a7a5c", surco: "#6B4F2A", papel: "#F6F1E3", papel2: "#FFFDF6", linea: "#cabf9d", rojo: "#B4432E", azul: "#355070", inkSoft: "#5c5138", campo: "#fff", track: "#EDE6D2", punto: "#e8e0ca", fbOk: "#E7F0DF", fbNo: "#F6E3DE" };

// TEMAS: cada uno sobreescribe claves de CI. "campo" es el default (valores de arriba).
const TEMAS = {
  campo: { nombre: "Cuaderno de campo", overrides: {} },
  sepia: { nombre: "Sepia cálido", overrides: { papel: "#F3E9D8", papel2: "#FBF5E9", campo: "#FCF8F0", milpa: "#8A5A2B", milpaD: "#6B4423", milpaS: "#EFE0C8", maiz: "#C8862A", azul: "#7A5C3A", track: "#E6D7BE", punto: "#e2d2b4", linea: "#cbb48f", surco: "#6B4F2A" } },
  contraste: { nombre: "Alto contraste", overrides: { papel: "#FFFFFF", papel2: "#FFFFFF", campo: "#FFFFFF", ink: "#000000", muted: "#333333", inkSoft: "#222222", milpa: "#0B5A0B", milpaD: "#063806", azul: "#0A3A7A", rojo: "#B00000", maiz: "#B8860B", linea: "#000000", track: "#E0E0E0", punto: "#ffffff" } },
};
function aplicarTema(id) { const base = { milpaD: "#2F5233", milpa: "#3D6B35", milpaS: "#EAF1E3", maiz: "#D9A526", maizS: "#FBF3DC", ink: "#2E2A21", muted: "#8a7a5c", surco: "#6B4F2A", papel: "#F6F1E3", papel2: "#FFFDF6", linea: "#cabf9d", rojo: "#B4432E", azul: "#355070", inkSoft: "#5c5138", campo: "#fff", track: "#EDE6D2", punto: "#e8e0ca", fbOk: "#E7F0DF", fbNo: "#F6E3DE" }; Object.assign(CI, base, (TEMAS[id] || TEMAS.campo).overrides); }

function BarraPorcentaje() {
  const [N, setN] = useState(200);
  const [p, setP] = useState(30);
  const valor = Math.round((N * p) / 100 * 100) / 100;
  const filled = Math.round(p);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 20, fontWeight: 800, color: CI.milpaD, marginBottom: 12 }}>
        {p}% de {N} = <span style={{ color: CI.surco }}>{valor}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(50,1fr)", gap: 1.5, marginBottom: 6 }}>
        {Array.from({ length: 100 }).map((_, i) => (
          <div key={i} style={{ paddingBottom: "100%", background: i < filled ? CI.maiz : "#fff", border: `1px solid ${i < filled ? CI.surco : CI.linea}`, borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: CI.muted, marginBottom: 12 }}>
        <span>0</span><span>la barra entera = {N} (el 100%)</span><span>{N}</span>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginBottom: 8 }}>Cantidad total (N): <b style={{ color: CI.ink }}>{N}</b>
        <input type="range" min={20} max={500} step={10} value={N} onChange={(e) => setN(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Porcentaje (p): <b style={{ color: CI.ink }}>{p}%</b>
        <input type="range" min={1} max={100} value={p} onChange={(e) => setP(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
        Todo porcentaje es una proporción con base 100: el {p}% pinta {filled} de cada 100 partes, y esas partes, sobre {N}, valen {valor}.
      </p>
    </div>
  );
}

function Parabola() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(-4);
  const [c, setC] = useState(3);
  const curvaRef = useRef(null);
  useEffect(() => { trazarSVG(curvaRef.current, 0.9); }, []); // dibuja la curva al aparecer
  const xv = -b / (2 * a), yv = a * xv * xv + b * xv + c, disc = b * b - 4 * a * c;
  const nR = disc > 0 ? 2 : disc === 0 ? 1 : 0;
  let raices = [];
  if (disc >= 0) { const rr = Math.sqrt(disc); raices = [(-b - rr) / (2 * a), (-b + rr) / (2 * a)].sort((x, y) => x - y); }
  const W = 320, H = 240, pad = 22, xmin = -8, xmax = 8, ymin = -10, ymax = 10;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const pts = [];
  for (let x = xmin; x <= xmax; x += 0.1) { const y = a * x * x + b * x + c; if (y >= ymin - 2 && y <= ymax + 2) pts.push(`${X(x)},${Y(y)}`); }
  const r2v = (v) => Math.round(v * 100) / 100;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        {[-6, -4, -2, 2, 4, 6].map((g) => <line key={"v" + g} x1={X(g)} y1={Y(ymin)} x2={X(g)} y2={Y(ymax)} stroke="#EDE6D2" strokeWidth="0.8" />)}
        {[-8, -4, 4, 8].map((g) => <line key={"h" + g} x1={X(xmin)} y1={Y(g)} x2={X(xmax)} y2={Y(g)} stroke="#EDE6D2" strokeWidth="0.8" />)}
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1.2" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1.2" />
        {Math.abs(xv) <= xmax && <line x1={X(xv)} y1={Y(ymin)} x2={X(xv)} y2={Y(ymax)} stroke={CI.azul} strokeWidth="1.1" strokeDasharray="4 3" opacity="0.8" />}
        <polyline ref={curvaRef} points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.6" />
        {raices.map((rx, i) => Math.abs(rx) <= xmax && <circle key={i} cx={X(rx)} cy={Y(0)} r="4" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.2" />)}
        {Math.abs(xv) <= xmax && Math.abs(yv) <= ymax && <circle cx={X(xv)} cy={Y(yv)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.4" />}
      </svg>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12.5, margin: "10px 0", color: CI.ink }}>
        <span style={{ background: CI.milpaS, padding: "2px 8px", borderRadius: 6 }}>abre {a > 0 ? "arriba" : "abajo"}</span>
        <span>vértice <b style={{ color: CI.rojo }}>({r2v(xv)}, {r2v(yv)})</b></span>
        <span>discriminante <b>{r2v(disc)}</b></span>
        <span><b style={{ color: CI.surco }}>{nR}</b> raíz(ces){raices.length ? ": " + raices.map(r2v).join(", ") : ""}</span>
      </div>
      {[["a (abre/cierra)", a, setA, -3, 3], ["b (desplaza)", b, setB, -6, 6], ["c (altura)", c, setC, -6, 6]].map(([lab, val, set, mn, mx]) => (
        <label key={lab} style={{ display: "block", fontSize: 12.5, color: CI.muted, marginBottom: 7 }}>{lab}: <b style={{ color: CI.ink }}>{val}</b>
          <input type="range" min={mn} max={mx} step={1} value={val} onChange={(e) => set(+e.target.value || (lab[0] === "a" ? 1 : 0))} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      ))}
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 4, lineHeight: 1.5 }}>
        El <b style={{ color: CI.rojo }}>vértice</b> (rojo) está en x = −b/2a. Las <b style={{ color: CI.surco }}>raíces</b> (naranja) aparecen solo si el discriminante es ≥ 0.
      </p>
      <PanelSimulador titulo="🎮 Simulador: lanza un proyectil (parábola real)" nota="Toca a la izquierda para lanzar: la gravedad curva la trayectoria en una parábola — la misma forma de la ecuación. Mientras más arriba toques, más alto el lanzamiento.">
        <LienzoFisica alto={200}
          setup={(api) => { const { Matter, world, H } = api; const { Bodies, World } = Matter; World.add(world, Bodies.rectangle(20, H - 10, 60, 12, { isStatic: true, render: { fillStyle: CI.surco } })); }}
          onTap={(api, x, y) => { const { Matter, world, H } = api; const { Bodies, World, Body } = Matter; const b = Bodies.circle(24, H - 24, 9, { restitution: 0.5, friction: 0.02, render: { fillStyle: CI.rojo, strokeStyle: CI.ink, lineWidth: 1.4 } }); World.add(world, b); const fuerza = Math.max(4, (H - y) / 16); Body.setVelocity(b, { x: 6 + Math.random() * 2, y: -fuerza }); }}
        />
      </PanelSimulador>
    </div>
  );
}

// ---------------------------- BALANZA DE ECUACIONES (explica el proceso, con salto)
function nuevaEcuacion() {
  const a = 2 + Math.floor(Math.random() * 4); // 2..5
  const xT = 2 + Math.floor(Math.random() * 7); // 2..8
  const b = 1 + Math.floor(Math.random() * 10); // 1..10
  return { a, b, c: a * xT + b, x: xT };
}
function BalanzaEcuacion() {
  const [eq, setEq] = useState(nuevaEcuacion);
  const [paso, setPaso] = useState(0); // 0: inicial, 1: quitar b, 2: dividir entre a, 3: solución
  const [flash, setFlash] = useState(false);
  const { a, b, c, x } = eq;
  const avanzar = () => { setPaso((p) => Math.min(3, p + 1)); setFlash(true); setTimeout(() => setFlash(false), 480); };
  const saltar = () => { setPaso(3); setFlash(true); setTimeout(() => setFlash(false), 480); };
  const reiniciar = () => { setEq(nuevaEcuacion()); setPaso(0); };

  // cantidades visibles por paso
  const leftX = paso >= 2 ? 1 : a;
  const leftUnits = paso >= 1 ? 0 : b;
  const rightUnits = paso === 0 ? c : paso === 1 ? c - b : paso >= 2 ? Math.round((c - b) / a) : c - b;
  const grupos = paso >= 2 ? a : 1; // paso 2-3: separado en "a" grupos visualmente

  const Block = ({ label, color }) => (
    <div style={{ width: 26, height: 26, borderRadius: 5, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 800, margin: 2, boxShadow: "1.5px 1.5px 0 #2E2A21" }}>{label}</div>
  );
  const Pan = ({ xCount, uCount, side }) => (
    <div style={{
      minWidth: 128, minHeight: 74, background: CI.papel2, border: "2px solid #2E2A21", borderRadius: 10,
      display: "flex", flexWrap: "wrap", alignContent: "flex-start", padding: 6, gap: 0,
      transform: flash ? "scale(1.05)" : "scale(1)", transition: "transform 0.28s ease",
      boxShadow: flash ? "0 0 0 3px #D9A526" : "none",
    }}>
      {Array.from({ length: xCount }).map((_, i) => <Block key={"x" + i} label="x" color={CI.azul} />)}
      {Array.from({ length: uCount }).map((_, i) => <Block key={"u" + i} label="1" color={CI.milpa} />)}
      {xCount === 0 && uCount === 0 && <span style={{ color: CI.muted, fontSize: 11, padding: 4 }}>vacío</span>}
    </div>
  );
  const notas = [
    `Empezamos: ${a}x + ${b} = ${c}. La balanza representa la igualdad — ambos lados pesan lo mismo.`,
    `Quitamos ${b} de AMBOS lados. La balanza sigue en equilibrio: ${a}x = ${c - b}.`,
    `Dividimos ambos lados entre ${a} (separamos en ${a} grupos iguales). Un grupo = la solución: x = ${Math.round((c - b) / a)}.`,
    `Solución: x = ${x}. Comprueba: ${a}(${x}) + ${b} = ${a * x + b} = ${c}. ✓`,
  ];
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 17, fontWeight: 800, color: CI.milpaD, marginBottom: 4 }}>
        {paso === 0 ? `${a}x + ${b} = ${c}` : paso === 1 ? `${a}x = ${c - b}` : `x = ${Math.round((c - b) / a)}`}
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 8, margin: "14px 0 6px" }}>
        {/* fiel a una balanza: viga + dos platos */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Pan xCount={leftX} uCount={leftUnits} side="left" />
          <div style={{ fontSize: 11, color: CI.muted, marginTop: 4 }}>lado izquierdo</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: CI.ink, marginBottom: 30 }}>=</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <Pan xCount={0} uCount={rightUnits} side="right" />
          <div style={{ fontSize: 11, color: CI.muted, marginTop: 4 }}>lado derecho</div>
        </div>
      </div>
      <div style={{ background: "#E7ECF3", borderLeft: "4px solid #355070", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: CI.ink, margin: "10px 0" }}>
        <b>Paso {paso + 1} de 4.</b> {notas[paso]}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={avanzar} disabled={paso === 3} className="tab on" style={{ flex: 1, padding: "9px", opacity: paso === 3 ? 0.5 : 1 }}>Siguiente paso →</button>
        <button onClick={saltar} disabled={paso === 3} className="tab" style={{ padding: "9px 12px" }}>Saltar a la solución</button>
        <button onClick={reiniciar} className="tab" style={{ padding: "9px 12px" }}>Nuevo ejemplo</button>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
        Cada bloque «x» pesa lo mismo (el valor desconocido); cada bloque «1» es una unidad. Lo que le haces a un lado de la balanza, se lo haces al otro — por eso se mantiene el equilibrio.
      </p>
    </div>
  );
}

// ---------------------------- RECTA INTERACTIVA (y = mx + b)
function RectaInteractiva() {
  const [m, setM] = useState(1);
  const [b, setB] = useState(1);
  const curvaRef = useRef(null);
  useEffect(() => { trazarSVG(curvaRef.current, 0.8); }, []);
  const W = 320, H = 240, pad = 22, xmin = -8, xmax = 8, ymin = -10, ymax = 10;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const f = (x) => m * x + b;
  const x1 = -8, x2 = 8;
  // triángulo de pendiente entre x=0 y x=2 (run=2)
  const run = 2, x0 = 0, y0 = f(x0), y1r = f(x0 + run);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: "1.5px solid #2E2A21" }}>
        {[-6, -4, -2, 2, 4, 6].map((g) => <line key={"v" + g} x1={X(g)} y1={Y(ymin)} x2={X(g)} y2={Y(ymax)} stroke="#EDE6D2" strokeWidth="0.8" />)}
        {[-8, -4, 4, 8].map((g) => <line key={"h" + g} x1={X(xmin)} y1={Y(g)} x2={X(xmax)} y2={Y(g)} stroke="#EDE6D2" strokeWidth="0.8" />)}
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1.2" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1.2" />
        <line ref={curvaRef} x1={X(x1)} y1={Y(f(x1))} x2={X(x2)} y2={Y(f(x2))} stroke={CI.milpa} strokeWidth="2.6" />
        {/* triángulo pendiente rise/run */}
        {Math.abs(y0) <= ymax && Math.abs(y1r) <= ymax && (
          <>
            <line x1={X(x0)} y1={Y(y0)} x2={X(x0 + run)} y2={Y(y0)} stroke={CI.maiz} strokeWidth="1.6" strokeDasharray="3 2" />
            <line x1={X(x0 + run)} y1={Y(y0)} x2={X(x0 + run)} y2={Y(y1r)} stroke={CI.maiz} strokeWidth="1.6" strokeDasharray="3 2" />
            <text x={(X(x0) + X(x0 + run)) / 2} y={Y(y0) + 13} fontSize="9" fill="#B08650" textAnchor="middle">run={run}</text>
            <text x={X(x0 + run) + 5} y={(Y(y0) + Y(y1r)) / 2} fontSize="9" fill="#B08650">rise={m * run}</text>
          </>
        )}
        {/* intersección con eje y */}
        {Math.abs(b) <= ymax && <circle cx={X(0)} cy={Y(b)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.3" />}
      </svg>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, margin: "8px 0" }}>
        y = {m}x {b >= 0 ? "+ " + b : "− " + Math.abs(b)}
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginBottom: 8 }}>Pendiente (m): <b style={{ color: CI.ink }}>{m}</b>
        <input type="range" min={-4} max={4} step={1} value={m} onChange={(e) => setM(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Ordenada al origen (b): <b style={{ color: CI.ink }}>{b}</b>
        <input type="range" min={-6} max={6} step={1} value={b} onChange={(e) => setB(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
        <b style={{ color: CI.rojo }}>b</b> (rojo) es donde la recta cruza el eje y. <b style={{ color: "#B08650" }}>m</b> es cuánto sube (o baja) la recta por cada paso a la derecha — el triángulo amarillo lo muestra.
      </p>
    </div>
  );
}

// ---------------------------- LENGUAJE ALGEBRAICO (traductor con valor en vivo)
const FRASES_ALG = [
  { frase: "El doble de un número aumentado en 5", expr: "2n + 5", f: (n) => 2 * n + 5 },
  { frase: "El triple de un número disminuido en 4", expr: "3n − 4", f: (n) => 3 * n - 4 },
  { frase: "La mitad de un número aumentado en 3", expr: "n/2 + 3", f: (n) => n / 2 + 3 },
  { frase: "Un número disminuido en 7, todo por 2", expr: "2(n − 7)", f: (n) => 2 * (n - 7) },
];
function TraductorAlgebraico() {
  const [idx, setIdx] = useState(0);
  const [n, setN] = useState(4);
  const item = FRASES_ALG[idx];
  return (
    <div>
      <div style={{ background: CI.papel2, border: "1.5px solid #2E2A21", borderRadius: 10, padding: "16px", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: CI.muted, marginBottom: 6 }}>«{item.frase}»</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: CI.azul, margin: "10px 0" }}>{item.expr}</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, alignItems: "center", fontSize: 15 }}>
          <span>con n = <b style={{ color: CI.ink }}>{n}</b></span>
          <span style={{ color: CI.muted }}>→</span>
          <span style={{ background: CI.milpaS, padding: "4px 12px", borderRadius: 8, fontWeight: 800, color: CI.milpaD }}>{item.expr.replace(/n/g, n)} = {item.f(n)}</span>
        </div>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, margin: "12px 0 6px" }}>Cambia el número (n): <b style={{ color: CI.ink }}>{n}</b>
        <input type="range" min={0} max={20} value={n} onChange={(e) => setN(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        {FRASES_ALG.map((f, i) => (
          <button key={i} onClick={() => setIdx(i)} className={`tab ${i === idx ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }}>Frase {i + 1}</button>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
        No importa qué número elijas: la traducción a lenguaje algebraico funciona igual para CUALQUIER n. Esa es la ventaja de usar una letra en vez de un número fijo.
      </p>
    </div>
  );
}

// ---------------------------- CLASIFICADOR DE EXPRESIONES (construir y clasificar en vivo)
function clasificaExpr(n) { return n === 1 ? "monomio" : n === 2 ? "binomio" : n === 3 ? "trinomio" : "polinomio"; }
function ClasificadorExpresion() {
  const [terminos, setTerminos] = useState(["5x²"]);
  const POOL = ["5x²", "3x", "7", "−2xy", "x³", "4y", "−8", "6x²y"];
  const agregar = () => { if (terminos.length < 6) setTerminos((t) => [...t, POOL[t.length % POOL.length]]); };
  const quitar = () => setTerminos((t) => (t.length > 1 ? t.slice(0, -1) : t));
  const clase = clasificaExpr(terminos.length);
  const colorClase = { monomio: CI.azul, binomio: CI.milpa, trinomio: "#B08650", polinomio: CI.rojo }[clase];
  return (
    <div>
      <div style={{ background: CI.papel2, border: "1.5px solid #2E2A21", borderRadius: 10, padding: "16px", textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: CI.ink, marginBottom: 10 }}>
          {terminos.map((t, i) => (
            <span key={i}>{i > 0 && <span style={{ color: CI.muted }}> + </span>}<span style={{ background: CI.maizS, padding: "2px 6px", borderRadius: 5 }}>{t}</span></span>
          ))}
        </div>
        <div style={{ display: "inline-block", background: colorClase, color: "#fff", fontWeight: 800, padding: "5px 16px", borderRadius: 999, fontSize: 14 }}>
          {terminos.length} término{terminos.length > 1 ? "s" : ""} → {clase}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={agregar} disabled={terminos.length >= 6} className="tab on" style={{ flex: 1, padding: "9px", opacity: terminos.length >= 6 ? 0.5 : 1 }}>+ Agregar término</button>
        <button onClick={quitar} disabled={terminos.length <= 1} className="tab" style={{ flex: 1, padding: "9px", opacity: terminos.length <= 1 ? 0.5 : 1 }}>− Quitar término</button>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
        La clasificación solo cuenta CUÁNTOS términos hay, separados por + o −. No importa el tamaño del exponente ni cuántas variables tenga cada término.
      </p>
    </div>
  );
}

// ---------------------------- MODELO DE ÁREA: monomios y factor común
function ModeloAreaMonomios() {
  const [a, setA] = useState(3);
  const [b, setB] = useState(2);
  const px = 22; // escala px por unidad
  const W = a * px, H = b * px;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        (a x)(b) = ab · x &nbsp;→&nbsp; con a={a}, b={b}: área = {a * b}
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg viewBox={`0 0 260 200`} style={{ width: 260, height: 200 }}>
          <rect x={40} y={20} width={a * px} height={b * px} fill={CI.maizS} stroke={CI.ink} strokeWidth="1.5" />
          {Array.from({ length: a }).map((_, i) => (
            <line key={"v" + i} x1={40 + i * px} y1={20} x2={40 + i * px} y2={20 + b * px} stroke="#D9CFAE" strokeWidth="1" />
          ))}
          {Array.from({ length: b }).map((_, i) => (
            <line key={"h" + i} x1={40} y1={20 + i * px} x2={40 + a * px} y2={20 + i * px} stroke="#D9CFAE" strokeWidth="1" />
          ))}
          <text x={40 + (a * px) / 2} y={14} fontSize="11" textAnchor="middle" fill={CI.surco}>{a} (largo)</text>
          <text x={30} y={20 + (b * px) / 2} fontSize="11" textAnchor="middle" fill={CI.surco} transform={`rotate(-90 30 ${20 + (b * px) / 2})`}>{b} (ancho)</text>
          <text x={40 + (a * px) / 2} y={20 + (b * px) / 2 + 4} fontSize="14" fontWeight="800" textAnchor="middle" fill={CI.milpaD}>{a * b}</text>
        </svg>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 4 }}>a: <b style={{ color: CI.ink }}>{a}</b>
        <input type="range" min={1} max={7} value={a} onChange={(e) => setA(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>b: <b style={{ color: CI.ink }}>{b}</b>
        <input type="range" min={1} max={5} value={b} onChange={(e) => setB(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
        Multiplicar dos monomios es armar un rectángulo: el área (el producto) se ve directamente en la cuadrícula. Por eso multiplicar coeficientes y sumar exponentes no es un truco: es geometría.
      </p>
    </div>
  );
}

// ---------------------------- CUADRADO DE UN BINOMIO (a+b)² — modelo geométrico clásico
function CuadradoBinomio() {
  const [a, setA] = useState(3);
  const [b, setB] = useState(2);
  const px = 20;
  const total = a + b;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        (a + b)² = a² + 2ab + b²  &nbsp;→&nbsp; ({a}+{b})² = {total * total}
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg viewBox="0 0 240 240" style={{ width: 220, height: 220 }}>
          <g transform="translate(30,20)">
            <rect x={0} y={0} width={a * px} height={a * px} fill={CI.milpaS} stroke={CI.ink} strokeWidth="1.3" />
            <text x={(a * px) / 2} y={(a * px) / 2 + 4} fontSize="12" textAnchor="middle" fontWeight="700" fill={CI.milpaD}>a² = {a * a}</text>
            <rect x={a * px} y={0} width={b * px} height={a * px} fill={CI.maizS} stroke={CI.ink} strokeWidth="1.3" />
            <text x={a * px + (b * px) / 2} y={(a * px) / 2 + 4} fontSize="11" textAnchor="middle" fontWeight="700" fill="#B08650">ab={a * b}</text>
            <rect x={0} y={a * px} width={a * px} height={b * px} fill={CI.maizS} stroke={CI.ink} strokeWidth="1.3" />
            <text x={(a * px) / 2} y={a * px + (b * px) / 2 + 4} fontSize="11" textAnchor="middle" fontWeight="700" fill="#B08650">ab={a * b}</text>
            <rect x={a * px} y={a * px} width={b * px} height={b * px} fill="#F6E3DE" stroke={CI.ink} strokeWidth="1.3" />
            <text x={a * px + (b * px) / 2} y={a * px + (b * px) / 2 + 4} fontSize="12" textAnchor="middle" fontWeight="700" fill={CI.rojo}>b² = {b * b}</text>
            <text x={(a * px) / 2} y={-6} fontSize="10" textAnchor="middle" fill={CI.muted}>a</text>
            <text x={a * px + (b * px) / 2} y={-6} fontSize="10" textAnchor="middle" fill={CI.muted}>b</text>
          </g>
        </svg>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 4 }}>a: <b style={{ color: CI.ink }}>{a}</b>
        <input type="range" min={1} max={6} value={a} onChange={(e) => setA(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>b: <b style={{ color: CI.ink }}>{b}</b>
        <input type="range" min={1} max={5} value={b} onChange={(e) => setB(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
        El cuadrado grande de lado (a+b) se parte en 4 piezas: un cuadrado a², dos rectángulos iguales ab, y un cuadrado b². Sumar las 4 piezas da exactamente a² + 2ab + b² — la fórmula es literalmente el área del cuadrado.
      </p>
    </div>
  );
}

// ---------------------------- IDENTIDAD O ECUACIÓN (probar varios valores de x)
const CASOS_IGUALDAD = [
  { texto: "2(x + 3) = 2x + 6", tipo: "identidad", L: (x) => 2 * (x + 3), R: (x) => 2 * x + 6 },
  { texto: "3x + 1 = 10", tipo: "ecuación", L: (x) => 3 * x + 1, R: (x) => 10 },
  { texto: "5(x − 1) = 5x − 5", tipo: "identidad", L: (x) => 5 * (x - 1), R: (x) => 5 * x - 5 },
  { texto: "x + 4 = 2x", tipo: "ecuación", L: (x) => x + 4, R: (x) => 2 * x },
];
function IdentidadOEcuacion() {
  const [idx, setIdx] = useState(0);
  const [probadas, setProbadas] = useState([]);
  const item = CASOS_IGUALDAD[idx];
  const probar = (x) => setProbadas((p) => (p.includes(x) ? p : [...p, x].slice(-5)));
  const cambiar = (i) => { setIdx(i); setProbadas([]); };
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 19, fontWeight: 800, color: CI.ink, marginBottom: 12 }}>{item.texto}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 10 }}>
        {[-2, -1, 0, 1, 2, 3, 5].map((x) => (
          <button key={x} onClick={() => probar(x)} className="tab" style={{ padding: "7px 11px", fontSize: 13 }}>x = {x}</button>
        ))}
      </div>
      {probadas.length > 0 && (
        <div style={{ background: CI.papel2, border: "1.5px solid #2E2A21", borderRadius: 10, padding: 10 }}>
          {probadas.map((x) => {
            const l = item.L(x), r = item.R(x), ok = l === r;
            return (
              <div key={x} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 2px", borderBottom: "1px solid #EDE6D2" }}>
                <span>x = {x}: izquierda = {l}, derecha = {r}</span>
                <span style={{ color: ok ? CI.milpa : CI.rojo, fontWeight: 800 }}>{ok ? "✓ igual" : "✗ distinto"}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ textAlign: "center", marginTop: 10, fontSize: 13, fontWeight: 700, color: item.tipo === "identidad" ? CI.milpa : "#B08650" }}>
        {probadas.length >= 3 ? (item.tipo === "identidad" ? "Se cumple SIEMPRE → es una identidad" : "Solo se cumple para un valor → es una ecuación") : "Prueba al menos 3 valores de x"}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {CASOS_IGUALDAD.map((c, i) => (
          <button key={i} onClick={() => cambiar(i)} className={`tab ${i === idx ? "on" : ""}`} style={{ padding: "6px 10px", fontSize: 12 }}>Caso {i + 1}</button>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
        Si la igualdad se cumple para CUALQUIER x que pruebes, es una identidad (ambos lados son la misma expresión, solo escrita distinto). Si solo se cumple para un x específico, es una ecuación.
      </p>
    </div>
  );
}

// ============================================================================
// INTERACTIVOS NUEVOS (v5) — un motor en vivo por propósito graficable.
// Mismo patrón que los originales: useState para parámetros, SVG que se
// redibuja al mover deslizadores, y explicación "¿por qué funciona?".
// Paleta CI ya definida arriba.
// ============================================================================

// ---- PM V ----

// PF1 · Tasa de variación promedio: secante entre dos puntos de una parábola
function TasaVariacion() {
  const [x1, setX1] = useState(1);
  const [x2, setX2] = useState(4);
  const f = (x) => x * x; // f(x)=x²
  const y1 = f(x1), y2 = f(x2);
  const tvm = x2 !== x1 ? r2ci((y2 - y1) / (x2 - x1)) : "—";
  const W = 300, H = 220, pad = 26, xmin = -1, xmax = 6, ymin = -2, ymax = 36;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const pts = [];
  for (let x = xmin; x <= xmax; x += 0.1) { const y = f(x); if (y <= ymax + 2) pts.push(`${X(x)},${Y(y)}`); }
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        f(x) = x²  ·  TVM entre x={x1} y x={x2} = <span style={{ color: CI.rojo }}>{tvm}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1.1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1.1" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        {x2 !== x1 && <line x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} stroke={CI.rojo} strokeWidth="2" strokeDasharray="5 3" />}
        <circle cx={X(x1)} cy={Y(y1)} r="4.5" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.2" />
        <circle cx={X(x2)} cy={Y(y2)} r="4.5" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.2" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>x₁: <b style={{ color: CI.ink }}>{x1}</b>
        <input type="range" min={0} max={5} step={1} value={x1} onChange={(e) => setX1(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>x₂: <b style={{ color: CI.ink }}>{x2}</b>
        <input type="range" min={0} max={5} step={1} value={x2} onChange={(e) => setX2(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Acerca x₂ a x₁ hasta que casi coincidan: verás que la recta secante (roja) empieza a verse igual que la curva misma en ese punto — así es como la secante se convierte en tangente.</p>
    </div>
  );
}

// PF6 · La derivada: regla de la potencia con visualización de la tangente
function DerivadaPotencia() {
  const [x0, setX0] = useState(1);
  const f = (x) => x * x; // f(x)=x²
  const df = (x) => 2 * x; // f'(x)=2x
  const m = df(x0), y0 = f(x0);
  const W = 300, H = 220, pad = 26, xmin = -3, xmax = 3, ymin = -1, ymax = 9;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const pts = [];
  for (let x = xmin; x <= xmax; x += 0.05) { const y = f(x); if (y <= ymax + 1) pts.push(`${X(x)},${Y(y)}`); }
  const tanX1 = xmin, tanX2 = xmax;
  const tanY1 = m * (tanX1 - x0) + y0, tanY2 = m * (tanX2 - x0) + y0;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        f(x)=x² → f'(x)=2x · pendiente en x={x0}: <span style={{ color: CI.rojo }}>{m}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1.1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1.1" />
        <line x1={X(tanX1)} y1={Y(tanY1)} x2={X(tanX2)} y2={Y(tanY2)} stroke={CI.rojo} strokeWidth="2" strokeDasharray="5 3" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        <circle cx={X(x0)} cy={Y(y0)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.4" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Punto x: <b style={{ color: CI.ink }}>{x0}</b>
        <input type="range" min={-2} max={2} step={0.5} value={x0} onChange={(e) => setX0(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>En x=0 la recta tangente queda perfectamente horizontal (pendiente 0): es el fondo de la parábola, ni sube ni baja en ese instante exacto.</p>
    </div>
  );
}

// PF7 · Optimización: área de un corral vs. su lado (parábola invertida)
function Optimizacion() {
  const [x, setX] = useState(10);
  const P = 40; // perímetro fijo
  const y = P / 2 - x;
  const area = x * y;
  const xOpt = P / 4;
  const W = 300, H = 210, pad = 26, xmin = 0, xmax = 20, ymin = 0, ymax = 110;
  const X = (v) => pad + ((v - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (v) => H - pad - ((v - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const pts = [];
  for (let v = xmin; v <= xmax; v += 0.3) { const a = v * (P / 2 - v); if (a >= 0) pts.push(`${X(v)},${Y(a)}`); }
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15.5, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        lado {x} × {y} → área <span style={{ color: area === xOpt * xOpt ? CI.rojo : CI.surco }}>{area} m²</span>{x === xOpt ? " ★ máx" : ""}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1.1" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        <line x1={X(xOpt)} y1={Y(0)} x2={X(xOpt)} y2={Y(100)} stroke={CI.azul} strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
        <circle cx={X(x)} cy={Y(area)} r="5" fill={x === xOpt ? CI.rojo : CI.maiz} stroke={CI.surco} strokeWidth="1.3" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Lado x (m): <b style={{ color: CI.ink }}>{x}</b>
        <input type="range" min={1} max={19} step={1} value={x} onChange={(e) => setX(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Prueba con x=5 o x=15 (lejos del óptimo): el área baja en ambos casos. Eso confirma que x=10 no es cualquier valor, sino el único máximo de toda la curva.</p>
    </div>
  );
}

// ---- PM VI ----

// PF3 · Teoría de conjuntos: diagrama de Venn con unión/intersección en vivo
function VennConjuntos() {
  const [soloA, setSoloA] = useState(3);
  const [inter, setInter] = useState(2);
  const [soloB, setSoloB] = useState(4);
  const totalA = soloA + inter, totalB = soloB + inter;
  const union = soloA + inter + soloB;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        |A∪B| = {totalA} + {totalB} − {inter} = <span style={{ color: CI.rojo }}>{union}</span>
      </div>
      <svg viewBox="0 0 300 170" style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <circle cx="115" cy="85" r="70" fill={CI.milpa} opacity="0.28" stroke={CI.milpaD} strokeWidth="1.5" />
        <circle cx="185" cy="85" r="70" fill={CI.maiz} opacity="0.28" stroke={CI.surco} strokeWidth="1.5" />
        <text x="70" y="90" fontSize="18" fontWeight="800" textAnchor="middle" fill={CI.milpaD}>{soloA}</text>
        <text x="150" y="90" fontSize="18" fontWeight="800" textAnchor="middle" fill={CI.rojo}>{inter}</text>
        <text x="230" y="90" fontSize="18" fontWeight="800" textAnchor="middle" fill={CI.surco}>{soloB}</text>
        <text x="80" y="30" fontSize="13" fontWeight="700" fill={CI.milpaD}>A</text>
        <text x="215" y="30" fontSize="13" fontWeight="700" fill={CI.surco}>B</text>
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Solo en A: <b style={{ color: CI.ink }}>{soloA}</b>
        <input type="range" min={0} max={8} value={soloA} onChange={(e) => setSoloA(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>En ambos (A∩B): <b style={{ color: CI.ink }}>{inter}</b>
        <input type="range" min={0} max={8} value={inter} onChange={(e) => setInter(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Solo en B: <b style={{ color: CI.ink }}>{soloB}</b>
        <input type="range" min={0} max={8} value={soloB} onChange={(e) => setSoloB(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Si subes "En ambos" (A∩B) hasta que sea mayor que "Solo en A", fíjate que el círculo de A prácticamente queda contenido dentro de B — así se ve un subconjunto casi total.</p>
    </div>
  );
}

// PF8 · Distribución normal: campana con media y desviación
function CampanaNormal() {
  const [mu, setMu] = useState(0);
  const [sigma, setSigma] = useState(1.5);
  const W = 300, H = 190, pad = 24, xmin = -10, xmax = 10;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const peak = 1 / (sigma * Math.sqrt(2 * Math.PI));
  const Yv = (y) => H - pad - (y / (peak * 1.05)) * (H - 2 * pad);
  const f = (x) => (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
  const pts = [];
  for (let x = xmin; x <= xmax; x += 0.15) pts.push(`${X(x)},${Yv(f(x))}`);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        media μ = <span style={{ color: CI.rojo }}>{mu}</span> · desviación σ = <span style={{ color: CI.surco }}>{sigma}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Yv(0)} x2={X(xmax)} y2={Yv(0)} stroke={CI.muted} strokeWidth="1.1" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.6" />
        <line x1={X(mu)} y1={Yv(0)} x2={X(mu)} y2={Yv(peak)} stroke={CI.rojo} strokeWidth="1.6" strokeDasharray="4 3" />
        <line x1={X(mu - sigma)} y1={Yv(0)} x2={X(mu - sigma)} y2={Yv(f(mu - sigma))} stroke={CI.surco} strokeWidth="1.2" opacity="0.8" />
        <line x1={X(mu + sigma)} y1={Yv(0)} x2={X(mu + sigma)} y2={Yv(f(mu + sigma))} stroke={CI.surco} strokeWidth="1.2" opacity="0.8" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Media (μ): <b style={{ color: CI.ink }}>{mu}</b>
        <input type="range" min={-6} max={6} step={1} value={mu} onChange={(e) => setMu(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Desviación (σ): <b style={{ color: CI.ink }}>{sigma}</b>
        <input type="range" min={0.5} max={3.5} step={0.5} value={sigma} onChange={(e) => setSigma(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Compara σ=0.5 contra σ=3.5 con la misma media: la campana angosta concentra casi todos los datos en un rango muy chico; la ancha los dispersa mucho más lejos del centro.</p>
    </div>
  );
}

// ---- CNEyT II ----

// PF2 · Energía cinética: Ec = ½mv² (crece con el cuadrado de la velocidad)
function EnergiaCinetica() {
  const [m, setM] = useState(2);
  const [v, setV] = useState(4);
  const ec = r2ci(0.5 * m * v * v);
  const W = 300, H = 190, pad = 26, vmin = 0, vmax = 12, emax = 0.5 * 6 * 12 * 12;
  const X = (vv) => pad + ((vv - vmin) / (vmax - vmin)) * (W - 2 * pad);
  const Y = (e) => H - pad - (e / emax) * (H - 2 * pad);
  const pts = [];
  for (let vv = vmin; vv <= vmax; vv += 0.2) pts.push(`${X(vv)},${Y(0.5 * m * vv * vv)}`);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15.5, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        Ec = ½·{m}·{v}² = <span style={{ color: CI.rojo }}>{ec} J</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(vmin)} y1={Y(0)} x2={X(vmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1.1" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.6" />
        <circle cx={X(v)} cy={Y(0.5 * m * v * v)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.4" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Masa (kg): <b style={{ color: CI.ink }}>{m}</b>
        <input type="range" min={1} max={6} value={m} onChange={(e) => setM(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Velocidad (m/s): <b style={{ color: CI.ink }}>{v}</b>
        <input type="range" min={0} max={12} value={v} onChange={(e) => setV(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>A 0 m/s, la energía cinética es exactamente cero sin importar la masa — un camión estacionado no tiene energía cinética, aunque pese toneladas.</p>
      <PanelSimulador titulo="🎮 Simulador: lanza y observa el impacto" nota="Toca a un lado para lanzar pelotas con velocidad: mientras más rápido van, más fuerte chocan (más energía cinética). La energía sube con el CUADRADO de la velocidad.">
        <LienzoFisica alto={200}
          setup={(api) => { const { Matter, world, W, H } = api; const { Bodies, World } = Matter; World.add(world, Bodies.circle(W * 0.2, H * 0.5, 16, { restitution: 0.8, friction: 0.005, frictionAir: 0.001, render: { fillStyle: CI.milpa, strokeStyle: CI.ink, lineWidth: 1.5 } })); }}
          onTap={(api, x, y) => { const { Matter, world, W } = api; const { Bodies, World, Body } = Matter; const b = Bodies.circle(x, y, 14, { restitution: 0.8, friction: 0.005, frictionAir: 0.001, render: { fillStyle: CI.maiz, strokeStyle: CI.ink, lineWidth: 1.5 } }); World.add(world, b); Body.setVelocity(b, { x: x < W / 2 ? 8 : -8, y: 0 }); }}
        />
      </PanelSimulador>
    </div>
  );
}

// PF3 · Escalas de temperatura: Celsius ↔ Fahrenheit ↔ Kelvin en vivo
function EscalasTemperatura() {
  const [c, setC] = useState(25);
  const f = r2ci((9 / 5) * c + 32);
  const k = r2ci(c + 273.15);
  const barPct = ((c - (-40)) / (120 - (-40))) * 100;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15.5, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        <span style={{ color: CI.rojo }}>{c} °C</span> = {f} °F = {k} K
      </div>
      <div style={{ position: "relative", height: 30, background: "linear-gradient(90deg,#355070,#D9A526,#B4432E)", borderRadius: 15, border: `1.5px solid ${CI.ink}`, marginBottom: 4 }}>
        <div style={{ position: "absolute", left: `calc(${Math.max(0, Math.min(100, barPct))}% - 6px)`, top: -4, width: 12, height: 38, background: "#fff", border: `2px solid ${CI.ink}`, borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: CI.muted, marginBottom: 12 }}>
        <span>−40°C (frío)</span><span>120°C (caliente)</span>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Temperatura (°C): <b style={{ color: CI.ink }}>{c}</b>
        <input type="range" min={-40} max={120} value={c} onChange={(e) => setC(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>En 0°C (congelación del agua), Kelvin marca 273 — nunca 0. El cero absoluto (0 K) está muchísimo más abajo, en −273°C, un extremo que ni siquiera se alcanza en la vida cotidiana.</p>
    </div>
  );
}

// ---- CNEyT IV ----

// PF4 · Escala de pH: de ácido a básico en vivo
function EscalaPH() {
  const [ph, setPh] = useState(7);
  const tipo = ph < 7 ? "ácida" : ph > 7 ? "básica" : "neutra";
  const color = ph < 7 ? CI.rojo : ph > 7 ? CI.azul : CI.milpa;
  const ejemplos = { 0: "ácido de batería", 2: "jugo de limón", 4: "jugo de tomate", 6: "leche", 7: "agua pura", 8: "agua de mar", 10: "jabón", 12: "amoniaco", 14: "sosa cáustica" };
  const cercano = Object.keys(ejemplos).reduce((a, b) => Math.abs(b - ph) < Math.abs(a - ph) ? b : a);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color, marginBottom: 10 }}>
        pH = {ph} → sustancia <span style={{ textTransform: "uppercase" }}>{tipo}</span>
      </div>
      <div style={{ position: "relative", height: 30, background: "linear-gradient(90deg,#B4432E,#D9A526,#3D6B35,#355070)", borderRadius: 15, border: `1.5px solid ${CI.ink}`, marginBottom: 4 }}>
        <div style={{ position: "absolute", left: `calc(${(ph / 14) * 100}% - 6px)`, top: -4, width: 12, height: 38, background: "#fff", border: `2px solid ${CI.ink}`, borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: CI.muted, marginBottom: 10 }}>
        <span>0 ácido</span><span>7 neutro</span><span>14 básico</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 13, color: CI.ink, marginBottom: 10 }}>≈ como: <b>{ejemplos[cercano]}</b></div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>pH: <b style={{ color: CI.ink }}>{ph}</b>
        <input type="range" min={0} max={14} value={ph} onChange={(e) => setPh(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>El jugo de limón (pH≈2) y el ácido de batería (pH≈0) son ambos ácidos, pero difieren en 100 veces su concentración de iones hidrógeno — cada unidad de pH es un salto de ×10, no un paso parejo.</p>
    </div>
  );
}

// ---- CNEyT V ----

// PF1 · Segunda ley de Newton: F = m·a
function SegundaLeyNewton() {
  const [m, setM] = useState(4);
  const [f, setF] = useState(20);
  const a = r2ci(f / m);
  const flechaLen = Math.min(120, a * 12);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        a = F/m = {f}/{m} = <span style={{ color: CI.rojo }}>{a} m/s²</span>
      </div>
      <svg viewBox="0 0 300 120" style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <rect x="40" y={60 - m * 4} width={m * 10 + 20} height={m * 8} fill={CI.milpaS} stroke={CI.ink} strokeWidth="1.5" rx="4" />
        <text x={40 + (m * 10 + 20) / 2} y={62} fontSize="12" textAnchor="middle" fontWeight="700" fill={CI.milpaD}>{m} kg</text>
        <line x1={40 + m * 10 + 20} y1="60" x2={40 + m * 10 + 20 + flechaLen} y2="60" stroke={CI.rojo} strokeWidth="3" />
        <polygon points={`${40 + m * 10 + 20 + flechaLen},54 ${40 + m * 10 + 20 + flechaLen + 10},60 ${40 + m * 10 + 20 + flechaLen},66`} fill={CI.rojo} />
        <text x={40 + m * 10 + 20 + flechaLen / 2} y="48" fontSize="12" textAnchor="middle" fontWeight="700" fill={CI.rojo}>a = {a}</text>
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Fuerza (N): <b style={{ color: CI.ink }}>{f}</b>
        <input type="range" min={5} max={60} step={5} value={f} onChange={(e) => setF(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Masa (kg): <b style={{ color: CI.ink }}>{m}</b>
        <input type="range" min={1} max={10} value={m} onChange={(e) => setM(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Con fuerza en 5 N y masa en 10 kg, la aceleración es apenas 0.5 m/s² — casi imperceptible. Se necesita mucha fuerza para acelerar notablemente un objeto pesado.</p>
      <PanelSimulador titulo="🎮 Simulador: suéltalo y ve caer (gravedad real)" nota="Toca dentro para soltar pelotas: la gravedad las jala hacia abajo y rebotan. Arrástralas para lanzarlas. Es la misma fuerza (F = m·g) del ejercicio, en vivo.">
        <LienzoFisica alto={220}
          setup={(api) => { const { Matter, world, W } = api; const { Bodies, World } = Matter; World.add(world, Bodies.circle(W * 0.5, 20, 14, { restitution: 0.6, friction: 0.02, render: { fillStyle: CI.milpa, strokeStyle: CI.ink, lineWidth: 1.5 } })); }}
          onTap={(api, x, y) => { const { Matter, world } = api; const { Bodies, World } = Matter; World.add(world, Bodies.circle(x, Math.min(y, 30), 12 + Math.random() * 6, { restitution: 0.6, friction: 0.02, render: { fillStyle: CI.maiz, strokeStyle: CI.ink, lineWidth: 1.5 } })); }}
        />
      </PanelSimulador>
    </div>
  );
}

// PF4 · Onda: v = λ·f (frecuencia y longitud de onda)
function OndaInteractiva() {
  const [freq, setFreq] = useState(2);
  const [lambda, setLambda] = useState(3);
  const vel = r2ci(freq * lambda);
  const W = 300, H = 120;
  const pts = [];
  for (let px = 0; px <= W; px += 2) {
    const x = (px / W) * 12;
    const y = 60 - 32 * Math.sin((2 * Math.PI * x) / lambda);
    pts.push(`${px},${y}`);
  }
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15.5, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        v = λ·f = {lambda}·{freq} = <span style={{ color: CI.rojo }}>{vel} m/s</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1="0" y1="60" x2={W} y2="60" stroke={CI.muted} strokeWidth="1" strokeDasharray="3 3" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.6" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Frecuencia (Hz): <b style={{ color: CI.ink }}>{freq}</b>
        <input type="range" min={1} max={8} value={freq} onChange={(e) => setFreq(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Longitud de onda λ (m): <b style={{ color: CI.ink }}>{lambda}</b>
        <input type="range" min={1} max={6} value={lambda} onChange={(e) => setLambda(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Si subes la frecuencia sin tocar la longitud de onda, la velocidad calculada aumenta — pero en el sonido o la luz reales, la velocidad en un medio dado es fija, así que frecuencia y longitud de onda cambian juntas, no por separado.</p>
    </div>
  );
}

// PF7 · Ley de Ohm: V = I·R
function LeyOhm() {
  const [i, setI] = useState(2);
  const [r, setR] = useState(5);
  const v = r2ci(i * r);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        V = I·R = {i}·{r} = <span style={{ color: CI.rojo }}>{v} V</span>
      </div>
      <svg viewBox="0 0 300 120" style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <rect x="30" y="35" width="240" height="50" fill="none" stroke={CI.ink} strokeWidth="2" rx="6" />
        <rect x="120" y="30" width="60" height="24" fill={CI.maizS} stroke={CI.surco} strokeWidth="1.5" />
        <text x="150" y="46" fontSize="11" textAnchor="middle" fontWeight="700" fill={CI.surco}>R={r}Ω</text>
        <circle cx="55" cy="85" r="4" fill={CI.rojo}>
          <animate attributeName="cx" from="55" to="245" dur={`${Math.max(0.4, 3 / i)}s`} repeatCount="indefinite" />
        </circle>
        <text x="150" y="105" fontSize="11" textAnchor="middle" fill={CI.muted}>corriente I = {i} A</text>
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Corriente I (A): <b style={{ color: CI.ink }}>{i}</b>
        <input type="range" min={1} max={8} value={i} onChange={(e) => setI(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Resistencia R (Ω): <b style={{ color: CI.ink }}>{r}</b>
        <input type="range" min={1} max={20} value={r} onChange={(e) => setR(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Con resistencia muy alta y corriente baja, el voltaje necesario puede ser el mismo que con resistencia baja y corriente alta — la misma V puede lograrse con combinaciones muy distintas de I y R.</p>
    </div>
  );
}

// ---- CNEyT VI ----

// PF6 · Cuadro de Punnett: cruce genético Aa × Aa en vivo
function CuadroPunnett() {
  const [alelosP1, setP1] = useState("Aa");
  const [alelosP2, setP2] = useState("Aa");
  const g1 = [alelosP1[0], alelosP1[1]], g2 = [alelosP2[0], alelosP2[1]];
  const celdas = [];
  for (const a of g1) for (const b of g2) { const combo = [a, b].sort((x, y) => (x === x.toUpperCase() ? -1 : 1)).join(""); celdas.push(combo); }
  const domCount = celdas.filter((c) => c.includes("A")).length;
  const recCount = celdas.filter((c) => c === "aa").length;
  const opciones = ["AA", "Aa", "aa"];
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15.5, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        {alelosP1} × {alelosP2} → dominante {domCount}/4 · recesivo {recCount}/4
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 16 }}>
          <tbody>
            <tr><td style={{ width: 34, height: 34 }}></td><td style={cellHdr}>{g2[0]}</td><td style={cellHdr}>{g2[1]}</td></tr>
            <tr><td style={cellHdr}>{g1[0]}</td><td style={cell(celdas[0])}>{celdas[0]}</td><td style={cell(celdas[1])}>{celdas[1]}</td></tr>
            <tr><td style={cellHdr}>{g1[1]}</td><td style={cell(celdas[2])}>{celdas[2]}</td><td style={cell(celdas[3])}>{celdas[3]}</td></tr>
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 8, fontSize: 12.5 }}>
        <div><span style={{ fontSize: 11, color: CI.muted }}>Progenitor 1</span><br />
          {opciones.map((o) => <button key={o} onClick={() => setP1(o)} className={`tab ${alelosP1 === o ? "on" : ""}`} style={{ padding: "5px 9px", fontSize: 12, marginRight: 4 }}>{o}</button>)}</div>
      </div>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", fontSize: 12.5 }}>
        <div><span style={{ fontSize: 11, color: CI.muted }}>Progenitor 2</span><br />
          {opciones.map((o) => <button key={o} onClick={() => setP2(o)} className={`tab ${alelosP2 === o ? "on" : ""}`} style={{ padding: "5px 9px", fontSize: 12, marginRight: 4 }}>{o}</button>)}</div>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Cambia el Progenitor 1 a aa (en vez de Aa): notarás que ya ningún descendiente puede ser AA — sin un alelo dominante de ambos lados, ese genotipo se vuelve imposible.</p>
    </div>
  );
}
const cellHdr = { width: 34, height: 34, textAlign: "center", fontWeight: 800, color: CI.muted, fontSize: 15 };
function cell(v) { return { width: 44, height: 44, textAlign: "center", fontWeight: 800, border: "1.5px solid #2E2A21", background: v === "aa" ? "#F6E3DE" : CI.milpaS, color: v === "aa" ? CI.rojo : CI.milpaD }; }

function r2ci(x) { return Math.round(x * 100) / 100; }

// ============================================================================
// LOTE 2 — Interactivos "Aprender" para completar PM I y PM III
// ============================================================================

// ---- PM I ----

// PF1 · Tablas de verdad interactivas
function TablaVerdad() {
  const [op, setOp] = useState("y");
  const OPS = { y: { s: "∧", nombre: "Y (conjunción)", f: (p, q) => p && q }, o: { s: "∨", nombre: "O (disyunción)", f: (p, q) => p || q }, si: { s: "→", nombre: "Condicional", f: (p, q) => !p || q } };
  const filas = [[true, true], [true, false], [false, true], [false, false]];
  const cur = OPS[op];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {Object.keys(OPS).map((k) => <button key={k} className={`tab ${op === k ? "on" : ""}`} onClick={() => setOp(k)} style={{ padding: "7px 12px" }}>{OPS[k].s} {OPS[k].nombre}</button>)}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead><tr>{["p", "q", `p ${cur.s} q`].map((h) => <th key={h} style={{ border: `1.5px solid ${CI.ink}`, padding: 8, background: CI.milpaS }}>{h}</th>)}</tr></thead>
        <tbody>
          {filas.map(([p, q], i) => { const r = cur.f(p, q); return (
            <tr key={i}>
              <td style={tdC}>{p ? "V" : "F"}</td><td style={tdC}>{q ? "V" : "F"}</td>
              <td style={{ ...tdC, background: r ? CI.milpaS : "#F6E3DE", fontWeight: 800, color: r ? CI.milpaD : CI.rojo }}>{r ? "V" : "F"}</td>
            </tr>
          ); })}
        </tbody>
      </table>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Fíjate en la fila (V,V): es la única donde ∧ y ∨ coinciden. En todas las demás filas, conjunción y disyunción se comportan distinto — ahí está la diferencia real entre "y" y "o".</p>
    </div>
  );
}
const tdC = { border: "1.5px solid #2E2A21", padding: 8, textAlign: "center" };

// PF2 · Valor posicional
function ValorPosicional() {
  const [num, setNum] = useState(3482);
  const digitos = String(num).split("").map(Number);
  const n = digitos.length;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 26, fontWeight: 800, color: CI.milpaD, marginBottom: 14, letterSpacing: 2 }}>{num.toLocaleString()}</div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {digitos.map((d, i) => {
          const potencia = n - i - 1;
          const valor = d * Math.pow(10, potencia);
          return (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ width: 46, height: 46, border: `1.5px solid ${CI.ink}`, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, background: CI.papel2 }}>{d}</div>
              <div style={{ fontSize: 10.5, color: CI.muted, marginTop: 4 }}>valor: {valor.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Número: <b style={{ color: CI.ink }}>{num}</b>
        <input type="range" min={100} max={9999} step={1} value={num} onChange={(e) => setNum(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Prueba con 1000: el 1 vale mil veces más que en las unidades. Ese salto de ×10 por posición es lo que hace posible sumar números grandes con solo diez símbolos (0-9).</p>
    </div>
  );
}

// PF3 · Recta numérica con enteros
function RectaEnteros() {
  const [a, setA] = useState(-3);
  const [b, setB] = useState(5);
  const suma = a + b;
  const W = 300, pad = 20, xmin = -12, xmax = 12;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 17, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>({a}) + ({b}) = <span style={{ color: CI.rojo }}>{suma}</span></div>
      <svg viewBox={`0 0 ${W} 90`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1="50" x2={X(xmax)} y2="50" stroke={CI.muted} strokeWidth="1.3" />
        {Array.from({ length: 25 }, (_, i) => i - 12).map((nn) => <line key={nn} x1={X(nn)} y1="45" x2={X(nn)} y2="55" stroke={CI.muted} strokeWidth={nn === 0 ? 2 : 1} />)}
        <line x1={X(0)} y1="50" x2={X(a)} y2="50" stroke={CI.azul} strokeWidth="4" opacity="0.7" />
        <line x1={X(a)} y1="30" x2={X(a + b)} y2="30" stroke={CI.rojo} strokeWidth="4" opacity="0.7" />
        <circle cx={X(0)} cy="50" r="4" fill={CI.ink} />
        <circle cx={X(a)} cy="50" r="5" fill={CI.azul} stroke="#fff" strokeWidth="1.2" />
        <circle cx={X(suma)} cy="30" r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.2" />
        <text x={X(0)} y="70" fontSize="10" textAnchor="middle" fill={CI.muted}>0</text>
        <text x={X(suma)} y="20" fontSize="11" textAnchor="middle" fontWeight="700" fill={CI.rojo}>{suma}</text>
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Primer número: <b style={{ color: CI.ink }}>{a}</b>
        <input type="range" min={-10} max={10} value={a} onChange={(e) => setA(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Segundo número: <b style={{ color: CI.ink }}>{b}</b>
        <input type="range" min={-10} max={10} value={b} onChange={(e) => setB(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Si el segundo número fuera 0, el punto rojo caería exactamente sobre el azul: sumar cero nunca mueve nada. Pruébalo y verifica que el salto rojo desaparece.</p>
    </div>
  );
}

// PF4 · Porcentaje como fracción de una barra
function PorcentajeFraccion() {
  const [num, setNum] = useState(3);
  const [den, setDen] = useState(4);
  const pct = r2ci((num / den) * 100);
  const filled = Math.round((num / den) * 20);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 18, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>{num}/{den} = <span style={{ color: CI.rojo }}>{pct}%</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(20,1fr)", gap: 2, marginBottom: 10 }}>
        {Array.from({ length: 20 }).map((_, i) => <div key={i} style={{ paddingBottom: "100%", background: i < filled ? CI.maiz : "#fff", border: `1px solid ${i < filled ? CI.surco : CI.linea}`, borderRadius: 2 }} />)}
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Numerador: <b style={{ color: CI.ink }}>{num}</b>
        <input type="range" min={0} max={den} value={num} onChange={(e) => setNum(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Denominador: <b style={{ color: CI.ink }}>{den}</b>
        <input type="range" min={1} max={10} value={den} onChange={(e) => { const nd = +e.target.value; setDen(nd); if (num > nd) setNum(nd); }} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Dos fracciones distintas pueden dar el mismo porcentaje (2/4 y 3/6 ambas son 50%): eso se llama fracciones equivalentes. Cambia el denominador y busca una que repita un porcentaje ya visto.</p>
    </div>
  );
}

// PF5 · Crecimiento de potencias en barras
function CrecimientoPotencias() {
  const [base, setBase] = useState(2);
  const [exp, setExp] = useState(4);
  const valores = Array.from({ length: exp + 1 }, (_, i) => Math.pow(base, i));
  const max = valores[valores.length - 1] || 1;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 17, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>{base}^{exp} = <span style={{ color: CI.rojo }}>{valores[exp]}</span></div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 130, marginBottom: 8 }}>
        {valores.map((v, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ height: `${Math.max(3, (v / max) * 110)}px`, background: i === exp ? CI.rojo : CI.milpa, borderRadius: "4px 4px 0 0", border: `1px solid ${CI.ink}` }} />
            <div style={{ fontSize: 9.5, color: CI.muted, marginTop: 2 }}>{base}^{i}</div>
          </div>
        ))}
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Base: <b style={{ color: CI.ink }}>{base}</b>
        <input type="range" min={2} max={4} value={base} onChange={(e) => setBase(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Exponente: <b style={{ color: CI.ink }}>{exp}</b>
        <input type="range" min={1} max={8} value={exp} onChange={(e) => setExp(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Compara la barra 2⁵ con 4⁵: aunque la base solo se duplicó, la altura final es mucho más que el doble — la base también importa, no solo el exponente.</p>
    </div>
  );
}

// PF6 · Notación científica
function NotacionCientifica() {
  const [mant, setMant] = useState(3.8);
  const [exp, setExp] = useState(2);
  const valor = mant * Math.pow(10, exp);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 18, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        {mant} × 10^{exp} = <span style={{ color: CI.rojo }}>{valor.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
      </div>
      <div style={{ fontSize: 13, textAlign: "center", color: CI.muted, marginBottom: 10, fontFamily: "monospace" }}>
        {exp >= 0 ? valor.toFixed(0) : valor.toFixed(Math.abs(exp) + 2)}
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Mantisa (1 ≤ a &lt; 10): <b style={{ color: CI.ink }}>{mant}</b>
        <input type="range" min={1} max={9.9} step={0.1} value={mant} onChange={(e) => setMant(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Exponente: <b style={{ color: CI.ink }}>{exp}</b>
        <input type="range" min={-6} max={9} value={exp} onChange={(e) => setExp(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>El diámetro de un átomo es del orden de 1×10⁻¹⁰ m, y la distancia a una estrella cercana ronda 1×10¹⁶ m: notación científica es lo único práctico para comparar ambas escalas en la misma frase.</p>
    </div>
  );
}

// PF7 · Jerarquía de operaciones paso a paso
function JerarquiaOperaciones() {
  const CASOS = [
    { expr: "6 + 4 × 2", pasos: [{ t: "6 + 4 × 2", nota: "Primero la multiplicación" }, { t: "6 + 8", nota: "Ahora la suma" }, { t: "14", nota: "Resultado final" }] },
    { expr: "(5+3)×2−4", pasos: [{ t: "(5 + 3) × 2 − 4", nota: "Primero el paréntesis" }, { t: "8 × 2 − 4", nota: "Luego la multiplicación" }, { t: "16 − 4", nota: "Por último la resta" }, { t: "12", nota: "Resultado final" }] },
    { expr: "2 + 3² × 2", pasos: [{ t: "2 + 3² × 2", nota: "Primero la potencia" }, { t: "2 + 9 × 2", nota: "Luego la multiplicación" }, { t: "2 + 18", nota: "Por último la suma" }, { t: "20", nota: "Resultado final" }] },
  ];
  const [caso, setCaso] = useState(0);
  const [paso, setPaso] = useState(0);
  const c = CASOS[caso];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {CASOS.map((cc, i) => <button key={i} className={`tab ${caso === i ? "on" : ""}`} onClick={() => { setCaso(i); setPaso(0); }}>{cc.expr}</button>)}
      </div>
      <div style={{ background: CI.papel2, border: `1.5px solid ${CI.ink}`, borderRadius: 10, padding: 16, textAlign: "center" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: CI.rojo, marginBottom: 6 }}>{c.pasos[paso].t}</div>
        <div style={{ fontSize: 13, color: CI.muted, fontStyle: "italic" }}>{c.pasos[paso].nota}</div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
        <button className="tab" disabled={paso === 0} onClick={() => setPaso((p) => Math.max(0, p - 1))}>← Anterior</button>
        <button className="tab on" disabled={paso === c.pasos.length - 1} onClick={() => setPaso((p) => Math.min(c.pasos.length - 1, p + 1))}>Siguiente paso →</button>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Prueba a resolver 6+4×2 sumando primero: da 20, no 14. Ese es justo el error que la jerarquía evita — por eso el orden no es opcional.</p>
    </div>
  );
}

// ---- PM III ----

// P3 · Sistemas 2×2: dos rectas y su intersección
function SistemaDosRectas() {
  const [m1, setM1] = useState(1), [b1, setB1] = useState(1);
  const [m2, setM2] = useState(-1), [b2, setB2] = useState(7);
  const curvaRef = useRef(null);
  useEffect(() => { trazarSVG(curvaRef.current, 0.8); }, []);
  const paralelas = m1 === m2;
  const xi = paralelas ? null : r2ci((b2 - b1) / (m1 - m2));
  const yi = paralelas ? null : r2ci(m1 * xi + b1);
  const W = 300, H = 220, pad = 24, xmin = -8, xmax = 8, ymin = -8, ymax = 8;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const line = (m, b) => [[xmin, m * xmin + b], [xmax, m * xmax + b]];
  const l1 = line(m1, b1), l2 = line(m2, b2);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 14.5, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        {paralelas ? "Rectas paralelas: sin solución" : <>solución: <span style={{ color: CI.rojo }}>({xi}, {yi})</span></>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1" />
        <line ref={curvaRef} x1={X(l1[0][0])} y1={Y(l1[0][1])} x2={X(l1[1][0])} y2={Y(l1[1][1])} stroke={CI.milpa} strokeWidth="2.4" />
        <line x1={X(l2[0][0])} y1={Y(l2[0][1])} x2={X(l2[1][0])} y2={Y(l2[1][1])} stroke={CI.surco} strokeWidth="2.4" />
        {!paralelas && Math.abs(xi) <= xmax && Math.abs(yi) <= ymax && <circle cx={X(xi)} cy={Y(yi)} r="5.5" fill={CI.rojo} stroke="#fff" strokeWidth="1.4" />}
      </svg>
      {[["Recta 1 — pendiente", m1, setM1, -3, 3], ["Recta 1 — ordenada", b1, setB1, -6, 6], ["Recta 2 — pendiente", m2, setM2, -3, 3], ["Recta 2 — ordenada", b2, setB2, -6, 6]].map(([lab, val, set, mn, mx]) => (
        <label key={lab} style={{ display: "block", fontSize: 12, color: CI.muted, marginBottom: 6 }}>{lab}: <b style={{ color: CI.ink }}>{val}</b>
          <input type="range" min={mn} max={mx} step={1} value={val} onChange={(e) => set(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      ))}
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 6, lineHeight: 1.5 }}>Si mueves la pendiente de la Recta 2 hasta que sea igual a la de la Recta 1, verás que el punto rojo desaparece: ese es el caso de rectas paralelas, sin solución.</p>
    </div>
  );
}

// P4 · Cuadráticas: factorización eligiendo las raíces
function FactorizacionCuadratica() {
  const [r1, setR1] = useState(2), [rr2, setRr2] = useState(-3);
  const b = -(r1 + rr2), c = r1 * rr2;
  const W = 300, H = 210, pad = 24, xmin = -8, xmax = 8, ymin = -12, ymax = 20;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const pts = [];
  for (let x = xmin; x <= xmax; x += 0.15) { const y = x * x + b * x + c; if (y >= ymin - 2 && y <= ymax + 2) pts.push(`${X(x)},${Y(y)}`); }
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 14.5, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        (x−{r1})(x−{rr2}) = x² {b >= 0 ? "+" : "−"} {Math.abs(b)}x {c >= 0 ? "+" : "−"} {Math.abs(c)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1.1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1.1" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        <circle cx={X(r1)} cy={Y(0)} r="5" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.3" />
        <circle cx={X(rr2)} cy={Y(0)} r="5" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.3" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Raíz 1: <b style={{ color: CI.ink }}>{r1}</b>
        <input type="range" min={-6} max={6} value={r1} onChange={(e) => setR1(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Raíz 2: <b style={{ color: CI.ink }}>{rr2}</b>
        <input type="range" min={-6} max={6} value={rr2} onChange={(e) => setRr2(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Si ambas raíces son iguales (por ejemplo, r1=r2=2), la parábola solo toca el eje x en un punto — un caso especial llamado raíz doble.</p>
    </div>
  );
}

// P5 · Interés simple vs compuesto
function InteresSimpleCompuesto() {
  const [cap, setCap] = useState(1000);
  const [tasa, setTasa] = useState(10);
  const [anios, setAnios] = useState(5);
  const simple = r2ci(cap * (1 + (tasa / 100) * anios));
  const compuesto = r2ci(cap * Math.pow(1 + tasa / 100, anios));
  const maxV = Math.max(simple, compuesto);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 14, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        Simple: <span style={{ color: CI.azul }}>${simple}</span> · Compuesto: <span style={{ color: CI.rojo }}>${compuesto}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 20, height: 130, justifyContent: "center", marginBottom: 10 }}>
        <div style={{ textAlign: "center" }}><div style={{ height: `${(simple / maxV) * 110}px`, width: 50, background: CI.azul, borderRadius: "4px 4px 0 0", border: `1px solid ${CI.ink}` }} /><div style={{ fontSize: 11, marginTop: 4 }}>Simple</div></div>
        <div style={{ textAlign: "center" }}><div style={{ height: `${(compuesto / maxV) * 110}px`, width: 50, background: CI.rojo, borderRadius: "4px 4px 0 0", border: `1px solid ${CI.ink}` }} /><div style={{ fontSize: 11, marginTop: 4 }}>Compuesto</div></div>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Capital inicial: <b style={{ color: CI.ink }}>${cap}</b>
        <input type="range" min={100} max={5000} step={100} value={cap} onChange={(e) => setCap(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Tasa anual (%): <b style={{ color: CI.ink }}>{tasa}%</b>
        <input type="range" min={1} max={25} value={tasa} onChange={(e) => setTasa(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Años: <b style={{ color: CI.ink }}>{anios}</b>
        <input type="range" min={1} max={20} value={anios} onChange={(e) => setAnios(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>A 1 año, simple y compuesto casi no se distinguen (la primera vez que se calcula el interés, es igual). La diferencia real solo aparece a partir del segundo periodo — pruébalo bajando los años a 1.</p>
    </div>
  );
}

// P6 · Teorema de Pitágoras
function TeoremaPitagoras() {
  const [a, setA] = useState(3);
  const [b, setB] = useState(4);
  const c = r2ci(Math.sqrt(a * a + b * b));
  const esc = 14;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        {a}² + {b}² = {a * a + b * b} → c = <span style={{ color: CI.rojo }}>{c}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg viewBox="0 0 220 180" style={{ width: 220, height: 180 }}>
          <polygon points={`20,160 ${20 + b * esc},160 20,${160 - a * esc}`} fill={CI.milpaS} stroke={CI.ink} strokeWidth="1.5" />
          <text x={20 + (b * esc) / 2} y="172" fontSize="12" textAnchor="middle" fill={CI.ink}>b={b}</text>
          <text x="8" y={160 - (a * esc) / 2} fontSize="12" textAnchor="middle" fill={CI.ink}>a={a}</text>
          <text x={20 + (b * esc) / 2 + 10} y={160 - (a * esc) / 2 - 6} fontSize="12" fontWeight="700" fill={CI.rojo}>c={c}</text>
        </svg>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 4 }}>Cateto a: <b style={{ color: CI.ink }}>{a}</b>
        <input type="range" min={1} max={8} value={a} onChange={(e) => setA(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Cateto b: <b style={{ color: CI.ink }}>{b}</b>
        <input type="range" min={1} max={8} value={b} onChange={(e) => setB(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Con a=6 y b=8 obtienes c=10 — otra terna que, como 3-4-5, da un ángulo recto exacto. No todas las combinaciones lo logran: prueba a=5, b=6 y verás que c ya no es un número entero.</p>
    </div>
  );
}

// ============================================================================
// LOTE 3 — Interactivos "Aprender" para completar PM IV, PM V, PM VI
// ============================================================================

// ---- PM IV ----

// PF1 · Distancia entre dos puntos
function DistanciaPuntos() {
  const [x1, setX1] = useState(-3), [y1, setY1] = useState(-2);
  const [x2, setX2] = useState(4), [y2, setY2] = useState(3);
  const d = r2ci(Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2));
  const W = 280, H = 220, pad = 24, xmin = -8, xmax = 8, ymin = -8, ymax = 8;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15.5, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        d = √[({x2}−{x1})² + ({y2}−{y1})²] = <span style={{ color: CI.rojo }}>{d}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} stroke={CI.rojo} strokeWidth="2.2" strokeDasharray="5 3" />
        <line x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y1)} stroke={CI.azul} strokeWidth="1.4" opacity="0.7" />
        <line x1={X(x2)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} stroke={CI.azul} strokeWidth="1.4" opacity="0.7" />
        <circle cx={X(x1)} cy={Y(y1)} r="5" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.2" />
        <circle cx={X(x2)} cy={Y(y2)} r="5" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.2" />
      </svg>
      {[["x₁", x1, setX1], ["y₁", y1, setY1], ["x₂", x2, setX2], ["y₂", y2, setY2]].map(([lab, val, set]) => (
        <label key={lab} style={{ display: "block", fontSize: 12, color: CI.muted, marginBottom: 6 }}>{lab}: <b style={{ color: CI.ink }}>{val}</b>
          <input type="range" min={-7} max={7} value={val} onChange={(e) => set(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      ))}
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 6, lineHeight: 1.5 }}>Si haces que ambos puntos compartan la misma x (o la misma y), el triángulo se aplana: la distancia se reduce a una simple resta, sin necesidad de raíz cuadrada.</p>
    </div>
  );
}

// PF2 · Círculo unitario: razones trigonométricas
function CirculoUnitario() {
  const [ang, setAng] = useState(45);
  const rad = (ang * Math.PI) / 180;
  const sen = r2ci(Math.sin(rad)), cos = r2ci(Math.cos(rad));
  const R = 70, cx = 110, cy = 110;
  const px = cx + R * cos, py = cy - R * sen;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        θ = {ang}° → sen={sen}, cos={cos}
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <svg viewBox="0 0 220 220" style={{ width: 220, height: 220 }}>
          <circle cx={cx} cy={cy} r={R} fill="none" stroke={CI.muted} strokeWidth="1.3" />
          <line x1={cx - R - 10} y1={cy} x2={cx + R + 10} y2={cy} stroke={CI.muted} strokeWidth="1" />
          <line x1={cx} y1={cy - R - 10} x2={cx} y2={cy + R + 10} stroke={CI.muted} strokeWidth="1" />
          <line x1={cx} y1={cy} x2={px} y2={py} stroke={CI.milpa} strokeWidth="2.2" />
          <line x1={px} y1={py} x2={px} y2={cy} stroke={CI.rojo} strokeWidth="2" strokeDasharray="3 2" />
          <line x1={cx} y1={cy} x2={px} y2={cy} stroke={CI.azul} strokeWidth="2" strokeDasharray="3 2" />
          <circle cx={px} cy={py} r="4.5" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.2" />
          <text x={px > cx ? px + 10 : px - 26} y={py - 20} fontSize="10" fill={CI.rojo}>sen</text>
          <text x={(cx + px) / 2} y={cy + 15} fontSize="10" fill={CI.azul}>cos</text>
        </svg>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Ángulo θ: <b style={{ color: CI.ink }}>{ang}°</b>
        <input type="range" min={0} max={360} value={ang} onChange={(e) => setAng(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>A 90°, el coseno vale 0 pero el seno llega a su máximo (1). Gira hasta 180° y compara: ahí el patrón se invierte. Esa alternancia es la base de las gráficas de seno y coseno.</p>
    </div>
  );
}

// PF3 · Curvas en el plano: coordenadas polares vs cartesianas
function CoordenadasPolares() {
  const [r, setR] = useState(5);
  const [theta, setTheta] = useState(60);
  const rad = (theta * Math.PI) / 180;
  const x = r2ci(r * Math.cos(rad)), y = r2ci(r * Math.sin(rad));
  const W = 260, H = 220, pad = 24, xmin = -8, xmax = 8, ymin = -8, ymax = 8;
  const X = (v) => pad + ((v - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (v) => H - pad - ((v - ymin) / (ymax - ymin)) * (H - 2 * pad);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        (r={r}, θ={theta}°) → cartesianas ({x}, {y})
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1" />
        <circle cx={X(0)} cy={Y(0)} r={((r / 8) * (W - 2 * pad)) / 2} fill="none" stroke={CI.linea} strokeWidth="1" strokeDasharray="3 2" />
        <line x1={X(0)} y1={Y(0)} x2={X(x)} y2={Y(y)} stroke={CI.milpa} strokeWidth="2.2" />
        <circle cx={X(x)} cy={Y(y)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.3" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 6 }}>Radio r: <b style={{ color: CI.ink }}>{r}</b>
        <input type="range" min={1} max={7} value={r} onChange={(e) => setR(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Ángulo θ: <b style={{ color: CI.ink }}>{theta}°</b>
        <input type="range" min={0} max={360} value={theta} onChange={(e) => setTheta(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Si giras θ una vuelta completa (360°) sin cambiar r, el punto regresa exactamente al mismo lugar — las polares repiten cada 360°, algo que las cartesianas no hacen.</p>
    </div>
  );
}

// PF4 · Ecuación de la recta: pendiente-ordenada en vivo
function EcuacionRecta() {
  const [m, setM] = useState(2);
  const [b, setB] = useState(-1);
  const W = 280, H = 200, pad = 24, xmin = -8, xmax = 8, ymin = -8, ymax = 8;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 17, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>y = {m}x {b >= 0 ? "+" : "−"} {Math.abs(b)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(xmin)} y1={Y(m * xmin + b)} x2={X(xmax)} y2={Y(m * xmax + b)} stroke={CI.milpa} strokeWidth="2.4" />
        <circle cx={X(0)} cy={Y(b)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.3" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 6 }}>Pendiente (m): <b style={{ color: CI.ink }}>{m}</b>
        <input type="range" min={-4} max={4} step={0.5} value={m} onChange={(e) => setM(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Ordenada al origen (b): <b style={{ color: CI.ink }}>{b}</b>
        <input type="range" min={-6} max={6} value={b} onChange={(e) => setB(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Si igualas b a 0, la recta siempre pasa por el origen sin importar la pendiente. Es la forma más simple de y=mx+b: la proporcionalidad directa.</p>
    </div>
  );
}

// PF6 · Circunferencia: ecuación y radio
function CirculoEcuacion() {
  const [h, setH] = useState(0), [k, setK] = useState(0), [r, setR] = useState(3);
  const curvaRef = useRef(null);
  useEffect(() => { trazarSVG(curvaRef.current, 1.0); }, []);
  const W = 260, H = 220, pad = 24, xmin = -8, xmax = 8, ymin = -8, ymax = 8;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const escala = (W - 2 * pad) / (xmax - xmin);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        (x{h >= 0 ? "−" : "+"}{Math.abs(h)})² + (y{k >= 0 ? "−" : "+"}{Math.abs(k)})² = {r * r}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1" />
        <circle ref={curvaRef} cx={X(h)} cy={Y(k)} r={r * escala} fill={CI.milpaS} opacity="0.35" stroke={CI.milpaD} strokeWidth="2" />
        <circle cx={X(h)} cy={Y(k)} r="4" fill={CI.rojo} />
      </svg>
      {[["Centro h", h, setH, -5, 5], ["Centro k", k, setK, -5, 5], ["Radio r", r, setR, 1, 6]].map(([lab, val, set, mn, mx]) => (
        <label key={lab} style={{ display: "block", fontSize: 12.5, color: CI.muted, marginBottom: 6 }}>{lab}: <b style={{ color: CI.ink }}>{val}</b>
          <input type="range" min={mn} max={mx} value={val} onChange={(e) => set(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      ))}
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 6, lineHeight: 1.5 }}>Si mueves el centro (h,k) sin tocar el radio, el círculo se traslada sin cambiar de tamaño — eso muestra que h y k solo desplazan, mientras que r es quien controla el tamaño.</p>
    </div>
  );
}

// PF7 · Secciones cónicas: cómo cambia la curva según la excentricidad
function SeccionesConicas() {
  const [ecc, setEcc] = useState(0);
  const tipo = ecc === 0 ? "círculo" : ecc < 1 ? "elipse" : ecc === 1 ? "parábola" : "hipérbola";
  const a = 5, b = ecc < 1 ? a * Math.sqrt(1 - ecc * ecc) : a;
  const W = 280, H = 200, pad = 24, xmin = -8, xmax = 8, ymin = -6, ymax = 6;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        excentricidad e = {ecc} → <span style={{ color: CI.rojo, textTransform: "uppercase" }}>{tipo}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1" />
        {ecc < 1 ? (
          <ellipse cx={X(0)} cy={Y(0)} rx={a * ((W - 2 * pad) / (xmax - xmin)) / 2.4} ry={b * ((H - 2 * pad) / (ymax - ymin)) / 2.4} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        ) : ecc === 1 ? (
          <path d={Array.from({ length: 40 }, (_, i) => { const t = -4 + i * 0.2; const y2 = t; const x2 = (t * t) / 4 - 4; return `${i === 0 ? "M" : "L"}${X(x2)},${Y(y2)}`; }).join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        ) : (
          <>
            <path d={Array.from({ length: 30 }, (_, i) => { const t = 1 + i * 0.1; const x2 = a * t; const y2 = b * Math.sqrt(Math.max(0, t * t - 1)); return `${i === 0 ? "M" : "L"}${X(x2)},${Y(y2)}`; }).join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
            <path d={Array.from({ length: 30 }, (_, i) => { const t = 1 + i * 0.1; const x2 = a * t; const y2 = -b * Math.sqrt(Math.max(0, t * t - 1)); return `${i === 0 ? "M" : "L"}${X(x2)},${Y(y2)}`; }).join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
          </>
        )}
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 6 }}>Excentricidad (e): <b style={{ color: CI.ink }}>{ecc}</b>
        <input type="range" min={0} max={1.5} step={0.25} value={ecc} onChange={(e) => setEcc(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>En e=1 exacto (parábola) la curva ya no se cierra sobre sí misma, a diferencia de cuando e es menor que 1. Ese punto de transición es el límite entre curvas abiertas y cerradas.</p>
    </div>
  );
}

// ---- PM V ----

// PF2 · Movimiento: posición-tiempo y velocidad instantánea
function PosicionTiempo() {
  const [t0, setT0] = useState(2);
  const pos = (t) => t * t; // posición = t²
  const vel = 2 * t0; // derivada
  const W = 280, H = 190, pad = 24, xmin = 0, xmax = 6, ymin = 0, ymax = 36;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const pts = [];
  for (let t = xmin; t <= xmax; t += 0.2) pts.push(`${X(t)},${Y(pos(t))}`);
  const y0 = pos(t0);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        posición(t)=t² · velocidad instantánea en t={t0}: <span style={{ color: CI.rojo }}>{vel} m/s</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        <line x1={X(xmin)} y1={Y(y0 - vel * t0)} x2={X(xmax)} y2={Y(y0 + vel * (xmax - t0))} stroke={CI.rojo} strokeWidth="1.8" strokeDasharray="4 3" />
        <circle cx={X(t0)} cy={Y(y0)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.3" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 6 }}>Instante t: <b style={{ color: CI.ink }}>{t0}</b>
        <input type="range" min={0} max={5} step={0.5} value={t0} onChange={(e) => setT0(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>En t=0, la tangente ya tiene pendiente distinta de cero: el objeto no arranca desde el reposo en esta función posición=t², arranca ya en movimiento nulo pero acelerando.</p>
      <PanelSimulador titulo="🎮 Simulador: velocidad y aceleración" nota="Toca para lanzar carritos con distinta velocidad inicial. Los más rápidos recorren más distancia en el mismo tiempo — eso es la pendiente de la gráfica posición-tiempo.">
        <LienzoFisica alto={170}
          setup={(api) => { const { Matter, world, H } = api; const { Bodies, World } = Matter; api.engine.gravity.y = 0.3; World.add(world, Bodies.rectangle(api.W / 2, H - 6, api.W * 2, 12, { isStatic: true, render: { fillStyle: CI.surco } })); }}
          onTap={(api, x, y) => { const { Matter, world, H } = api; const { Bodies, World, Body } = Matter; const b = Bodies.rectangle(20, H - 22, 26, 16, { restitution: 0.2, friction: 0.01, frictionAir: 0.005, render: { fillStyle: CI.milpa, strokeStyle: CI.ink, lineWidth: 1.5 } }); World.add(world, b); Body.setVelocity(b, { x: 5 + Math.random() * 7, y: 0 }); }}
        />
      </PanelSimulador>
    </div>
  );
}

// PF3 · Simetría de funciones: par, impar o ninguna
function SimetriaFuncion() {
  const FNS = [
    { nombre: "f(x) = x²", f: (x) => x * x, tipo: "par" },
    { nombre: "f(x) = x³", f: (x) => x * x * x, tipo: "impar" },
    { nombre: "f(x) = x² + 1", f: (x) => x * x + 1, tipo: "par" },
    { nombre: "f(x) = x³ − x", f: (x) => x ** 3 - x, tipo: "impar" },
    { nombre: "f(x) = x² + x", f: (x) => x * x + x, tipo: "ninguna" },
  ];
  const [idx, setIdx] = useState(0);
  const cur = FNS[idx];
  const W = 260, H = 190, pad = 22, xmin = -5, xmax = 5, ymin = -10, ymax = 26;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const pts = [];
  for (let x = xmin; x <= xmax; x += 0.15) { const y = cur.f(x); if (y >= ymin && y <= ymax) pts.push(`${X(x)},${Y(y)}`); }
  return (
    <div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}>
        {FNS.map((f, i) => <button key={i} className={`tab ${idx === i ? "on" : ""}`} onClick={() => setIdx(i)} style={{ fontSize: 11.5, padding: "6px 8px" }}>{f.nombre}</button>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
      </svg>
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 14, fontWeight: 800, color: CI.rojo, textTransform: "uppercase" }}>{cur.tipo}</div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Nota que f(x)=x²+x no es ni par ni impar: alcanza con un solo término "desbalanceado" (el +x) para romper cualquiera de las dos simetrías.</p>
    </div>
  );
}

// PF4 · El concepto de límite: acercarse sin llegar
function ConceptoLimite() {
  const [dist, setDist] = useState(2);
  const x0 = 3;
  const x = x0 - dist / 10;
  const f = (v) => (v * v - 9) / (v - 3); // indeterminada en x=3, límite=6
  const val = x === 3 ? "indefinido" : r2ci(f(x));
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        f(x) = (x²−9)/(x−3), x → {r2ci(x)} → f(x) = <span style={{ color: CI.rojo }}>{val}</span>
      </div>
      <div style={{ background: CI.papel2, border: `1.5px solid ${CI.ink}`, borderRadius: 10, padding: 14, textAlign: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: CI.muted }}>Cuanto más te acercas a x = 3 (sin llegar), más se acerca f(x) a:</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: CI.milpaD, marginTop: 6 }}>6</div>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Distancia a x=3 (×0.1): <b style={{ color: CI.ink }}>{dist}</b>
        <input type="range" min={1} max={20} value={dist} onChange={(e) => setDist(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Acerca la distancia a 0.1, luego a 0.01: el valor de f(x) se acerca cada vez más a 6, aunque en x=3 exacto la función ni siquiera está definida (dividir entre 0).</p>
    </div>
  );
}

// PF5 · Funciones trascendentes: exponencial, logarítmica y trigonométrica
function FuncionesTrascendentes() {
  const TIPOS = { exp: { nombre: "Exponencial eˣ", f: (x) => Math.exp(x * 0.6), ymin: 0, ymax: 20 }, log: { nombre: "Logarítmica ln(x)", f: (x) => x > 0 ? Math.log(x) * 3 : null, ymin: -8, ymax: 8 }, sen: { nombre: "Trigonométrica sen(x)", f: (x) => Math.sin(x) * 5, ymin: -8, ymax: 8 } };
  const [tipo, setTipo] = useState("exp");
  const cur = TIPOS[tipo];
  const W = 270, H = 190, pad = 22, xmin = tipo === "log" ? 0.1 : -6, xmax = tipo === "sen" ? 12 : 6;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - cur.ymin) / (cur.ymax - cur.ymin)) * (H - 2 * pad);
  const pts = [];
  for (let x = xmin; x <= xmax; x += (xmax - xmin) / 100) { const y = cur.f(x); if (y !== null && y >= cur.ymin && y <= cur.ymax) pts.push(`${X(x)},${Y(y)}`); }
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
        {Object.keys(TIPOS).map((k) => <button key={k} className={`tab ${tipo === k ? "on" : ""}`} onClick={() => setTipo(k)} style={{ fontSize: 11.5 }}>{TIPOS[k].nombre}</button>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(cur.ymin)} x2={X(0)} y2={Y(cur.ymax)} stroke={CI.muted} strokeWidth="1" />
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
      </svg>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>La exponencial nunca toca el eje x (siempre es positiva), mientras que el logaritmo nunca cruza al lado izquierdo del eje y (no existe para x≤0) — dominios opuestos, por ser funciones inversas.</p>
    </div>
  );
}

// PF8 · Teorema Fundamental: área bajo la curva como integral
function AreaBajoCurva() {
  const [b, setB] = useState(4);
  const curvaRef = useRef(null);
  useEffect(() => { trazarSVG(curvaRef.current, 0.8); }, []);
  const f = (x) => x; // f(x)=x, integral=x²/2
  const area = r2ci((b * b) / 2);
  const W = 260, H = 190, pad = 22, xmin = 0, xmax = 6, ymin = 0, ymax = 6;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const areaPath = `M${X(0)},${Y(0)} L${X(0)},${Y(f(0))} ` + Array.from({ length: 30 }, (_, i) => { const x = (b * i) / 29; return `L${X(x)},${Y(f(x))}`; }).join(" ") + ` L${X(b)},${Y(0)} Z`;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15.5, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>
        ∫₀^{b} x dx = <span style={{ color: CI.rojo }}>{area}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1" />
        <path d={areaPath} fill={CI.milpaS} opacity="0.6" stroke="none" />
        <line ref={curvaRef} x1={X(0)} y1={Y(0)} x2={X(6)} y2={Y(6)} stroke={CI.milpa} strokeWidth="2.2" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 6 }}>Límite superior b: <b style={{ color: CI.ink }}>{b}</b>
        <input type="range" min={1} max={6} step={0.5} value={b} onChange={(e) => setB(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Duplica b: el área no se duplica, se cuadruplica (pasa de b²/2 a (2b)²/2). El área bajo una recta crece con el cuadrado del límite, no de forma proporcional.</p>
    </div>
  );
}

// ---- PM VI ----

// PF1 · Determinista vs aleatorio (clasificador)
function DeterministaAleatorio() {
  const CASOS = [
    { e: "Dejar caer una piedra desde 2 m", t: "determinista" }, { e: "Lanzar una moneda", t: "aleatorio" },
    { e: "Calentar agua a 100°C a nivel del mar", t: "determinista" }, { e: "El clima exacto dentro de 30 días", t: "aleatorio" },
    { e: "La suma de los ángulos de un triángulo", t: "determinista" }, { e: "El número que sale en un dado", t: "aleatorio" },
  ];
  const [idx, setIdx] = useState(0);
  const [resp, setResp] = useState(null);
  const cur = CASOS[idx];
  const elegir = (t) => setResp(t);
  const siguiente = () => { setIdx((i) => (i + 1) % CASOS.length); setResp(null); };
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, color: CI.ink, marginBottom: 14, minHeight: 40 }}>{cur.e}</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 12 }}>
        <button className="tab" style={{ padding: "10px 16px", background: resp === "determinista" ? (cur.t === "determinista" ? CI.milpaS : "#F6E3DE") : "#fff" }} onClick={() => elegir("determinista")}>Determinista</button>
        <button className="tab" style={{ padding: "10px 16px", background: resp === "aleatorio" ? (cur.t === "aleatorio" ? CI.milpaS : "#F6E3DE") : "#fff" }} onClick={() => elegir("aleatorio")}>Aleatorio</button>
      </div>
      {resp && <div style={{ textAlign: "center", fontWeight: 800, color: resp === cur.t ? CI.milpaD : CI.rojo, marginBottom: 10 }}>{resp === cur.t ? "✓ Correcto" : `✗ Es ${cur.t}`}</div>}
      <div style={{ textAlign: "center" }}><button className="tab on" onClick={siguiente}>Siguiente caso →</button></div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 12, lineHeight: 1.5 }}>Fíjate que "la suma de los ángulos de un triángulo" siempre da exactamente 180° — ni siquiera la geometría escapa a lo determinista, aunque no sea un experimento físico.</p>
    </div>
  );
}

// PF2 · Simulación: lanzar un dado y ver la frecuencia acumulada
function SimulacionDado() {
  const [historial, setHistorial] = useState([]);
  const conteos = [1, 2, 3, 4, 5, 6].map((n) => historial.filter((h) => h === n).length);
  const total = historial.length;
  const maxC = Math.max(1, ...conteos);
  const lanzar = () => setHistorial((h) => [...h, 1 + Math.floor(Math.random() * 6)].slice(-200));
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 10 }}>
        <button className="tab on" onClick={lanzar} style={{ padding: "10px 20px", fontSize: 15 }}>🎲 Lanzar dado</button>
        <button className="tab" onClick={() => setHistorial([])} style={{ padding: "10px 16px", marginLeft: 8 }}>Reiniciar</button>
      </div>
      <div style={{ textAlign: "center", fontSize: 13, color: CI.muted, marginBottom: 8 }}>Lanzamientos: {total}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
        {conteos.map((c, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: CI.muted }}>{total ? r2ci((c / total) * 100) + "%" : ""}</div>
            <div style={{ height: `${(c / maxC) * 80}px`, background: CI.milpa, borderRadius: "4px 4px 0 0", border: `1px solid ${CI.ink}` }} />
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>{i + 1}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Con menos de 10 lanzamientos es común ver una cara ausente (0%) o dominando con 30%+. Ese "ruido" desaparece conforme subes los lanzamientos a 100 o más.</p>
      <PanelSimulador titulo="🎮 Simulador: lanza dados de verdad" nota="Toca para lanzar dados que ruedan y rebotan con física real antes de caer. Cada resultado es azaroso — igual que en la teoría de la probabilidad de este ejercicio.">
        <LienzoFisica alto={200}
          setup={(api) => { const { Matter, world, W, H } = api; const { Bodies, World } = Matter; World.add(world, Bodies.rectangle(W / 2, H - 6, W * 2, 12, { isStatic: true, render: { fillStyle: CI.surco } })); }}
          onTap={(api, x, y) => { const { Matter, world } = api; const { Bodies, World, Body } = Matter; const d = Bodies.rectangle(x, Math.min(y, 30), 26, 26, { restitution: 0.5, friction: 0.1, chamfer: { radius: 4 }, render: { fillStyle: CI.papel2, strokeStyle: CI.ink, lineWidth: 2 } }); World.add(world, d); Body.setAngularVelocity(d, (Math.random() - 0.5) * 0.6); Body.setVelocity(d, { x: (Math.random() - 0.5) * 6, y: 2 }); }}
        />
      </PanelSimulador>
    </div>
  );
}

// PF4 · Técnicas de conteo: permutaciones y combinaciones
function ConteoPermutaciones() {
  const [n, setN] = useState(5);
  const [r, setR] = useState(2);
  const fact = (x) => (x <= 1 ? 1 : x * fact(x - 1));
  const perm = fact(n) / fact(n - r);
  const comb = perm / fact(r);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 14.5, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        De {n} elementos, elegir {r}: permutaciones = <span style={{ color: CI.rojo }}>{perm}</span> · combinaciones = <span style={{ color: CI.azul }}>{comb}</span>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>n (elementos totales): <b style={{ color: CI.ink }}>{n}</b>
        <input type="range" min={2} max={7} value={n} onChange={(e) => { const nv = +e.target.value; setN(nv); if (r > nv) setR(nv); }} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>r (a elegir): <b style={{ color: CI.ink }}>{r}</b>
        <input type="range" min={1} max={n} value={r} onChange={(e) => setR(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Con n=5 y r=5 (elegir todos), las combinaciones se reducen a solo 1 — ya no importa el orden porque eliges el grupo completo, solo hay una forma de "elegir a todos".</p>
    </div>
  );
}

// PF5 · Representaciones gráficas: elegir la gráfica correcta
function TipoGrafica() {
  const CASOS = [
    { d: "color favorito (categórica)", g: "barras" }, { d: "estatura de 40 personas (continua)", g: "histograma" }, { d: "ventas por mes de un año (tiempo)", g: "líneas" },
  ];
  const [idx, setIdx] = useState(0);
  const cur = CASOS[idx];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {CASOS.map((c, i) => <button key={i} className={`tab ${idx === i ? "on" : ""}`} onClick={() => setIdx(i)} style={{ fontSize: 11.5 }}>{c.d}</button>)}
      </div>
      <div style={{ background: CI.papel2, border: `1.5px solid ${CI.ink}`, borderRadius: 10, padding: 20, textAlign: "center" }}>
        {cur.g === "barras" && <div style={{ display: "flex", gap: 6, justifyContent: "center", alignItems: "flex-end", height: 70 }}>{[40, 65, 30, 55].map((h, i) => <div key={i} style={{ width: 24, height: h, background: CI.milpa, border: `1px solid ${CI.ink}` }} />)}</div>}
        {cur.g === "histograma" && <div style={{ display: "flex", gap: 1, justifyContent: "center", alignItems: "flex-end", height: 70 }}>{[20, 45, 65, 50, 25, 10].map((h, i) => <div key={i} style={{ width: 16, height: h, background: CI.surco, border: `1px solid ${CI.ink}` }} />)}</div>}
        {cur.g === "líneas" && <svg viewBox="0 0 160 70" style={{ width: 160, height: 70 }}><polyline points="0,50 30,30 60,45 90,15 120,35 150,10" fill="none" stroke={CI.milpa} strokeWidth="2.5" /></svg>}
        <div style={{ marginTop: 10, fontWeight: 800, color: CI.rojo, textTransform: "uppercase", fontSize: 13 }}>{cur.g}</div>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Si usaras un histograma para el color favorito (categórico), no tendría sentido: los histogramas necesitan datos numéricos continuos que se puedan agrupar en rangos.</p>
    </div>
  );
}

// PF6 · Relación entre variables: correlación en un diagrama de dispersión
function CorrelacionDispersión() {
  const [fuerza, setFuerza] = useState(70);
  const puntos = React.useMemo(() => {
    const arr = [];
    for (let i = 0; i < 25; i++) {
      const x = Math.random() * 100;
      const ruido = (Math.random() - 0.5) * (100 - fuerza);
      const y = Math.max(0, Math.min(100, (x * fuerza) / 100 + ruido));
      arr.push([x, y]);
    }
    return arr;
    // eslint-disable-next-line
  }, [fuerza]);
  const W = 260, H = 190, pad = 20;
  const X = (v) => pad + (v / 100) * (W - 2 * pad);
  const Y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 14, color: CI.muted, marginBottom: 8 }}>correlación {fuerza >= 70 ? "fuerte" : fuerza >= 35 ? "moderada" : "débil"}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1={X(0)} y1={Y(0)} x2={X(100)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(0)} x2={X(0)} y2={Y(100)} stroke={CI.muted} strokeWidth="1" />
        {puntos.map(([x, y], i) => <circle key={i} cx={X(x)} cy={Y(y)} r="3.5" fill={CI.milpa} opacity="0.8" />)}
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Fuerza de la relación: <b style={{ color: CI.ink }}>{fuerza}%</b>
        <input type="range" min={0} max={100} value={fuerza} onChange={(e) => setFuerza(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Con fuerza en 0%, los puntos forman una nube sin ninguna tendencia visible — ninguna línea recta los describiría mejor que otra.</p>
    </div>
  );
}

// PF7 · Muestreo: población vs muestra
function PoblacionMuestra() {
  const [tam, setTam] = useState(15);
  const total = 60;
  const puntos = React.useMemo(() => Array.from({ length: total }, () => ({ x: Math.random() * 260, y: Math.random() * 140 })), []);
  const muestraIdx = React.useMemo(() => { const idxs = [...Array(total).keys()]; for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[idxs[i], idxs[j]] = [idxs[j], idxs[i]]; } return new Set(idxs.slice(0, tam)); }, [tam]);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 13.5, color: CI.muted, marginBottom: 8 }}>población: {total} · muestra aleatoria: <b style={{ color: CI.rojo }}>{tam}</b></div>
      <svg viewBox="0 0 260 140" style={{ width: "100%", height: "auto", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        {puntos.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={muestraIdx.has(i) ? 5 : 3} fill={muestraIdx.has(i) ? CI.rojo : CI.linea} stroke={muestraIdx.has(i) ? "#fff" : "none"} strokeWidth="1" />)}
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Tamaño de la muestra: <b style={{ color: CI.ink }}>{tam}</b>
        <input type="range" min={2} max={total} value={tam} onChange={(e) => setTam(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Con una muestra de solo 2 (el mínimo), es fácil que por azar no represente bien a la población — por eso la fuerza estadística real empieza a notarse con muestras más grandes.</p>
    </div>
  );
}

// ============================================================================
// LOTE 4 — Interactivos "Aprender" para completar CNEyT I y CNEyT III
// ============================================================================

// ---- CNEyT I ----

// PF1 · La ciencia como actividad social (diagrama)
function CienciaSocial() {
  const [modo, setModo] = useState("colectiva");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}>
        <button className={`tab ${modo === "aislada" ? "on" : ""}`} onClick={() => setModo("aislada")}>Mito: genio aislado</button>
        <button className={`tab ${modo === "colectiva" ? "on" : ""}`} onClick={() => setModo("colectiva")}>Realidad: comunidad</button>
      </div>
      <svg viewBox="0 0 260 150" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        {modo === "aislada" ? (
          <><circle cx="130" cy="75" r="26" fill={CI.milpaS} stroke={CI.ink} strokeWidth="1.5" /><text x="130" y="80" fontSize="11" textAnchor="middle">1 persona</text></>
        ) : (
          [[60, 50], [130, 40], [200, 55], [90, 100], [170, 100]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="18" fill={CI.milpaS} stroke={CI.ink} strokeWidth="1.3" /><line x1={x} y1={y} x2="130" y2="75" stroke={CI.linea} strokeWidth="1" /></g>)
        )}
      </svg>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Nota que en la vista "colectiva", cada nodo se conecta con el centro: ninguna idea científica se sostiene aislada, siempre se apoya en el trabajo de otros.</p>
    </div>
  );
}

// PF2 · Fenómenos interrelacionados (diagrama de disciplinas conectadas)
function FenomenosInterrelacionados() {
  const [sel, setSel] = useState(null);
  const nodos = [{ id: "fis", label: "Física", x: 60, y: 40 }, { id: "qui", label: "Química", x: 200, y: 40 }, { id: "bio", label: "Biología", x: 130, y: 110 }];
  return (
    <div>
      <svg viewBox="0 0 260 150" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1="60" y1="40" x2="200" y2="40" stroke={CI.linea} strokeWidth="1.5" />
        <line x1="60" y1="40" x2="130" y2="110" stroke={CI.linea} strokeWidth="1.5" />
        <line x1="200" y1="40" x2="130" y2="110" stroke={CI.linea} strokeWidth="1.5" />
        {nodos.map((n) => (
          <g key={n.id} onClick={() => setSel(n.id)} style={{ cursor: "pointer" }}>
            <circle cx={n.x} cy={n.y} r="28" fill={sel === n.id ? CI.maiz : CI.milpaS} stroke={CI.ink} strokeWidth="1.5" />
            <text x={n.x} y={n.y + 4} fontSize="11" textAnchor="middle" fontWeight="700">{n.label}</text>
          </g>
        ))}
      </svg>
      <div style={{ textAlign: "center", fontSize: 12.5, color: CI.muted, marginTop: 8, minHeight: 20 }}>
        {sel === "fis" && "Un fenómeno como el arcoíris involucra física (refracción de luz)…"}
        {sel === "qui" && "…también química (composición del agua que forma las gotas)…"}
        {sel === "bio" && "…y hasta biología (cómo el ojo humano percibe los colores)."}
        {!sel && "Toca cada disciplina para ver cómo se conecta con las demás."}
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Toca los tres nodos en distinto orden: notarás que las líneas que los conectan ya estaban ahí desde el principio — la interconexión no depende de qué disciplina mires primero.</p>
    </div>
  );
}

// PF3 ya tiene interactivo asignado en v3 (reusa el de energía si aplica) — aquí Densidad para CNEyT1
function DensidadObjetos() {
  const [m, setM] = useState(50);
  const [v, setV] = useState(20);
  const d = r2ci(m / v);
  const flota = d < 1;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15.5, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        densidad = {m}/{v} = <span style={{ color: CI.rojo }}>{d} g/cm³</span> → {flota ? "flota en agua" : "se hunde en agua"}
      </div>
      <svg viewBox="0 0 220 130" style={{ width: "100%", background: "#DCEBF5", borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <rect x="0" y="50" width="220" height="80" fill="#B7D8EC" />
        <rect x={95} y={flota ? 35 : 60} width="30" height="30" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.5" />
        <text x="110" y="20" fontSize="10" textAnchor="middle" fill={CI.muted}>densidad del agua = 1 g/cm³</text>
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Masa (g): <b style={{ color: CI.ink }}>{m}</b>
        <input type="range" min={5} max={100} value={m} onChange={(e) => setM(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Volumen (cm³): <b style={{ color: CI.ink }}>{v}</b>
        <input type="range" min={5} max={100} value={v} onChange={(e) => setV(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Fija la masa en 50 g y sube el volumen poco a poco: hay un punto exacto (cuando el volumen pasa de 50 cm³) donde el bloque cruza de hundirse a flotar — ese es el punto donde su densidad iguala a 1.</p>
      <PanelSimulador titulo="🎮 Simulador: ¿flota o se hunde?" nota="Toca para soltar objetos en el agua. Los ligeros (poca densidad) flotan arriba; los pesados se van al fondo. Arrástralos para empujarlos bajo el agua y ve cómo suben.">
        <LienzoFisica alto={220} fondo="#B7D8EC"
          setup={(api) => {
            const { Matter, world, W, H } = api; const { Bodies, World, Events, Body, Composite } = Matter;
            const nivelAgua = H * 0.35; // superficie del agua
            // empuje (flotación) simple: a los cuerpos marcados con flotante, se les aplica fuerza hacia arriba si están bajo el agua
            Events.on(api.engine, "beforeUpdate", () => {
              for (const b of Composite.allBodies(world)) {
                if (!b.plugin || !b.plugin.flotante) continue;
                if (b.position.y > nivelAgua) {
                  const prof = Math.min(1, (b.position.y - nivelAgua) / 60);
                  Body.applyForce(b, b.position, { x: 0, y: -b.plugin.empuje * prof });
                  Body.setVelocity(b, { x: b.velocity.x * 0.96, y: b.velocity.y * 0.9 }); // arrastre del agua
                }
              }
            });
          }}
          onTap={(api, x, y) => {
            const { Matter, world } = api; const { Bodies, World } = Matter;
            const ligero = Math.random() > 0.5;
            const b = Bodies.circle(x, Math.min(y, 30), 15, { restitution: 0.3, frictionAir: 0.02, render: { fillStyle: ligero ? CI.maiz : CI.surco, strokeStyle: CI.ink, lineWidth: 1.5 } });
            b.plugin = { flotante: true, empuje: ligero ? 0.0016 : 0.0006 }; // ligero sube más
            World.add(world, b);
          }}
        />
      </PanelSimulador>
    </div>
  );
}

// PF4 · Clasificador de materia (mezcla, elemento, compuesto)
function ClasificadorMateria() {
  const CASOS = [
    { n: "Agua de mar", t: "mezcla" }, { n: "Oxígeno (O₂)", t: "elemento" }, { n: "Agua pura (H₂O)", t: "compuesto" },
    { n: "Ensalada de frutas", t: "mezcla" }, { n: "Oro (Au)", t: "elemento" }, { n: "Sal de mesa (NaCl)", t: "compuesto" },
  ];
  const [idx, setIdx] = useState(0);
  const [resp, setResp] = useState(null);
  const cur = CASOS[idx];
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{cur.n}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10, flexWrap: "wrap" }}>
        {["mezcla", "elemento", "compuesto"].map((t) => (
          <button key={t} className="tab" style={{ padding: "8px 12px", background: resp === t ? (cur.t === t ? CI.milpaS : "#F6E3DE") : "#fff" }} onClick={() => setResp(t)}>{t}</button>
        ))}
      </div>
      {resp && <div style={{ textAlign: "center", fontWeight: 800, color: resp === cur.t ? CI.milpaD : CI.rojo }}>{resp === cur.t ? "✓ Correcto" : `✗ Es ${cur.t}`}</div>}
      <div style={{ textAlign: "center", marginTop: 10 }}><button className="tab on" onClick={() => { setIdx((i) => (i + 1) % CASOS.length); setResp(null); }}>Siguiente →</button></div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 12, lineHeight: 1.5 }}>El agua de mar y el aire que respiras son ambos mezclas, aunque uno sea líquido y otro gas — el estado físico no determina si algo es mezcla o sustancia pura.</p>
    </div>
  );
}

// PF5 · Modelo del átomo (protones, neutrones, electrones)
function ModeloAtomo() {
  const [z, setZ] = useState(6); // número atómico
  const [nmasa, setNmasa] = useState(12);
  const neutrones = nmasa - z;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 14.5, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>
        Z={z} protones · {neutrones} neutrones · {z} electrones
      </div>
      <svg viewBox="0 0 220 160" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <circle cx="110" cy="80" r="18" fill={CI.rojo} opacity="0.25" stroke={CI.rojo} strokeWidth="1.3" />
        <text x="110" y="84" fontSize="10" textAnchor="middle" fontWeight="700" fill={CI.rojo}>núcleo</text>
        {[38, 58].map((r, i) => <circle key={i} cx="110" cy="80" r={r} fill="none" stroke={CI.azul} strokeWidth="1" strokeDasharray="3 2" />)}
        {Array.from({ length: Math.min(z, 8) }).map((_, i) => { const ang = (i / Math.min(z, 8)) * 2 * Math.PI; const r = 38 + (i % 2) * 20; return <circle key={i} cx={110 + r * Math.cos(ang)} cy={80 + r * Math.sin(ang)} r="4" fill={CI.azul} />; })}
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Número atómico (Z, protones): <b style={{ color: CI.ink }}>{z}</b>
        <input type="range" min={1} max={20} value={z} onChange={(e) => { const nv = +e.target.value; setZ(nv); if (nmasa < nv) setNmasa(nv); }} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Número de masa: <b style={{ color: CI.ink }}>{nmasa}</b>
        <input type="range" min={z} max={z * 2 + 5} value={nmasa} onChange={(e) => setNmasa(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Fija Z=1 (hidrógeno): con número de masa 1, no hay neutrones en absoluto. Sube el número de masa a 2 o 3 y verás aparecer los isótopos deuterio y tritio.</p>
    </div>
  );
}

// PF6 · Enlaces químicos: iónico vs covalente
function EnlacesQuimicos() {
  const [tipo, setTipo] = useState("ionico");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <button className={`tab ${tipo === "ionico" ? "on" : ""}`} onClick={() => setTipo("ionico")}>Iónico (NaCl)</button>
        <button className={`tab ${tipo === "covalente" ? "on" : ""}`} onClick={() => setTipo("covalente")}>Covalente (H₂O)</button>
      </div>
      <svg viewBox="0 0 220 120" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        {tipo === "ionico" ? (
          <><circle cx="70" cy="60" r="22" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.5" /><text x="70" y="64" fontSize="12" textAnchor="middle" fontWeight="700">Na⁺</text>
            <circle cx="150" cy="60" r="26" fill={CI.azul} opacity="0.3" stroke={CI.azul} strokeWidth="1.5" /><text x="150" y="64" fontSize="12" textAnchor="middle" fontWeight="700">Cl⁻</text>
            <line x1="30" y1="60" x2="45" y2="60" stroke={CI.rojo} strokeWidth="1"><animate attributeName="x1" values="30;40;30" dur="1.5s" repeatCount="indefinite" /></line></>
        ) : (
          <><circle cx="110" cy="55" r="20" fill={CI.rojo} opacity="0.3" stroke={CI.rojo} strokeWidth="1.5" /><text x="110" y="59" fontSize="12" textAnchor="middle" fontWeight="700">O</text>
            <circle cx="65" cy="85" r="14" fill={CI.milpaS} stroke={CI.milpaD} strokeWidth="1.3" /><text x="65" y="89" fontSize="10" textAnchor="middle" fontWeight="700">H</text>
            <circle cx="155" cy="85" r="14" fill={CI.milpaS} stroke={CI.milpaD} strokeWidth="1.3" /><text x="155" y="89" fontSize="10" textAnchor="middle" fontWeight="700">H</text>
            <line x1="95" y1="65" x2="75" y2="78" stroke={CI.ink} strokeWidth="2.5" /><line x1="125" y1="65" x2="145" y2="78" stroke={CI.ink} strokeWidth="2.5" /></>
        )}
      </svg>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>En el covalente del agua, los dos hidrógenos apuntan en ángulo, no en línea recta con el oxígeno — esa forma "doblada" es la razón de que el agua sea una molécula polar.</p>
    </div>
  );
}

// PF7 · Estados de agregación: sólido, líquido, gas según temperatura
function EstadosAgregacion() {
  const [temp, setTemp] = useState(20);
  const estado = temp < 0 ? "sólido" : temp < 100 ? "líquido" : "gas";
  const n = 16;
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>{temp}°C → <span style={{ color: CI.rojo, textTransform: "uppercase" }}>{estado}</span></div>
      <svg viewBox="0 0 200 130" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        {Array.from({ length: n }).map((_, i) => {
          let x, y;
          if (estado === "sólido") { x = 30 + (i % 4) * 40; y = 30 + Math.floor(i / 4) * 25; }
          else if (estado === "líquido") { x = 20 + ((i * 37) % 160); y = 40 + ((i * 53) % 70); }
          else { x = 10 + ((i * 67) % 180); y = 10 + ((i * 41) % 110); }
          return <circle key={i} cx={x} cy={y} r="6" fill={CI.milpa}>
            {estado !== "sólido" && <animate attributeName="cx" values={`${x};${x + (estado === "gas" ? 20 : 8)};${x}`} dur={estado === "gas" ? "1s" : "2s"} repeatCount="indefinite" />}
          </circle>;
        })}
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Temperatura (°C): <b style={{ color: CI.ink }}>{temp}</b>
        <input type="range" min={-20} max={150} value={temp} onChange={(e) => setTemp(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Justo en 0°C y en 100°C la temperatura no sube aunque seguirías calentando: toda la energía extra se usa en cambiar de estado (fusión o ebullición), no en subir la temperatura.</p>
      <PanelSimulador titulo="🎮 Simulador: movimiento de las partículas" nota="Toca para agitar las partículas (subir la temperatura): se mueven más rápido y chocan más, como en un gas. Es el mismo movimiento molecular que define sólido, líquido y gas.">
        <LienzoFisica alto={200}
          setup={(api) => {
            const { Matter, world, W, H } = api; const { Bodies, World, Body } = Matter;
            for (let i = 0; i < 14; i++) {
              const b = Bodies.circle(30 + Math.random() * (W - 60), 30 + Math.random() * (H - 60), 9, { restitution: 1, friction: 0, frictionAir: 0, render: { fillStyle: CI.milpa, strokeStyle: CI.ink, lineWidth: 1 } });
              Body.setVelocity(b, { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 4 });
              World.add(world, b);
            }
            // sin gravedad: las partículas se mueven libres como en un gas
            api.engine.gravity.y = 0;
          }}
          onTap={(api) => { const { Matter, world } = api; const { Body, Composite } = Matter; for (const b of Composite.allBodies(world)) { if (b.isStatic) continue; Body.setVelocity(b, { x: b.velocity.x * 1.5 + (Math.random() - 0.5) * 3, y: b.velocity.y * 1.5 + (Math.random() - 0.5) * 3 }); } }}
        />
      </PanelSimulador>
    </div>
  );
}

// PF8 · Naturaleza dual: energética y corpuscular
function NaturalezaDual() {
  const [modo, setModo] = useState("particula");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <button className={`tab ${modo === "particula" ? "on" : ""}`} onClick={() => setModo("particula")}>Vista corpuscular</button>
        <button className={`tab ${modo === "onda" ? "on" : ""}`} onClick={() => setModo("onda")}>Vista energética</button>
      </div>
      <svg viewBox="0 0 220 100" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        {modo === "particula" ? (
          Array.from({ length: 10 }).map((_, i) => <circle key={i} cx={20 + i * 20} cy={50 + (i % 3) * 10} r="5" fill={CI.maiz} stroke={CI.surco} strokeWidth="1" />)
        ) : (
          <polyline points={Array.from({ length: 60 }, (_, i) => `${i * 3.7},${50 - 30 * Math.sin(i * 0.3)}`).join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        )}
      </svg>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>En la vista "partícula" cada punto es independiente; en "energética" todo es una sola onda continua — la materia real se comporta como ambas cosas, según el experimento que la observe.</p>
    </div>
  );
}

// ---- CNEyT III ----

// PF1 · La Tierra como sistema de subsistemas
function TierraSistema() {
  const [sel, setSel] = useState(null);
  const subs = [{ id: "geo", n: "Geosfera", d: "Rocas, suelo, interior de la Tierra" }, { id: "hidro", n: "Hidrosfera", d: "Toda el agua del planeta" }, { id: "atmo", n: "Atmósfera", d: "La capa de gases que envuelve la Tierra" }, { id: "bio", n: "Biosfera", d: "Todos los seres vivos" }];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}>
        {subs.map((s) => <button key={s.id} className={`tab ${sel === s.id ? "on" : ""}`} onClick={() => setSel(s.id)}>{s.n}</button>)}
      </div>
      <svg viewBox="0 0 200 200" style={{ width: 200, height: 200, display: "block", margin: "0 auto" }}>
        <circle cx="100" cy="100" r="60" fill={sel === "geo" ? CI.maiz : "#D9C7A0"} stroke={CI.ink} strokeWidth="1.5" />
        <circle cx="100" cy="100" r="75" fill="none" stroke={sel === "hidro" ? CI.azul : "#B7D8EC"} strokeWidth="8" opacity="0.7" />
        <circle cx="100" cy="100" r="88" fill="none" stroke={sel === "atmo" ? CI.surco : "#E4EEF7"} strokeWidth="6" opacity="0.7" />
        <circle cx="70" cy="80" r="6" fill={sel === "bio" ? CI.milpaD : CI.milpa} /><circle cx="120" cy="110" r="6" fill={sel === "bio" ? CI.milpaD : CI.milpa} />
      </svg>
      <div style={{ textAlign: "center", fontSize: 12.5, color: CI.muted, marginTop: 8, minHeight: 20 }}>{sel ? subs.find((s) => s.id === sel).d : "Toca cada subsistema"}</div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Toca "Biosfera" y luego "Atmósfera": notarás que ambos círculos se traslapan en el dibujo — ningún subsistema termina donde empieza el siguiente, se superponen físicamente.</p>
    </div>
  );
}

// PF2 · Capas de la atmósfera
function CapasAtmosfera() {
  const capas = [{ n: "Exosfera", h: 20, c: "#DCEBF5" }, { n: "Termosfera", h: 35, c: "#C3DDF0" }, { n: "Mesosfera", h: 50, c: "#A9CEEA" }, { n: "Estratosfera", h: 65, c: "#8FBFE3" }, { n: "Troposfera", h: 80, c: "#74AFDC" }];
  const [sel, setSel] = useState(4);
  return (
    <div>
      <div style={{ display: "flex", gap: 10 }}>
        <svg viewBox="0 0 100 200" style={{ width: 100, height: 200 }}>
          {capas.map((c, i) => <rect key={i} x="10" y={i * 40} width="80" height="40" fill={c.c} stroke={sel === i ? CI.rojo : CI.ink} strokeWidth={sel === i ? 2.5 : 1} onClick={() => setSel(i)} style={{ cursor: "pointer" }} />)}
        </svg>
        <div style={{ flex: 1 }}>
          {capas.map((c, i) => <div key={i} onClick={() => setSel(i)} style={{ padding: "6px 8px", cursor: "pointer", fontWeight: sel === i ? 800 : 500, color: sel === i ? CI.rojo : CI.ink, fontSize: 13 }}>{c.n}</div>)}
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>La troposfera es la capa más delgada de las cinco, pero es donde ocurre el 100% del clima que vives a diario — tamaño no es lo mismo que importancia.</p>
    </div>
  );
}

// PF3 · Cadena trófica y flujo de energía
function CadenaTrofica() {
  const niveles = [{ n: "Productores", e: "🌿", ancho: 100 }, { n: "Consumidores 1º", e: "🐛", ancho: 70 }, { n: "Consumidores 2º", e: "🐸", ancho: 45 }, { n: "Consumidores 3º", e: "🦅", ancho: 25 }];
  return (
    <div>
      {niveles.map((n, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ width: `${n.ancho}%`, height: 30, background: CI.milpaS, border: `1.5px solid ${CI.ink}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{n.e} {n.n}</div>
        </div>
      ))}
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Si un depredador tope desapareciera, la energía "ahorrada" no vuelve a las plantas: simplemente el nivel anterior (herbívoros) crecería sin control, alterando toda la pirámide.</p>
    </div>
  );
}

// PF4 · Estructura de una reacción química (reorganización de átomos)
function ReaccionEstructura() {
  const [paso, setPaso] = useState(0);
  const PASOS = ["Reactivos separados: 2 H₂ + O₂", "Se rompen enlaces existentes", "Los átomos se reorganizan", "Se forman nuevos enlaces: 2 H₂O"];
  return (
    <div>
      <div style={{ background: CI.papel2, border: `1.5px solid ${CI.ink}`, borderRadius: 10, padding: 16, textAlign: "center", minHeight: 60 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: CI.milpaD }}>{PASOS[paso]}</div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
        <button className="tab" disabled={paso === 0} onClick={() => setPaso((p) => Math.max(0, p - 1))}>← Anterior</button>
        <button className="tab on" disabled={paso === PASOS.length - 1} onClick={() => setPaso((p) => Math.min(PASOS.length - 1, p + 1))}>Siguiente →</button>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Entre el paso 2 y el paso 3, el número total de átomos de hidrógeno y oxígeno no cambia en ningún momento — solo su acomodo se transforma, nunca su cantidad.</p>
    </div>
  );
}

// PF5 · Oxigenación de la atmósfera (línea de tiempo)
function OxigenacionAtmosfera() {
  const [t, setT] = useState(50);
  const o2 = r2ci(Math.min(21, (t / 100) * 21));
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>Hace {4600 - Math.round(t * 46)} millones de años → O₂ atmosférico ≈ <span style={{ color: CI.rojo }}>{o2}%</span></div>
      <div style={{ height: 24, background: "linear-gradient(90deg,#8B5E3C,#74AFDC)", borderRadius: 12, border: `1.5px solid ${CI.ink}`, position: "relative", marginBottom: 6 }}>
        <div style={{ position: "absolute", left: `calc(${t}% - 5px)`, top: -4, width: 10, height: 32, background: "#fff", border: `2px solid ${CI.ink}`, borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: CI.muted, marginBottom: 10 }}><span>Tierra primitiva (sin O₂)</span><span>Hoy (21% O₂)</span></div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Avance en el tiempo: <b style={{ color: CI.ink }}>{t}%</b>
        <input type="range" min={0} max={100} value={t} onChange={(e) => setT(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>En el extremo izquierdo (Tierra primitiva), el oxígeno es prácticamente 0% — irrespirable para nosotros hoy, aunque en ese momento era el ambiente normal del planeta.</p>
    </div>
  );
}

// PF6 · Fotosíntesis: reactivos y productos
function FotosintesisVisual() {
  const [luz, setLuz] = useState(70);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 14, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>6CO₂ + 6H₂O + luz → C₆H₁₂O₆ + 6O₂</div>
      <svg viewBox="0 0 220 120" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <circle cx="60" cy="60" r={30 + luz / 6} fill={CI.maiz} opacity="0.5">
          <animate attributeName="r" values={`${28 + luz / 6};${32 + luz / 6};${28 + luz / 6}`} dur="2s" repeatCount="indefinite" />
        </circle>
        <text x="60" y="64" fontSize="11" textAnchor="middle" fontWeight="700">☀ luz</text>
        <path d="M100,60 L150,60" stroke={CI.ink} strokeWidth="2" markerEnd="url(#arrow)" />
        <polygon points="150,55 160,60 150,65" fill={CI.ink} />
        <circle cx="190" cy="45" r="18" fill={CI.milpaS} stroke={CI.milpaD} strokeWidth="1.3" /><text x="190" y="49" fontSize="9" textAnchor="middle">glucosa</text>
        <circle cx="190" cy="85" r="18" fill={CI.azul} opacity="0.3" stroke={CI.azul} strokeWidth="1.3" /><text x="190" y="89" fontSize="9" textAnchor="middle">O₂</text>
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Intensidad de luz: <b style={{ color: CI.ink }}>{luz}%</b>
        <input type="range" min={0} max={100} value={luz} onChange={(e) => setLuz(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Si la intensidad de luz llegara a 0%, la reacción se detiene por completo: sin luz no hay fotosíntesis, sin importar cuánto CO₂ o agua haya disponible.</p>
    </div>
  );
}

// PF7 · Deterioro ambiental: escala de impacto
function DeterioroAmbiental() {
  const [factor, setFactor] = useState(3);
  const NIVELES = ["mínimo", "leve", "moderado", "alto", "severo", "crítico"];
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, marginBottom: 10, color: factor >= 4 ? CI.rojo : CI.milpaD }}>Nivel de impacto: {NIVELES[factor]}</div>
      <div style={{ display: "flex", gap: 3, marginBottom: 10 }}>
        {NIVELES.map((_, i) => <div key={i} style={{ flex: 1, height: 20, background: i <= factor ? `hsl(${100 - i * 20},60%,45%)` : "#eee", border: `1px solid ${CI.ink}` }} />)}
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Factor de deterioro (deforestación, emisiones…): <b style={{ color: CI.ink }}>{factor}</b>
        <input type="range" min={0} max={5} value={factor} onChange={(e) => setFactor(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Del nivel 0 al 5 no es un salto parejo: pasar de "alto" a "severo" representa muchísimo más daño acumulado que pasar de "mínimo" a "leve" — la escala no es lineal en sus consecuencias.</p>
    </div>
  );
}

// PF8 · Innovaciones tecnológicas ambientales
function InnovacionesAmbientales() {
  const [sel, setSel] = useState(0);
  const TECS = [{ n: "Paneles solares", d: "Convierten luz solar en electricidad sin emisiones", icono: "☀" }, { n: "Turbinas eólicas", d: "Aprovechan el viento para generar electricidad limpia", icono: "🌬" }, { n: "Reciclaje de plástico", d: "Reduce la extracción de petróleo nuevo y la basura", icono: "♻" }];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {TECS.map((t, i) => <button key={i} className={`tab ${sel === i ? "on" : ""}`} onClick={() => setSel(i)}>{t.icono} {t.n}</button>)}
      </div>
      <div style={{ background: CI.papel2, border: `1.5px solid ${CI.ink}`, borderRadius: 10, padding: 16, textAlign: "center" }}>
        <div style={{ fontSize: 30 }}>{TECS[sel].icono}</div>
        <div style={{ fontSize: 13.5, color: CI.ink, marginTop: 8 }}>{TECS[sel].d}</div>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Las tres tecnologías mostradas atacan problemas distintos (energía, transporte, residuos) — no existe una sola solución tecnológica que resuelva todo el deterioro ambiental a la vez.</p>
    </div>
  );
}

// ============================================================================
// LOTE 5 — Interactivos para completar CNEyT II, IV, V, VI (restantes)
// ============================================================================

// ---- CNEyT II (restantes) ----

// PF1 · Cadena de transformación de energía
function CadenaEnergia() {
  const CASOS = [
    { n: "Panel solar", cad: ["Luminosa", "Eléctrica"] }, { n: "Pila y foco", cad: ["Química", "Eléctrica", "Luminosa"] },
    { n: "Objeto que cae", cad: ["Potencial", "Cinética"] }, { n: "Estufa de gas", cad: ["Química", "Térmica"] },
  ];
  const [idx, setIdx] = useState(0);
  const c = CASOS[idx];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
        {CASOS.map((cc, i) => <button key={i} className={`tab ${idx === i ? "on" : ""}`} onClick={() => setIdx(i)}>{cc.n}</button>)}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
        {c.cad.map((e, i) => (
          <React.Fragment key={i}>
            <div style={{ padding: "10px 12px", background: CI.milpaS, border: `1.5px solid ${CI.ink}`, borderRadius: 8, fontWeight: 700, fontSize: 12.5 }}>{e}</div>
            {i < c.cad.length - 1 && <span style={{ fontSize: 18, color: CI.muted }}>→</span>}
          </React.Fragment>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 14, lineHeight: 1.5 }}>En "objeto que cae", nota que no hay energía química involucrada — la cadena de transformación depende completamente de dónde arranca el fenómeno, no todas las cadenas son iguales.</p>
    </div>
  );
}

// PF4 · Propagación del calor: conducción, convección, radiación animadas
function PropagacionCalor() {
  const [modo, setModo] = useState("conduccion");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {[["conduccion", "Conducción"], ["conveccion", "Convección"], ["radiacion", "Radiación"]].map(([k, l]) => <button key={k} className={`tab ${modo === k ? "on" : ""}`} onClick={() => setModo(k)}>{l}</button>)}
      </div>
      <svg viewBox="0 0 220 120" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        {modo === "conduccion" && <>
          <rect x="20" y="55" width="180" height="12" fill="#B08650" stroke={CI.ink} />
          {[40, 70, 100, 130, 160, 190].map((x, i) => <circle key={i} cx={x} cy="61" r="5" fill={CI.rojo} opacity={1 - i * 0.13}><animate attributeName="opacity" values={`${1 - i * 0.13};${0.5 - i * 0.08};${1 - i * 0.13}`} dur="1.5s" repeatCount="indefinite" /></circle>)}
        </>}
        {modo === "conveccion" && <>
          <rect x="20" y="20" width="180" height="80" fill="#DCEBF5" stroke={CI.ink} />
          {[50, 100, 150].map((x, i) => <circle key={i} cx={x} cy="90" r="6" fill={CI.rojo}><animate attributeName="cy" values="90;25;90" dur="2s" repeatCount="indefinite" begin={`${i * 0.5}s`} /></circle>)}
        </>}
        {modo === "radiacion" && <>
          <circle cx="30" cy="60" r="18" fill={CI.maiz} />
          {[0, 1, 2, 3, 4].map((i) => <line key={i} x1="50" y1={60 - 15 + i * 8} x2="200" y2={60 - 15 + i * 8} stroke={CI.rojo} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.7" />)}
        </>}
      </svg>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>En la radiación no hay ningún medio material entre el foco de calor y lo que se calienta — es la única de las tres formas que funciona incluso en el vacío del espacio.</p>
    </div>
  );
}

// PF5 · Conversor caloría-Joule
function ConversorCaloriaJoule() {
  const [cal, setCal] = useState(100);
  const j = r2ci(cal * 4.184);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 17, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>{cal} cal = <span style={{ color: CI.rojo }}>{j} J</span></div>
      <div style={{ height: 24, background: `linear-gradient(90deg, ${CI.maiz} 0%, ${CI.rojo} 100%)`, borderRadius: 12, marginBottom: 10, border: `1.5px solid ${CI.ink}` }} />
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Calorías: <b style={{ color: CI.ink }}>{cal}</b>
        <input type="range" min={0} max={500} value={cal} onChange={(e) => setCal(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Una caloría alimentaria (la de las etiquetas nutricionales) en realidad equivale a 1000 calorías químicas — otra fuente común de confusión con las unidades de energía.</p>
    </div>
  );
}

// PF6 · Gas ideal: PV = nRT (relación presión-volumen)
function GasIdeal() {
  const [v, setV] = useState(10);
  const nRT = 500;
  const p = r2ci(nRT / v);
  const W = 260, H = 150, pad = 20, vmin = 2, vmax = 30, pmax = nRT / vmin;
  const X = (vv) => pad + ((vv - vmin) / (vmax - vmin)) * (W - 2 * pad);
  const Y = (pp) => H - pad - (pp / pmax) * (H - 2 * pad);
  const pts = [];
  for (let vv = vmin; vv <= vmax; vv += 0.5) pts.push(`${X(vv)},${Y(nRT / vv)}`);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>P·V = nRT (constante) → P = <span style={{ color: CI.rojo }}>{p}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        <circle cx={X(v)} cy={Y(p)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.3" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Volumen: <b style={{ color: CI.ink }}>{v}</b>
        <input type="range" min={2} max={30} value={v} onChange={(e) => setV(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Si duplicas el volumen, la presión no baja a la mitad exacta salvo que la temperatura se mantenga constante — por eso la ecuación exige fijar esa condición.</p>
    </div>
  );
}

// PF7 · Entropía: partículas dispersándose (desorden creciente)
function EntropiaVisual() {
  const [t, setT] = useState(0);
  const n = 20;
  return (
    <div>
      <svg viewBox="0 0 220 120" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <rect x="5" y="5" width="210" height="110" fill="none" stroke={CI.linea} strokeWidth="1" />
        {Array.from({ length: n }).map((_, i) => {
          const bx = 20 + (i % 5) * 12, by = 20 + Math.floor(i / 5) * 12;
          const seedX = (i * 53) % 180, seedY = (i * 97) % 90;
          const x = bx + (seedX - bx) * (t / 100), y = by + (seedY - by) * (t / 100);
          return <circle key={i} cx={15 + x * 0.9} cy={15 + y * 0.9} r="4" fill={CI.rojo} opacity="0.75" />;
        })}
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Tiempo transcurrido: <b style={{ color: CI.ink }}>{t}%</b>
        <input type="range" min={0} max={100} value={t} onChange={(e) => setT(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Aunque muevas el tiempo hacia atrás en tu imaginación, las partículas dispersas no regresan solas a su arreglo ordenado inicial — ese camino de regreso no ocurre de forma espontánea.</p>
    </div>
  );
}

// PF8 · Energía y tecnología: eficiencia energética comparada
function EficienciaEnergetica() {
  const TECS = [{ n: "Foco incandescente", ef: 5 }, { n: "Foco LED", ef: 85 }, { n: "Motor de combustión", ef: 30 }, { n: "Motor eléctrico", ef: 90 }];
  return (
    <div>
      {TECS.map((t, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, color: CI.ink, marginBottom: 3 }}>{t.n} — {t.ef}% eficiencia</div>
          <div style={{ height: 16, background: "#eee", borderRadius: 8, border: `1px solid ${CI.ink}`, overflow: "hidden" }}><div style={{ width: `${t.ef}%`, height: "100%", background: t.ef > 60 ? CI.milpa : t.ef > 25 ? CI.maiz : CI.rojo }} /></div>
        </div>
      ))}
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Ningún foco de la lista llega a 100%: incluso el LED más eficiente pierde algo de energía como calor — la eficiencia perfecta no existe en ningún dispositivo real.</p>
    </div>
  );
}

// ---- CNEyT IV (restantes) ----

// PF1 · Clasificador de reacciones químicas
function ClasificadorReacciones() {
  const CASOS = [
    { e: "2H₂ + O₂ → 2H₂O", t: "síntesis" }, { e: "CaCO₃ → CaO + CO₂", t: "descomposición" },
    { e: "Fe + CuSO₄ → FeSO₄ + Cu", t: "desplazamiento" }, { e: "HCl + NaOH → NaCl + H₂O", t: "neutralización" },
  ];
  const [idx, setIdx] = useState(0);
  const [resp, setResp] = useState(null);
  const cur = CASOS[idx];
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 16, fontWeight: 700, marginBottom: 14 }}>{cur.e}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}>
        {["síntesis", "descomposición", "desplazamiento", "neutralización"].map((t) => (
          <button key={t} className="tab" style={{ padding: "7px 10px", fontSize: 12, background: resp === t ? (cur.t === t ? CI.milpaS : "#F6E3DE") : "#fff" }} onClick={() => setResp(t)}>{t}</button>
        ))}
      </div>
      {resp && <div style={{ textAlign: "center", fontWeight: 800, color: resp === cur.t ? CI.milpaD : CI.rojo }}>{resp === cur.t ? "✓ Correcto" : `✗ Es ${cur.t}`}</div>}
      <div style={{ textAlign: "center", marginTop: 10 }}><button className="tab on" onClick={() => { setIdx((i) => (i + 1) % CASOS.length); setResp(null); }}>Siguiente →</button></div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 12, lineHeight: 1.5 }}>La neutralización es, en el fondo, un caso especial de síntesis (ácido+base forman sal+agua) — por eso a veces se confunde con las otras categorías.</p>
    </div>
  );
}

// PF2 · Balanceo interactivo con botones +/-
function BalanceadorEcuaciones() {
  const [coefs, setCoefs] = useState([1, 3, 2, 0]); // Fe + O2 -> Fe2O3, coefs a ajustar
  const [c1, c2, c3] = coefs;
  const feL = c1, oL = c2 * 2, feR = c3 * 2, oR = c3 * 3;
  const balanceado = feL === feR && oL === oR;
  const ajustar = (i, d) => setCoefs((c) => c.map((v, idx) => (idx === i ? Math.max(1, v + d) : v)));
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
        {c1}Fe + {c2}O₂ → {c3}Fe₂O₃
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 12 }}>
        {["Fe", "O₂", "Fe₂O₃"].map((lab, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: CI.muted }}>{lab}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button className="tab" style={{ padding: "3px 8px" }} onClick={() => ajustar(i, -1)}>−</button>
              <span style={{ fontWeight: 800, width: 20, textAlign: "center" }}>{coefs[i]}</span>
              <button className="tab" style={{ padding: "3px 8px" }} onClick={() => ajustar(i, 1)}>+</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", fontWeight: 800, color: balanceado ? CI.milpaD : CI.rojo }}>
        Fe: {feL} = {feR} · O: {oL} {oL === oR ? "=" : "≠"} {oR} {balanceado ? "✓ balanceada" : ""}
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 12, lineHeight: 1.5 }}>Prueba a subir el coeficiente de Fe sin tocar los demás: notarás que el balance se rompe del lado izquierdo — cambiar un coeficiente casi nunca basta, hay que ajustar varios a la vez.</p>
    </div>
  );
}

// PF3 · Equilibrio químico: velocidades directa/inversa
function EquilibrioQuimico() {
  const [t, setT] = useState(50);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>N₂ + 3H₂ ⇌ 2NH₃</div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11.5, color: CI.muted }}>Velocidad directa (→)</div>
        <div style={{ height: 16, background: "#eee", borderRadius: 8, overflow: "hidden", border: `1px solid ${CI.ink}` }}><div style={{ width: `${t}%`, height: "100%", background: CI.milpa }} /></div>
      </div>
      <div>
        <div style={{ fontSize: 11.5, color: CI.muted }}>Velocidad inversa (←)</div>
        <div style={{ height: 16, background: "#eee", borderRadius: 8, overflow: "hidden", border: `1px solid ${CI.ink}` }}><div style={{ width: `${100 - t}%`, height: "100%", background: CI.rojo }} /></div>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 10 }}>Desplazar equilibrio: <b style={{ color: CI.ink }}>{t === 50 ? "en equilibrio" : t > 50 ? "hacia productos" : "hacia reactivos"}</b>
        <input type="range" min={0} max={100} value={t} onChange={(e) => setT(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Si llevas la barra a 100% (todo hacia productos), en la vida real eso significaría una reacción prácticamente irreversible, no un verdadero equilibrio dinámico.</p>
    </div>
  );
}

// PF5 · Redox: transferencia de electrones
function RedoxTransferencia() {
  const [paso, setPaso] = useState(0);
  const PASOS = ["Fe (neutro) + Cu²⁺ (en disolución)", "El hierro cede 2 electrones", "Los electrones viajan al cobre", "Fe²⁺ (oxidado) + Cu (reducido, sólido)"];
  return (
    <div>
      <div style={{ background: CI.papel2, border: `1.5px solid ${CI.ink}`, borderRadius: 10, padding: 16, textAlign: "center", minHeight: 60 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: CI.milpaD }}>{PASOS[paso]}</div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
        <button className="tab" disabled={paso === 0} onClick={() => setPaso((p) => Math.max(0, p - 1))}>← Anterior</button>
        <button className="tab on" disabled={paso === PASOS.length - 1} onClick={() => setPaso((p) => Math.min(PASOS.length - 1, p + 1))}>Siguiente →</button>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>En el paso 2, el hierro pierde electrones ANTES de que el cobre los reciba — no ocurren al mismo tiempo en el mismo lugar, viajan de un átomo a otro.</p>
    </div>
  );
}

// PF6 · Compuestos orgánicos: enlaces del carbono
function EnlacesCarbono() {
  const [tipo, setTipo] = useState("simple");
  const TIPOS = { simple: { n: "enlace simple (alcano)", d: 1 }, doble: { n: "enlace doble (alqueno)", d: 2 }, triple: { n: "enlace triple (alquino)", d: 3 } };
  const cur = TIPOS[tipo];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {Object.keys(TIPOS).map((k) => <button key={k} className={`tab ${tipo === k ? "on" : ""}`} onClick={() => setTipo(k)}>{TIPOS[k].n}</button>)}
      </div>
      <svg viewBox="0 0 200 100" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <circle cx="70" cy="50" r="20" fill={CI.milpaS} stroke={CI.ink} strokeWidth="1.5" /><text x="70" y="55" fontSize="13" textAnchor="middle" fontWeight="700">C</text>
        <circle cx="140" cy="50" r="20" fill={CI.milpaS} stroke={CI.ink} strokeWidth="1.5" /><text x="140" y="55" fontSize="13" textAnchor="middle" fontWeight="700">C</text>
        {Array.from({ length: cur.d }).map((_, i) => <line key={i} x1="90" y1={50 - (cur.d - 1) * 4 + i * 8} x2="120" y2={50 - (cur.d - 1) * 4 + i * 8} stroke={CI.ink} strokeWidth="2.5" />)}
      </svg>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Con un triple enlace, el carbono ya solo puede formar un enlace más con otro átomo (en vez de tres) — más enlaces entre los mismos dos carbonos significa menos espacio para conectarse con otros.</p>
    </div>
  );
}

// PF7 · Clasificador de biomoléculas
function ClasificadorBiomoleculas() {
  const CASOS = [{ n: "Glucosa", t: "carbohidrato" }, { n: "Fosfolípido de membrana", t: "lípido" }, { n: "Hemoglobina", t: "proteína" }, { n: "ADN", t: "ácido nucleico" }];
  const [idx, setIdx] = useState(0);
  const [resp, setResp] = useState(null);
  const cur = CASOS[idx];
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 17, fontWeight: 700, marginBottom: 14 }}>{cur.n}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}>
        {["carbohidrato", "lípido", "proteína", "ácido nucleico"].map((t) => (
          <button key={t} className="tab" style={{ padding: "7px 10px", fontSize: 12, background: resp === t ? (cur.t === t ? CI.milpaS : "#F6E3DE") : "#fff" }} onClick={() => setResp(t)}>{t}</button>
        ))}
      </div>
      {resp && <div style={{ textAlign: "center", fontWeight: 800, color: resp === cur.t ? CI.milpaD : CI.rojo }}>{resp === cur.t ? "✓ Correcto" : `✗ Es ${cur.t}`}</div>}
      <div style={{ textAlign: "center", marginTop: 10 }}><button className="tab on" onClick={() => { setIdx((i) => (i + 1) % CASOS.length); setResp(null); }}>Siguiente →</button></div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 12, lineHeight: 1.5 }}>El ADN y el ARN son ambos ácidos nucleicos, pero uno guarda la información permanente y el otro la transporta — no toda molécula de la misma categoría cumple la misma función.</p>
    </div>
  );
}

// PF8 · Respiración aerobia vs anaerobia: energía producida
function RespiracionComparada() {
  const [tipo, setTipo] = useState("aerobia");
  const atp = tipo === "aerobia" ? 36 : 2;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <button className={`tab ${tipo === "aerobia" ? "on" : ""}`} onClick={() => setTipo("aerobia")}>Aerobia (con O₂)</button>
        <button className={`tab ${tipo === "anaerobia" ? "on" : ""}`} onClick={() => setTipo("anaerobia")}>Anaerobia (fermentación)</button>
      </div>
      <div style={{ textAlign: "center", fontSize: 15 }}>Energía neta: <b style={{ color: CI.rojo, fontSize: 20 }}>{atp} ATP</b> por glucosa</div>
      <div style={{ display: "flex", gap: 2, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {Array.from({ length: atp }).map((_, i) => <div key={i} style={{ width: 8, height: 8, background: CI.maiz, border: `1px solid ${CI.surco}`, borderRadius: 2 }} />)}
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 12, lineHeight: 1.5 }}>18 veces más ATP separa a la respiración aerobia de la fermentación — por eso un músculo sin suficiente oxígeno se fatiga mucho más rápido que uno bien oxigenado.</p>
    </div>
  );
}

// ---- CNEyT V (restantes) ----

// PF2 · Acción y reacción: pares de fuerzas
function AccionReaccion() {
  const [caso, setCaso] = useState(0);
  const CASOS = [{ n: "Nadar", a: "Empujas el agua hacia atrás", r: "El agua te empuja hacia adelante" }, { n: "Caminar", a: "Empujas el suelo hacia atrás", r: "El suelo te empuja hacia adelante" }, { n: "Cohete", a: "Expulsa gases hacia abajo", r: "Los gases empujan el cohete hacia arriba" }];
  const c = CASOS[caso];
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        {CASOS.map((cc, i) => <button key={i} className={`tab ${caso === i ? "on" : ""}`} onClick={() => setCaso(i)}>{cc.n}</button>)}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1, background: "#F6E3DE", border: `1.5px solid ${CI.rojo}`, borderRadius: 8, padding: 10, fontSize: 12.5 }}><b style={{ color: CI.rojo }}>Acción:</b> {c.a}</div>
        <div style={{ flex: 1, background: CI.milpaS, border: `1.5px solid ${CI.milpaD}`, borderRadius: 8, padding: 10, fontSize: 12.5 }}><b style={{ color: CI.milpaD }}>Reacción:</b> {c.r}</div>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 12, lineHeight: 1.5 }}>En los tres casos, la reacción siempre actúa sobre un cuerpo DISTINTO al que generó la acción — nunca sobre el mismo objeto, por eso el movimiento sí es posible.</p>
    </div>
  );
}

// PF3 · Gravitación: fuerza vs distancia
function GravitacionDistancia() {
  const [d, setD] = useState(4);
  const F = r2ci(100 / (d * d));
  const W = 260, H = 150, pad = 20, dmin = 1, dmax = 10;
  const X = (dd) => pad + ((dd - dmin) / (dmax - dmin)) * (W - 2 * pad);
  const Y = (f) => H - pad - (f / 100) * (H - 2 * pad);
  const pts = [];
  for (let dd = dmin; dd <= dmax; dd += 0.2) pts.push(`${X(dd)},${Y(Math.min(100, 100 / (dd * dd)))}`);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 8 }}>F = G·m₁m₂/d² → a d={d}: F=<span style={{ color: CI.rojo }}>{F}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <polyline points={pts.join(" ")} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
        <circle cx={X(d)} cy={Y(Math.min(100, F))} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.3" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Distancia entre cuerpos: <b style={{ color: CI.ink }}>{d}</b>
        <input type="range" min={1} max={10} step={0.5} value={d} onChange={(e) => setD(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>A distancia = 1 (mínima), la fuerza alcanza su valor más alto de toda la gráfica — la gravedad nunca es más intensa que cuando los cuerpos están muy cerca.</p>
    </div>
  );
}

// PF5 · Óptica: reflexión y refracción de un rayo
function OpticaRayo() {
  const [medio, setMedio] = useState("reflexion");
  const [ang, setAng] = useState(40);
  const W = 220, H = 140, cx = 110, cy = 70;
  const rad = (ang * Math.PI) / 180;
  const salida = medio === "reflexion" ? ang : r2ci(Math.asin(Math.sin(rad) * 0.75) * (180 / Math.PI));
  const x1 = cx - 60 * Math.sin(rad), y1 = cy - 60 * Math.cos(rad);
  const radS = (salida * Math.PI) / 180;
  const x2 = medio === "reflexion" ? cx + 60 * Math.sin(rad) : cx + 60 * Math.sin(radS);
  const y2 = medio === "reflexion" ? cy - 60 * Math.cos(rad) : cy + 60 * Math.cos(radS);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}>
        <button className={`tab ${medio === "reflexion" ? "on" : ""}`} onClick={() => setMedio("reflexion")}>Reflexión</button>
        <button className={`tab ${medio === "refraccion" ? "on" : ""}`} onClick={() => setMedio("refraccion")}>Refracción</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <line x1="10" y1={cy} x2="210" y2={cy} stroke={medio === "reflexion" ? "#999" : "#74AFDC"} strokeWidth="3" />
        {medio === "refraccion" && <rect x="10" y={cy} width="200" height="60" fill="#DCEBF5" opacity="0.5" />}
        <line x1={cx} y1={cy - 40} x2={cx} y2={cy + 40} stroke={CI.linea} strokeWidth="1" strokeDasharray="3 2" />
        <line x1={x1} y1={y1} x2={cx} y2={cy} stroke={CI.rojo} strokeWidth="2.2" />
        <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={CI.azul} strokeWidth="2.2" />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Ángulo de incidencia: <b style={{ color: CI.ink }}>{ang}°</b>
        <input type="range" min={5} max={80} value={ang} onChange={(e) => setAng(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>A 0° de incidencia (rayo perpendicular a la superficie), no hay ninguna desviación en la refracción — el rayo sigue derecho aunque cambie de medio.</p>
    </div>
  );
}

// PF6 · Fluidos: principio de Arquímedes
function ArquimedesFlota() {
  const [densObj, setDensObj] = useState(0.6);
  const flota = densObj < 1;
  const sumergido = Math.min(100, densObj * 100);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>densidad objeto: {densObj} g/cm³ (agua = 1) → {flota ? "flota" : "se hunde"}</div>
      <svg viewBox="0 0 200 130" style={{ width: "100%", background: "#DCEBF5", borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <rect x="0" y="40" width="200" height="90" fill="#B7D8EC" />
        <rect x={80} y={flota ? 40 - (100 - sumergido) * 0.15 + (100 - sumergido) * 0.15 : 90} width="40" height="40" fill={CI.maiz} stroke={CI.surco} strokeWidth="1.5" transform={flota ? `translate(0, ${(sumergido / 100) * 20 - 20})` : ""} />
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Densidad del objeto (g/cm³): <b style={{ color: CI.ink }}>{densObj}</b>
        <input type="range" min={0.2} max={1.8} step={0.1} value={densObj} onChange={(e) => setDensObj(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>En densidad = 1.0 exacta (igual a la del agua), el objeto ni flota ni se hunde del todo: queda suspendido en equilibrio neutro dentro del líquido.</p>
      <PanelSimulador titulo="🎮 Simulador: empuje del agua (Arquímedes)" nota="Suelta objetos y empújalos bajo el agua arrastrándolos: el agua los empuja hacia arriba con una fuerza igual al peso del líquido que desplazan. Suéltalos y saltan a la superficie.">
        <LienzoFisica alto={210} fondo="#B7D8EC"
          setup={(api) => {
            const { Matter, world, H } = api; const { Bodies, World, Events, Body, Composite } = Matter;
            const nivelAgua = H * 0.3;
            Events.on(api.engine, "beforeUpdate", () => {
              for (const b of Composite.allBodies(world)) {
                if (!b.plugin || !b.plugin.flotante) continue;
                if (b.position.y > nivelAgua) {
                  const prof = Math.min(1, (b.position.y - nivelAgua) / 70);
                  Body.applyForce(b, b.position, { x: 0, y: -0.0015 * prof });
                  Body.setVelocity(b, { x: b.velocity.x * 0.95, y: b.velocity.y * 0.88 });
                }
              }
            });
          }}
          onTap={(api, x, y) => { const { Matter, world } = api; const { Bodies, World } = Matter; const b = Bodies.rectangle(x, Math.min(y, 30), 34, 34, { restitution: 0.2, frictionAir: 0.02, render: { fillStyle: CI.maiz, strokeStyle: CI.surco, lineWidth: 2 } }); b.plugin = { flotante: true }; World.add(world, b); }}
        />
      </PanelSimulador>
    </div>
  );
}

// PF8 · Física moderna: relatividad del tiempo (divulgativo)
function RelatividadDivulgativa() {
  const [vel, setVel] = useState(50);
  const factor = r2ci(1 / Math.sqrt(1 - Math.pow(vel / 100, 2) * 0.99));
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: CI.milpaD, marginBottom: 10 }}>a {vel}% de la velocidad de la luz, el tiempo se dilata ×<span style={{ color: CI.rojo }}>{factor}</span></div>
      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 10 }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 26 }}>🧑</div><div style={{ fontSize: 11 }}>en reposo: 1 hora</div></div>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 26 }}>🚀</div><div style={{ fontSize: 11 }}>viajando: {factor} horas</div></div>
      </div>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted }}>Velocidad (% de la luz): <b style={{ color: CI.ink }}>{vel}%</b>
        <input type="range" min={0} max={99} value={vel} onChange={(e) => setVel(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>Hasta 10% de la velocidad de la luz, el factor de dilatación es prácticamente 1.00 — el efecto relativista solo se vuelve notorio arriba del 50-60%, muy lejos de cualquier velocidad cotidiana.</p>
    </div>
  );
}

// ---- CNEyT VI (restantes) ----

// PF1 · Experimento de Miller-Urey (pasos)
function MillerUreyExperimento() {
  const [paso, setPaso] = useState(0);
  const PASOS = ["Gases: metano, amoniaco, hidrógeno, vapor de agua", "Se aplican descargas eléctricas (simulan rayos)", "Las moléculas se recombinan", "Se forman aminoácidos: los componentes de las proteínas"];
  return (
    <div>
      <div style={{ background: CI.papel2, border: `1.5px solid ${CI.ink}`, borderRadius: 10, padding: 16, textAlign: "center", minHeight: 60 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: CI.milpaD }}>{PASOS[paso]}</div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
        <button className="tab" disabled={paso === 0} onClick={() => setPaso((p) => Math.max(0, p - 1))}>← Anterior</button>
        <button className="tab on" disabled={paso === PASOS.length - 1} onClick={() => setPaso((p) => Math.min(PASOS.length - 1, p + 1))}>Siguiente →</button>
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Ningún paso del experimento involucra un ser vivo previo — esa es la parte clave que responde a la pregunta del origen de la vida: materia inerte, sin vida de partida, formando los ladrillos básicos de la vida.</p>
    </div>
  );
}

// PF2 · Zoom de la célula: de Hooke al microscopio moderno
function ZoomCelula() {
  const [zoom, setZoom] = useState(1);
  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 13.5, color: CI.muted, marginBottom: 8 }}>aumento: {zoom}x</div>
      <svg viewBox="0 0 200 150" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        <rect x="10" y="10" width="180" height="130" fill="#fff" stroke={CI.linea} />
        {zoom < 3 ? (
          Array.from({ length: 12 }).map((_, i) => <rect key={i} x={20 + (i % 4) * 42} y={20 + Math.floor(i / 4) * 40} width="36" height="34" fill="none" stroke={CI.milpaD} strokeWidth="1" />)
        ) : (
          <><rect x="40" y="30" width="120" height="90" rx="20" fill={CI.milpaS} stroke={CI.milpaD} strokeWidth="1.5" /><circle cx="100" cy="75" r="20" fill={CI.rojo} opacity="0.3" stroke={CI.rojo} strokeWidth="1.3" /><text x="100" y="79" fontSize="9" textAnchor="middle">núcleo</text></>
        )}
      </svg>
      <label style={{ display: "block", fontSize: 12.5, color: CI.muted, marginTop: 8 }}>Nivel de zoom: <b style={{ color: CI.ink }}>{zoom}x</b>
        <input type="range" min={1} max={5} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>A partir de zoom 3, ya no ves las celdas vacías de Hooke sino organelos internos (núcleo) — con corcho muerto eso no sería visible: Hooke solo vio las paredes vacías, no el contenido de una célula viva.</p>
    </div>
  );
}

// PF3 · Procariota vs eucariota comparadas
function ProcariotaEucariota() {
  const [sel, setSel] = useState("proc");
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <button className={`tab ${sel === "proc" ? "on" : ""}`} onClick={() => setSel("proc")}>Procariota</button>
        <button className={`tab ${sel === "euc" ? "on" : ""}`} onClick={() => setSel("euc")}>Eucariota</button>
      </div>
      <svg viewBox="0 0 200 130" style={{ width: "100%", background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        {sel === "proc" ? (
          <><ellipse cx="100" cy="65" rx="80" ry="45" fill={CI.milpaS} stroke={CI.milpaD} strokeWidth="1.5" /><ellipse cx="100" cy="65" rx="30" ry="15" fill="none" stroke={CI.rojo} strokeWidth="1.3" strokeDasharray="3 2" /><text x="100" y="69" fontSize="9" textAnchor="middle">ADN libre</text></>
        ) : (
          <><ellipse cx="100" cy="65" rx="80" ry="45" fill={CI.milpaS} stroke={CI.milpaD} strokeWidth="1.5" /><circle cx="100" cy="65" r="25" fill={CI.rojo} opacity="0.3" stroke={CI.rojo} strokeWidth="1.3" /><text x="100" y="69" fontSize="9" textAnchor="middle">núcleo</text><ellipse cx="145" cy="45" rx="10" ry="6" fill={CI.azul} opacity="0.4" /></>
        )}
      </svg>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>El tamaño de ambas células en el dibujo es similar, pero en la realidad las procariotas suelen ser 10 veces más pequeñas que las eucariotas — la ilustración no está a escala real.</p>
    </div>
  );
}

// PF4 · Reutiliza CuadroPunnett de ADN, aquí complementaria: emparejamiento de bases
function EmparejamientoBases() {
  const bases = { A: "T", T: "A", G: "C", C: "G" };
  const colores = { A: CI.rojo, T: CI.azul, G: CI.milpa, C: CI.maiz };
  const [sec, setSec] = useState(["A", "T", "G", "C", "A"]);
  const cambiar = (i) => setSec((s) => s.map((b, idx) => idx === i ? ["A", "T", "G", "C"][(["A", "T", "G", "C"].indexOf(b) + 1) % 4] : b));
  return (
    <div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 6 }}>
        {sec.map((b, i) => <div key={i} onClick={() => cambiar(i)} style={{ width: 34, height: 34, background: colores[b], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, borderRadius: 6, cursor: "pointer" }}>{b}</div>)}
      </div>
      <div style={{ textAlign: "center", fontSize: 11, color: CI.muted, marginBottom: 6 }}>↓ toca una base para cambiarla ↓</div>
      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
        {sec.map((b, i) => <div key={i} style={{ width: 34, height: 34, background: colores[bases[b]], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, borderRadius: 6, opacity: 0.75 }}>{bases[b]}</div>)}
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 12, lineHeight: 1.5 }}>Cambia una base varias veces seguidas: notarás que su complementaria siempre cambia en el mismo instante — nunca hay un desfase entre una hebra y la otra al copiarse.</p>
    </div>
  );
}

// PF5 · Mitosis vs meiosis: número de células resultantes
function MitosisMeiosis() {
  const [tipo, setTipo] = useState("mitosis");
  const cromosomasOriginal = 4;
  const celulas = tipo === "mitosis" ? [[cromosomasOriginal], [cromosomasOriginal]] : [[cromosomasOriginal / 2], [cromosomasOriginal / 2], [cromosomasOriginal / 2], [cromosomasOriginal / 2]];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <button className={`tab ${tipo === "mitosis" ? "on" : ""}`} onClick={() => setTipo("mitosis")}>Mitosis</button>
        <button className={`tab ${tipo === "meiosis" ? "on" : ""}`} onClick={() => setTipo("meiosis")}>Meiosis</button>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        {celulas.map((c, i) => (
          <div key={i} style={{ width: 50, height: 50, borderRadius: "50%", background: CI.milpaS, border: `1.5px solid ${CI.ink}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{c[0]} crom.</div>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 12, lineHeight: 1.5 }}>En la meiosis, cada una de las 4 células termina con la mitad de cromosomas de la original — por eso al unirse óvulo y espermatozoide (cada uno ya con la mitad) el hijo recupera el número completo.</p>
    </div>
  );
}

// PF7 · Selección natural: polillas claras/oscuras
function SeleccionNatural() {
  const [contaminado, setContaminado] = useState(false);
  const n = 20;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 12 }}>
        <button className={`tab ${!contaminado ? "on" : ""}`} onClick={() => setContaminado(false)}>Árboles claros</button>
        <button className={`tab ${contaminado ? "on" : ""}`} onClick={() => setContaminado(true)}>Árboles oscuros (contaminación)</button>
      </div>
      <svg viewBox="0 0 220 100" style={{ width: "100%", background: contaminado ? "#5C4A3D" : "#D9C7A0", borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
        {Array.from({ length: n }).map((_, i) => {
          const oscura = i % 2 === 0;
          const visible = contaminado ? !oscura : oscura;
          return <circle key={i} cx={15 + (i * 10) % 200} cy={20 + Math.floor(i / 10) * 50} r="6" fill={oscura ? "#3A2E22" : "#E8DCC0"} opacity={visible ? 1 : 0.25} />;
        })}
      </svg>
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Ninguna polilla cambia de color durante su vida: la selección actúa sobre cuáles sobreviven y se reproducen más, no sobre transformar a los individuos ya existentes.</p>
    </div>
  );
}

// PF8 · Características de los seres vivos: checklist interactivo
function CaracteristicasVida() {
  const CARAC = ["Organización celular", "Metabolismo", "Homeostasis", "Crecimiento y desarrollo", "Respuesta a estímulos", "Reproducción", "Evolución por selección natural"];
  const [marcadas, setMarcadas] = useState([]);
  const toggle = (c) => setMarcadas((m) => m.includes(c) ? m.filter((x) => x !== c) : [...m, c]);
  return (
    <div>
      {CARAC.map((c) => (
        <div key={c} onClick={() => toggle(c)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginBottom: 4, background: marcadas.includes(c) ? CI.milpaS : "#fff", border: `1.3px solid ${CI.ink}`, borderRadius: 8, cursor: "pointer" }}>
          <span style={{ fontSize: 16 }}>{marcadas.includes(c) ? "✅" : "⬜"}</span><span style={{ fontSize: 13 }}>{c}</span>
        </div>
      ))}
      <p style={{ fontSize: 12.5, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>Un virus cumple varias de estas casillas (tiene información genética, evoluciona) pero no todas (no tiene metabolismo propio) — por eso su estatus como "ser vivo" sigue en debate científico.</p>
    </div>
  );
}

// ============================================================================
// CASOCARD — tarjeta de caso real con 3 capas: comprensión, entendimiento
// (interactivo en vivo) y oportunidad de probar (auto-verificación).
// Compatible con los casos "clásicos" (solo texto+pasos+moraleja) y con los
// nuevos (planteamiento + interactivo + autoverifica).
// ============================================================================
function CasoCard({ c }) {
  const [revelado, setRevelado] = useState(!c.planteamiento); // los casos viejos se muestran directo
  const [respAuto, setRespAuto] = useState(null);
  const Comp = c.interactivo ? INTERACTIVOS[c.interactivo] : null;
  return (
    <div className="card" style={{ borderLeft: "4px solid #B08650" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#B08650" }}>{c.materia}</p>
      <p style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: CI.milpaD }}>{c.titulo}</p>
      <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.55 }}>{c.planteamiento || c.texto}</p>

      {!revelado && (
        <button className="btn btn-g btn-block" onClick={() => setRevelado(true)} style={{ marginBottom: 10 }}>
          🤔 Ya lo pensé — ver cómo se resuelve →
        </button>
      )}

      {revelado && (
        <>
          {Comp && (
            <div style={{ background: CI.papel2, border: "1.5px solid #2E2A21", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.azul, textTransform: "uppercase" }}>Prueba tú mismo — muévelo</p>
              <Comp />
            </div>
          )}
          {c.texto && c.planteamiento && <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.55, color: CI.ink }}>{c.texto}</p>}
          {c.pasos.map((p, j) => (
            <p key={j} style={{ margin: "0 0 4px", fontSize: 13, color: CI.ink }}>
              <b style={{ color: CI.muted }}>Paso {j + 1}: </b>{p}
            </p>
          ))}
          <div style={{ background: CI.milpaS, borderRadius: 8, padding: "9px 12px", marginTop: 10, fontSize: 13, color: CI.milpaD }}>
            <b>💡 La moraleja: </b>{c.moraleja}
          </div>

          {c.autoverifica && (
            <div style={{ marginTop: 12, background: "#FFF3E0", border: "1.5px solid #B08650", borderRadius: 10, padding: 12 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: CI.ink }}>🎯 Ponte a prueba: {c.autoverifica.pregunta}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {c.autoverifica.opciones.map((op, i) => (
                  <button key={i} className="tab" style={{ padding: "7px 11px", fontSize: 12.5, background: respAuto === i ? (i === c.autoverifica.correcta ? CI.milpaS : "#F6E3DE") : "#fff" }} onClick={() => setRespAuto(i)}>{op}</button>
                ))}
              </div>
              {respAuto !== null && (
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12.5, fontWeight: 800, color: respAuto === c.autoverifica.correcta ? CI.milpa : CI.rojo }}>
                  {respAuto === c.autoverifica.correcta ? "✓ Correcto — ya lo dominas." : `✗ La respuesta correcta es: ${c.autoverifica.opciones[c.autoverifica.correcta]}`}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------- HERRAMIENTAS: calculadora y graficador
// ============================================================================
// HERRAMIENTAS — Calculadora científica contextual + Graficador de funciones
// Construidas sobre el núcleo de cálculo (parser propio, sin dependencias).
// ============================================================================

// ---- Atajos contextuales por materia: qué destacar según lo que se esté estudiando ----
const ATAJOS_CALC = {
  pm1: [{ l: "%", ins: "*0.01" }, { l: "xʸ", ins: "^" }, { l: "√", ins: "sqrt()" }],
  pm2: [{ l: "x", ins: "x" }, { l: "( )", ins: "()" }, { l: "xʸ", ins: "^" }],
  pm3: [{ l: "x", ins: "x" }, { l: "√", ins: "sqrt()" }, { l: "xʸ", ins: "^" }],
  pm4: [{ l: "sin", ins: "sin()" }, { l: "cos", ins: "cos()" }, { l: "tan", ins: "tan()" }, { l: "π", ins: "pi" }],
  pm5: [{ l: "sin", ins: "sin()" }, { l: "ln", ins: "ln()" }, { l: "e", ins: "e" }, { l: "xʸ", ins: "^" }],
  pm6: [{ l: "√", ins: "sqrt()" }, { l: "( )", ins: "()" }],
  cneyt1: [{ l: "√", ins: "sqrt()" }, { l: "xʸ", ins: "^" }],
  cneyt2: [{ l: "xʸ", ins: "^" }, { l: "( )", ins: "()" }],
  cneyt3: [{ l: "( )", ins: "()" }, { l: "%", ins: "*0.01" }],
  cneyt4: [{ l: "log", ins: "log()" }, { l: "xʸ", ins: "^" }],
  cneyt5: [{ l: "sin", ins: "sin()" }, { l: "cos", ins: "cos()" }, { l: "√", ins: "sqrt()" }, { l: "π", ins: "pi" }],
  cneyt6: [{ l: "%", ins: "*0.01" }, { l: "( )", ins: "()" }],
};

const FORMULAS_RAPIDAS = {
  pm1: [{ n: "% de un número", f: "50*24*0.01" }],
  pm2: [{ n: "Evaluar en x=3", f: "2*x+1", x: 3 }],
  pm3: [{ n: "Fórmula general", f: "(-4+sqrt(4^2-4*1*3))/(2*1)" }],
  pm4: [{ n: "sen(30°) en radianes", f: "sin(pi/6)" }],
  pm5: [{ n: "Derivada en un punto", derivada: true, f: "x^2", x: 3 }],
  pm6: [{ n: "Combinaciones (aprox.)", f: "sqrt(2*pi*5)*(5/e)^5" }],
  cneyt1: [{ n: "Densidad = m/V", f: "50/20" }],
  cneyt2: [{ n: "Energía cinética ½mv²", f: "0.5*2*4^2" }],
  cneyt3: [{ n: "Conversión simple", f: "273+25" }],
  cneyt4: [{ n: "pH: -log[H+]", f: "-log(0.0001)" }],
  cneyt5: [{ n: "Ley de Ohm V=IR", f: "2*5" }],
  cneyt6: [{ n: "Proporción 3:1", f: "3/4*100" }],
};

// Fase 10: Glosario de símbolos matemáticos y físico-químicos, filtrado por
// materia activa (mismo patrón que ATAJOS_CALC/FORMULAS_RAPIDAS de arriba,
// pero de REFERENCIA/definición, no de cálculo). Cada entrada: símbolo, nombre,
// significado en una línea, y un mini-ejemplo cuando ayuda.
const GLOSARIO = {
  pm1: [
    { s: "∧", n: "Conjunción (\"y\")", sig: "Verdadero solo si AMBAS proposiciones son verdaderas.", ej: "p∧q" },
    { s: "∨", n: "Disyunción (\"o\")", sig: "Verdadero si AL MENOS UNA proposición es verdadera.", ej: "p∨q" },
    { s: "→", n: "Condicional", sig: "\"Si... entonces...\" — enlaza una condición con su consecuencia.", ej: "p→q" },
    { s: "∈", n: "Pertenece", sig: "Indica que un elemento está dentro de un conjunto.", ej: "3∈ℤ" },
    { s: "ℤ, ℚ, ℝ", n: "Enteros, racionales, reales", sig: "Conjuntos numéricos: cada uno contiene al anterior.", ej: "ℤ⊂ℚ⊂ℝ" },
    { s: "xⁿ", n: "Potencia", sig: "Multiplicar x por sí mismo n veces.", ej: "2³ = 8" },
    { s: "ⁿ√x", n: "Raíz enésima", sig: "La operación inversa de elevar a la potencia n.", ej: "³√27 = 3" },
    { s: "×10ⁿ", n: "Notación científica", sig: "Escala números muy grandes o muy pequeños con una potencia de 10.", ej: "3×10⁴ = 30,000" },
  ],
  pm2: [
    { s: "x, y", n: "Variables", sig: "Letras que representan un valor desconocido o que puede cambiar.", ej: "2x+1" },
    { s: "( )", n: "Agrupación", sig: "Lo de adentro se resuelve primero — cambia el orden normal de operaciones.", ej: "(x+2)²" },
    { s: "xⁿ", n: "Exponente", sig: "Indica cuántas veces se multiplica la base por sí misma.", ej: "x²" },
    { s: "=", n: "Igualdad", sig: "Ambos lados representan exactamente el mismo valor.", ej: "3x = 12" },
    { s: "(a+b)²", n: "Binomio al cuadrado", sig: "Un producto notable: a²+2ab+b².", ej: "(x+3)² = x²+6x+9" },
  ],
  pm3: [
    { s: "m", n: "Pendiente", sig: "Qué tan inclinada está una recta — cuánto sube por cada unidad que avanza.", ej: "y = mx+b" },
    { s: "b", n: "Ordenada al origen", sig: "El punto donde la recta cruza el eje y (cuando x=0).", ej: "y = 2x+5 → b=5" },
    { s: "Δ", n: "Delta (cambio)", sig: "Representa \"cuánto cambió\" una cantidad.", ej: "Δy/Δx" },
    { s: "{", n: "Sistema de ecuaciones", sig: "Agrupa ecuaciones que se cumplen AL MISMO TIEMPO.", ej: "{x+y=5, x−y=1}" },
    { s: "a, b, c", n: "Coeficientes cuadráticos", sig: "Los números que acompañan a x², x y el término libre.", ej: "ax²+bx+c" },
  ],
  pm4: [
    { s: "θ", n: "Theta (ángulo)", sig: "Letra griega usada para nombrar un ángulo.", ej: "sen θ" },
    { s: "sen, cos, tan", n: "Razones trigonométricas", sig: "Relacionan los ángulos de un triángulo rectángulo con sus lados.", ej: "sen(30°) = 0.5" },
    { s: "π", n: "Pi", sig: "La razón entre la circunferencia de un círculo y su diámetro (≈3.1416).", ej: "circunferencia = 2πr" },
    { s: "r", n: "Radio", sig: "Distancia del centro de un círculo a su borde.", ej: "x²+y²=r²" },
  ],
  pm5: [
    { s: "lim", n: "Límite", sig: "El valor al que se ACERCA una función, sin necesariamente llegar a él.", ej: "lim(x→0)" },
    { s: "dy/dx", n: "Derivada", sig: "Qué tan rápido cambia y respecto a x en un instante — la pendiente de la tangente.", ej: "d/dx(x²) = 2x" },
    { s: "∫", n: "Integral", sig: "Suma continua de infinitos pedacitos — el área bajo una curva.", ej: "∫x dx" },
    { s: "∞", n: "Infinito", sig: "Un valor que crece (o decrece) sin límite.", ej: "lim(x→∞)" },
    { s: "e", n: "Número de Euler", sig: "Constante (≈2.718), base de los logaritmos naturales.", ej: "eˣ" },
  ],
  pm6: [
    { s: "Σ", n: "Sumatoria", sig: "Suma todos los términos de una lista o secuencia.", ej: "Σxᵢ = x₁+x₂+x₃" },
    { s: "n!", n: "Factorial", sig: "Multiplica n por todos los enteros positivos menores que él.", ej: "4! = 4×3×2×1 = 24" },
    { s: "P(A)", n: "Probabilidad", sig: "Qué tan probable es que ocurra el evento A (entre 0 y 1).", ej: "P(águila) = 0.5" },
    { s: "μ, σ", n: "Media y desviación estándar", sig: "El promedio de los datos, y qué tanto se dispersan alrededor de él.", ej: "μ=10, σ=2" },
    { s: "∪, ∩", n: "Unión e intersección", sig: "Todos los elementos de ambos conjuntos, o solo los que comparten.", ej: "A∪B, A∩B" },
  ],
  cneyt1: [
    { s: "ρ", n: "Densidad", sig: "Cuánta masa hay en cierto volumen: ρ = m/V.", ej: "ρ = 50g/20cm³" },
    { s: "m", n: "Masa", sig: "Cantidad de materia de un cuerpo (no es lo mismo que peso).", ej: "m en kg o g" },
    { s: "V", n: "Volumen", sig: "El espacio que ocupa un cuerpo.", ej: "V en cm³ o L" },
    { s: "(s), (l), (g)", n: "Estados de agregación", sig: "Indican si una sustancia es sólida, líquida o gaseosa.", ej: "H₂O (l)" },
  ],
  cneyt2: [
    { s: "Ec", n: "Energía cinética", sig: "La energía de un cuerpo por estar en movimiento: Ec = ½mv².", ej: "Ec = 0.5×2×4²" },
    { s: "Q", n: "Calor", sig: "Energía que se transfiere entre cuerpos por diferencia de temperatura.", ej: "Q en Joules" },
    { s: "ΔH", n: "Entalpía", sig: "El calor absorbido o liberado en una reacción o proceso.", ej: "ΔH < 0 (exotérmico)" },
    { s: "T", n: "Temperatura", sig: "Qué tan caliente o frío está algo, en escala numérica.", ej: "T en °C o K" },
  ],
  cneyt3: [
    { s: "CO₂", n: "Dióxido de carbono", sig: "Gas producido en la respiración y consumido en la fotosíntesis.", ej: "6CO₂ + 6H₂O → ..." },
    { s: "O₂", n: "Oxígeno", sig: "Gas esencial para la respiración de la mayoría de los seres vivos.", ej: "" },
    { s: "°C", n: "Grados Celsius", sig: "Escala de temperatura usada para medir el clima y procesos terrestres.", ej: "25°C" },
    { s: "→", n: "Flecha de proceso", sig: "Indica transformación: de qué parte a qué llega en un ciclo o reacción.", ej: "luz solar → energía química" },
  ],
  cneyt4: [
    { s: "pH", n: "Potencial de hidrógeno", sig: "Mide qué tan ácida o básica es una sustancia (escala 0-14).", ej: "pH = 7 (neutro)" },
    { s: "[H⁺]", n: "Concentración de iones hidrógeno", sig: "A mayor concentración, más ácida la sustancia.", ej: "pH = -log[H⁺]" },
    { s: "⇌", n: "Equilibrio químico", sig: "La reacción ocurre en ambos sentidos al mismo tiempo.", ej: "A + B ⇌ C" },
    { s: "→", n: "Reacción química", sig: "Los reactivos (izquierda) se transforman en productos (derecha).", ej: "2H₂ + O₂ → 2H₂O" },
  ],
  cneyt5: [
    { s: "F = ma", n: "Segunda ley de Newton", sig: "La fuerza necesaria depende de la masa y la aceleración deseada.", ej: "F = 4kg × 2m/s²" },
    { s: "g", n: "Gravedad", sig: "Aceleración con la que caen los objetos en la Tierra (≈9.8 m/s²).", ej: "caída libre: a=g" },
    { s: "Ω", n: "Ohm", sig: "Unidad de resistencia eléctrica.", ej: "R = 5Ω" },
    { s: "λ", n: "Longitud de onda", sig: "La distancia entre dos crestas sucesivas de una onda.", ej: "v = λ·f" },
  ],
  cneyt6: [
    { s: "ADN, ARN", n: "Ácidos nucleicos", sig: "Moléculas que guardan (ADN) y transportan (ARN) la información genética.", ej: "" },
    { s: "Aa", n: "Alelos (genotipo)", sig: "Mayúscula = dominante, minúscula = recesivo, para un mismo gen.", ej: "Aa = híbrido" },
    { s: "♂ ♀", n: "Símbolos de sexo", sig: "Usados en árboles genealógicos y cruzas genéticas.", ej: "♂ macho, ♀ hembra" },
  ],
};

function CalculadoraCientifica({ matId }) {
  const [expr, setExpr] = useState("");
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState(null);
  const [desglose, setDesglose] = useState(null); // Fase 5: desglose de la operación calculada
  const atajos = ATAJOS_CALC[matId] || [];
  const formulas = FORMULAS_RAPIDAS[matId] || [];

  const insertar = (txt) => setExpr((e) => e + txt);
  const borrarUno = () => setExpr((e) => e.slice(0, -1));
  const limpiar = () => { setExpr(""); setResultado(null); setError(null); setDesglose(null); };
  const calcular = () => {
    try {
      const r = evaluarExpresion(expr);
      setResultado(r2ci(r));
      setError(null);
      setDesglose(null);
    } catch (e) {
      setError(e.message);
      setResultado(null);
      setDesglose(null);
    }
  };
  // ¿La expresión es aritmética pura y vale la pena desglosarla?
  const desglosable = (() => {
    if (!expr.trim() || resultado === null) return false;
    try { const r = resolverJerarquia(expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-")); return r && r.ok && r.pasos.length > 2; }
    catch (e) { return false; }
  })();
  const verDesglose = () => {
    try { const r = resolverJerarquia(expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-")); setDesglose(r && r.ok ? r : null); }
    catch (e) { setDesglose(null); }
  };
  const usarFormula = (f) => {
    if (f.derivada) {
      try { setResultado(r2ci(derivadaNumerica(f.f, f.x))); setExpr(`d/dx[${f.f}] en x=${f.x}`); setError(null); }
      catch (e) { setError(e.message); }
    } else {
      setExpr(f.f);
      try { setResultado(r2ci(evaluarExpresion(f.f))); setError(null); } catch (e) { setError(e.message); }
    }
  };

  const botones = [
    ["7", "8", "9", "÷"], ["4", "5", "6", "×"], ["1", "2", "3", "−"], ["0", ".", "(", ")"], ["+"],
  ];
  const BTN = { padding: "12px 0", fontSize: 16, fontWeight: 700, borderRadius: 10, border: "1.5px solid #2E2A21", background: "#fff", cursor: "pointer" };

  return (
    <div>
      {atajos.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {atajos.map((a, i) => <button key={i} className="tab" style={{ padding: "6px 10px", fontSize: 13 }} onClick={() => insertar(a.ins)}>{a.l}</button>)}
        </div>
      )}
      <div style={{ background: CI.papel2, border: "1.5px solid #2E2A21", borderRadius: 10, padding: 14, marginBottom: 10, minHeight: 60 }}>
        <div style={{ fontSize: 18, fontFamily: "monospace", color: CI.ink, wordBreak: "break-all", minHeight: 24 }}>{expr || <span style={{ color: "#B4A98A" }}>escribe o toca los botones…</span>}</div>
        {resultado !== null && <div style={{ fontSize: 24, fontWeight: 800, color: CI.milpa, marginTop: 6 }}>= {resultado}</div>}
        {error && <div style={{ fontSize: 12.5, color: CI.rojo, marginTop: 6 }}>⚠ {error}</div>}
        {desglosable && !desglose && (
          <button className="tab" style={{ marginTop: 10, padding: "6px 12px", fontSize: 12.5 }} onClick={verDesglose}>🧩 ¿Cómo se resuelve? Ver paso a paso</button>
        )}
      </div>
      {desglose && (
        <div style={{ background: CI.papel2, border: "1.5px solid #2E2A21", borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.azul, textTransform: "uppercase" }}>Resuelto paso a paso</span>
            <button className="tab" style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => setDesglose(null)}>Ocultar</button>
          </div>
          <DesglosePasos resultado={desglose} />
        </div>
      )}
      <input
        type="text" value={expr} onChange={(e) => setExpr(e.target.value)}
        placeholder="también puedes escribir aquí, ej: sin(pi/2)+3^2"
        style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1.5px solid #2E2A21", fontSize: 14, marginBottom: 10, boxSizing: "border-box" }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
        {["sin(", "cos(", "tan(", "π"].map((b, i) => <button key={i} style={BTN} onClick={() => insertar(b === "π" ? "pi" : b)}>{b}</button>)}
        {["log(", "ln(", "√(", "^"].map((b, i) => <button key={i} style={BTN} onClick={() => insertar(b === "√(" ? "sqrt(" : b)}>{b}</button>)}
        {["7", "8", "9", "÷"].map((b, i) => <button key={i} style={BTN} onClick={() => insertar(b === "÷" ? "/" : b)}>{b}</button>)}
        {["4", "5", "6", "×"].map((b, i) => <button key={i} style={BTN} onClick={() => insertar(b === "×" ? "*" : b)}>{b}</button>)}
        {["1", "2", "3", "−"].map((b, i) => <button key={i} style={BTN} onClick={() => insertar(b === "−" ? "-" : b)}>{b}</button>)}
        {["0", ".", "(", ")"].map((b, i) => <button key={i} style={BTN} onClick={() => insertar(b)}>{b}</button>)}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="tab" style={{ flex: 1, padding: "10px 0" }} onClick={borrarUno}>⌫</button>
        <button className="tab" style={{ flex: 1, padding: "10px 0" }} onClick={limpiar}>C</button>
        <button className="tab on" style={{ flex: 2, padding: "10px 0", fontWeight: 800 }} onClick={calcular}>=</button>
      </div>
      {formulas.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.muted, textTransform: "uppercase", margin: "0 0 6px" }}>Fórmulas rápidas de esta materia</p>
          {formulas.map((f, i) => <button key={i} className="tab" style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginBottom: 4 }} onClick={() => usarFormula(f)}>{f.n}</button>)}
        </div>
      )}
    </div>
  );
}

// Presets de funciones por materia: cada uno conecta con un propósito real de esa materia,
// no son genéricos — traen su propia ventana de x apropiada al fenómeno que representan.
const GRAFICOS_PRESET = {
  pm1: [
    { n: "Crecimiento de una potencia", f: "2^x", xmin: -2, xmax: 8, nota: "Ligado a Potencias y raíces (PF5): cómo crece 2ⁿ." },
  ],
  pm2: [
    { n: "Recta: cobro fijo + variable", f: "15+2*x", xmin: -2, xmax: 20, nota: "Ligado a Álgebra en la vida (PF5): tarifa base + costo por unidad." },
    { n: "Parábola simple", f: "x^2", xmin: -6, xmax: 6, nota: "Ligado a Clasificar expresiones (PF2): el monomio x² más simple." },
  ],
  pm3: [
    { n: "Cuadrática factorizable", f: "x^2-4*x+3", xmin: -2, xmax: 6, nota: "Ligado a Cuadráticas (PF4): raíces en x=1 y x=3." },
    { n: "Recta del punto de equilibrio", f: "-x+7", xmin: -5, xmax: 12, nota: "Ligado a Sistemas 2×2 (PF3): compárala con otra recta." },
  ],
  pm4: [
    { n: "Onda seno", f: "sin(x)", xmin: -6.3, xmax: 6.3, nota: "Ligado a Razones trigonométricas (PF2)." },
    { n: "Tangente (con asíntotas)", f: "tan(x)", xmin: -3, xmax: 3, nota: "Observa qué pasa cerca de x=π/2, donde no está definida." },
  ],
  pm5: [
    { n: "Cúbica con máximo y mínimo", f: "x^3-3*x", xmin: -3, xmax: 3, nota: "Activa la tangente: donde f'(x)=0 están los puntos críticos." },
    { n: "Recíproca (asíntota en x=0)", f: "1/x", xmin: -5, xmax: 5, nota: "Ligado al concepto de límite (PF4): ¿qué pasa cerca de x=0?" },
    { n: "Exponencial eˣ", f: "exp(x)", xmin: -3, xmax: 3, nota: "Ligado a Funciones trascendentes (PF5)." },
  ],
  pm6: [
    { n: "Campana normal (aproximada)", f: "exp(-x^2/2)", xmin: -4, xmax: 4, nota: "Ligado a Distribución normal (PF8), la misma forma del interactivo." },
  ],
  cneyt1: [
    { n: "Masa según volumen (densidad cte.)", f: "2.7*x", xmin: 0, xmax: 10, nota: "Ligado a Materia, cuerpo, masa, densidad (PF3): pendiente = densidad." },
  ],
  cneyt2: [
    { n: "Energía cinética vs. velocidad", f: "0.5*2*x^2", xmin: 0, xmax: 10, nota: "Ligado a Fuerza y energía mecánica (PF2): Ec=½mv², m=2 kg." },
  ],
  cneyt3: [
    { n: "Fotosíntesis vs. intensidad de luz", f: "10*x/(2+x)", xmin: 0, xmax: 20, nota: "Ligado a Fotosíntesis (PF6): la tasa se satura, no crece sin límite." },
  ],
  cneyt4: [
    { n: "Curva de neutralización (pH)", f: "7+7/(1+exp(-1*(x-5)))", xmin: 0, xmax: 10, nota: "Ligado a Ácidos y bases (PF4): el pH sube abruptamente cerca del punto de equilibrio." },
  ],
  cneyt5: [
    { n: "Caída libre: altura vs. tiempo", f: "20*x-4.9*x^2", xmin: 0, xmax: 4, nota: "Ligado a Caída libre y leyes de Newton (PF1): v₀=20 m/s." },
    { n: "Onda mecánica", f: "3*sin(2*x)", xmin: 0, xmax: 6.3, nota: "Ligado a Movimiento ondulatorio (PF4)." },
  ],
  cneyt6: [
    { n: "Crecimiento logístico de una población", f: "100/(1+exp(-1*(x-5)))", xmin: 0, xmax: 10, nota: "Toda población real se satura por recursos limitados, a diferencia del crecimiento exponencial puro." },
  ],
};


// Fase 10: Glosario de símbolos — filtrado por la materia activa (sin toggle
// "ver todos", por simplicidad). Referencia rápida, no interactiva: cada
// tarjeta es solo lectura.
function GlosarioSimbolos({ matId }) {
  const lista = GLOSARIO[matId] || [];
  if (!lista.length) return <p className="muted">Sin símbolos de referencia para esta materia todavía.</p>;
  return (
    <div>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: CI.muted }}>Símbolos que aparecen en {MATERIAS[matId]?.nombre}. Consulta rápida — no reemplaza aprender qué significan al resolver.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {lista.map((g, i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: CI.papel2, border: `1.5px solid ${CI.linea}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: CI.azul, minWidth: 54, textAlign: "center", lineHeight: 1.1 }}>{g.s}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: CI.ink }}>{g.n}</div>
              <div style={{ fontSize: 12.5, color: CI.muted, marginTop: 2, lineHeight: 1.4 }}>{g.sig}</div>
              {g.ej && <div style={{ fontSize: 12, color: CI.milpaD, marginTop: 4, fontFamily: "monospace" }}>{g.ej}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GraficadorFunciones({ matId }) {
  const [texto, setTexto] = useState("x^2-4");
  const [xmin, setXmin] = useState(-10);
  const [xmax, setXmax] = useState(10);
  const [puntoX, setPuntoX] = useState(2);
  const [mostrarTangente, setMostrarTangente] = useState(false);
  const [error, setError] = useState(null);
  const [presetActivo, setPresetActivo] = useState(null);
  const presets = GRAFICOS_PRESET[matId] || [];
  const usarPreset = (p, i) => { setTexto(p.f); setXmin(p.xmin); setXmax(p.xmax); setPresetActivo(i); };

  let pts = [], yVals = [], derivEnPunto = null, yEnPunto = null;
  try {
    pts = muestrearFuncion(texto, xmin, xmax, 150);
    yVals = pts.map((p) => p.y).filter((y) => Number.isFinite(y));
    if (mostrarTangente) {
      derivEnPunto = r2ci(derivadaNumerica(texto, puntoX));
      yEnPunto = evaluarExpresion(texto, { x: puntoX });
    }
    if (error) setError(null);
  } catch (e) { /* se maneja abajo con try individual */ }

  const ymin = yVals.length ? Math.min(...yVals, -1) : -10;
  const ymax = yVals.length ? Math.max(...yVals, 1) : 10;
  const W = 320, H = 220, pad = 26;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  const polylinePts = pts.filter((p) => Number.isFinite(p.y)).map((p) => `${X(p.x)},${Y(p.y)}`).join(" ");

  return (
    <div>
      {presets.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.muted, textTransform: "uppercase", margin: "0 0 6px" }}>Funciones de esta materia</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {presets.map((p, i) => (
              <button key={i} className={`tab ${presetActivo === i ? "on" : ""}`} style={{ padding: "7px 11px", fontSize: 12.5 }} onClick={() => usarPreset(p, i)}>{p.n}</button>
            ))}
          </div>
          {presetActivo !== null && presets[presetActivo] && (
            <p style={{ fontSize: 12, color: CI.azul, fontStyle: "italic", margin: "8px 0 0", lineHeight: 1.5 }}>💡 {presets[presetActivo].nota}</p>
          )}
        </div>
      )}
      <input
        type="text" value={texto} onChange={(e) => { setTexto(e.target.value); setPresetActivo(null); }}
        placeholder="ej: x^2-4, sin(x), 2*x+1"
        style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1.5px solid #2E2A21", fontSize: 15, marginBottom: 10, boxSizing: "border-box", fontFamily: "monospace" }}
      />
      <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: CI.milpaD, marginBottom: 8 }}>f(x) = {texto || "…"}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", background: "#FBF7EC", borderRadius: 10, border: "1.5px solid #2E2A21" }}>
        <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.muted} strokeWidth="1" />
        <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.muted} strokeWidth="1" />
        {polylinePts && <polyline points={polylinePts} fill="none" stroke={CI.milpa} strokeWidth="2.4" />}
        {mostrarTangente && yEnPunto !== null && Number.isFinite(yEnPunto) && (
          <>
            <line
              x1={X(xmin)} y1={Y(derivEnPunto * (xmin - puntoX) + yEnPunto)}
              x2={X(xmax)} y2={Y(derivEnPunto * (xmax - puntoX) + yEnPunto)}
              stroke={CI.rojo} strokeWidth="1.8" strokeDasharray="5 3"
            />
            <circle cx={X(puntoX)} cy={Y(yEnPunto)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.3" />
          </>
        )}
      </svg>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <label style={{ flex: 1, fontSize: 12, color: CI.muted }}>x mín: <b style={{ color: CI.ink }}>{xmin}</b>
          <input type="range" min={-30} max={0} value={xmin} onChange={(e) => setXmin(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
        <label style={{ flex: 1, fontSize: 12, color: CI.muted }}>x máx: <b style={{ color: CI.ink }}>{xmax}</b>
          <input type="range" min={0} max={30} value={xmax} onChange={(e) => setXmax(+e.target.value)} style={{ width: "100%", accentColor: CI.milpa }} /></label>
      </div>
      <div style={{ marginTop: 10, padding: "10px 12px", background: CI.papel2, border: "1.5px solid #2E2A21", borderRadius: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: CI.ink, cursor: "pointer" }}>
          <input type="checkbox" checked={mostrarTangente} onChange={(e) => setMostrarTangente(e.target.checked)} />
          Mostrar recta tangente y derivada en un punto
        </label>
        {mostrarTangente && (
          <>
            <label style={{ display: "block", fontSize: 12, color: CI.muted, marginTop: 8 }}>Punto x: <b style={{ color: CI.ink }}>{puntoX}</b>
              <input type="range" min={xmin} max={xmax} step={0.5} value={puntoX} onChange={(e) => setPuntoX(+e.target.value)} style={{ width: "100%", accentColor: CI.rojo }} /></label>
            {derivEnPunto !== null && Number.isFinite(derivEnPunto) && (
              <div style={{ fontSize: 13, color: CI.rojo, fontWeight: 700, marginTop: 4 }}>f'({puntoX}) ≈ {derivEnPunto}</div>
            )}
          </>
        )}
      </div>
      <p style={{ fontSize: 12, color: CI.muted, fontStyle: "italic", marginTop: 8, lineHeight: 1.5 }}>
        Usa x como variable. Funciones disponibles: sin, cos, tan, sqrt, log, ln, abs, exp. Ejemplo con varias: sin(x)*x^2-3
      </p>
    </div>
  );
}


// ============================================================================
// RESOLVEDOR (Fases 1-2) — herramienta didáctica: el alumno elige el tipo de
// problema, lo teclea, y ve el desglose paso a paso animado (navegador ← →,
// resalta lo que cambió, y mini-visual donde aplica). El mismo motor y el mismo
// componente DesglosePasos se reusarán inline en los ejercicios en fase 3.
// ============================================================================

// --- Resalta dentro de una cadena la subcadena `res` (lo que cambió en el paso) ---
const EST_ORO = { background: CI.maizS, color: "#7a5a00", fontWeight: 900, borderRadius: 4, padding: "0 3px", boxShadow: `inset 0 -2px 0 ${CI.maiz}` };
const EST_ROJO = { background: "#F9E4DE", color: CI.rojo, fontWeight: 900, borderRadius: 4, padding: "0 3px", boxShadow: `inset 0 -2px 0 ${CI.rojo}` };
// Doble resaltado: ORO = resultado nuevo (lo que acabo de hacer), ROJO = lo que
// se opera / lo que sigue. Si se traslapan, el oro se anida dentro del rojo.
function conResalte(texto, oro, rojo) {
  const iO = oro ? texto.indexOf(oro) : -1;
  const iR = rojo ? texto.indexOf(rojo) : -1;
  if (iO < 0 && iR < 0) return texto;
  if (iO >= 0 && iR >= 0) {
    const oroDentro = iO >= iR && iO + oro.length <= iR + rojo.length;
    if (oroDentro) {
      const pre = rojo.slice(0, iO - iR), post = rojo.slice(iO - iR + oro.length);
      return (<>{texto.slice(0, iR)}<span style={EST_ROJO}>{pre}<span style={EST_ORO}>{oro}</span>{post}</span>{texto.slice(iR + rojo.length)}</>);
    }
    const [a, b] = iO < iR ? [{ i: iO, s: oro, st: EST_ORO }, { i: iR, s: rojo, st: EST_ROJO }] : [{ i: iR, s: rojo, st: EST_ROJO }, { i: iO, s: oro, st: EST_ORO }];
    if (a.i + a.s.length <= b.i) {
      return (<>{texto.slice(0, a.i)}<span style={a.st}>{a.s}</span>{texto.slice(a.i + a.s.length, b.i)}<span style={b.st}>{b.s}</span>{texto.slice(b.i + b.s.length)}</>);
    }
    // traslape parcial raro: prioriza el rojo
    return (<>{texto.slice(0, iR)}<span style={EST_ROJO}>{rojo}</span>{texto.slice(iR + rojo.length)}</>);
  }
  const i = iO >= 0 ? iO : iR, s = iO >= 0 ? oro : rojo, st = iO >= 0 ? EST_ORO : EST_ROJO;
  return (<>{texto.slice(0, i)}<span style={st}>{s}</span>{texto.slice(i + s.length)}</>);
}

// --- Balanza SVG para ecuaciones lineales ---
function VisualBalanza({ p }) {
  const W = 300, H = 110;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", marginTop: 8 }} aria-hidden="true">
      <line x1="40" y1="46" x2="260" y2="46" stroke={CI.surco} strokeWidth="3" strokeLinecap="round" />
      <line x1="150" y1="30" x2="150" y2="46" stroke={CI.surco} strokeWidth="3" />
      <polygon points="150,20 143,34 157,34" fill={CI.maiz} stroke={CI.ink} strokeWidth="1" />
      {[[80, p.izq], [220, p.der]].map(([cx, txt], i) => (
        <g key={i}>
          <line x1={cx} y1="46" x2={cx - 26} y2="70" stroke={CI.linea} strokeWidth="1.5" />
          <line x1={cx} y1="46" x2={cx + 26} y2="70" stroke={CI.linea} strokeWidth="1.5" />
          <rect x={cx - 40} y="70" width="80" height="26" rx="6" fill={CI.papel2} stroke={CI.ink} strokeWidth="1.5" />
          <text x={cx} y="87" textAnchor="middle" fontSize="15" fontWeight="800" fill={CI.milpaD}>{txt}</text>
        </g>
      ))}
      <text x="80" y="108" textAnchor="middle" fontSize="9" fill={CI.muted}>IZQUIERDA</text>
      <text x="220" y="108" textAnchor="middle" fontSize="9" fill={CI.muted}>DERECHA</text>
    </svg>
  );
}

// --- Tabla de proporción para regla de tres ---
function VisualProporcion({ p }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
      <table style={{ borderCollapse: "collapse", fontSize: 16 }}>
        <tbody>
          <tr>
            <td style={{ border: `1.5px solid ${CI.ink}`, padding: "8px 18px", fontWeight: 800, background: CI.papel2 }}>{dispNum(p.A)}</td>
            <td style={{ padding: "0 8px", color: CI.maiz, fontWeight: 800 }}>→</td>
            <td style={{ border: `1.5px solid ${CI.ink}`, padding: "8px 18px", fontWeight: 800, background: CI.papel2 }}>{dispNum(p.B)}</td>
          </tr>
          <tr>
            <td style={{ border: `1.5px solid ${CI.ink}`, padding: "8px 18px", fontWeight: 800, background: CI.papel2 }}>{dispNum(p.C)}</td>
            <td style={{ padding: "0 8px", color: CI.maiz, fontWeight: 800 }}>→</td>
            <td style={{ border: `1.5px solid ${CI.maiz}`, padding: "8px 18px", fontWeight: 800, background: CI.maizS, color: CI.rojo }}>{p.x}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// --- Mini-gráfica de dos rectas y su intersección (sistema 2×2) ---
function VisualSistema({ res }) {
  const { e1, e2 } = res.pasos[0];
  const sol = res.sol;
  if (!e1 || !e2 || !sol) return null;
  const W = 280, H = 200, pad = 20;
  const rango = Math.max(6, Math.abs(sol.x) + 3, Math.abs(sol.y) + 3);
  const xmin = -rango, xmax = rango, ymin = -rango, ymax = rango;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin)) * (H - 2 * pad);
  // recta ax·x + ay·y = d → y = (d - ax·x)/ay  (si ay≠0)
  const puntos = (e) => {
    if (Math.abs(e.ay) > 1e-9) return [[xmin, (e.d - e.ax * xmin) / e.ay], [xmax, (e.d - e.ax * xmax) / e.ay]];
    const xv = e.d / e.ax; return [[xv, ymin], [xv, ymax]];
  };
  const l1 = puntos(e1), l2 = puntos(e2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", marginTop: 8, background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
      <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.linea} strokeWidth="1" />
      <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.linea} strokeWidth="1" />
      <line x1={X(l1[0][0])} y1={Y(l1[0][1])} x2={X(l1[1][0])} y2={Y(l1[1][1])} stroke={CI.milpa} strokeWidth="2.4" />
      <line x1={X(l2[0][0])} y1={Y(l2[0][1])} x2={X(l2[1][0])} y2={Y(l2[1][1])} stroke={CI.surco} strokeWidth="2.4" />
      {Math.abs(sol.x) <= xmax && Math.abs(sol.y) <= ymax && <circle cx={X(sol.x)} cy={Y(sol.y)} r="5.5" fill={CI.rojo} stroke="#fff" strokeWidth="1.5" />}
    </svg>
  );
}

// --- Parábola con raíces marcadas (cuadrática) ---
function VisualParabola({ res }) {
  const { a, b, c, x1, x2 } = res;
  const W = 280, H = 200, pad = 18;
  const xv = -b / (2 * a);
  const span = Math.max(4, (x1 !== undefined ? Math.abs(x1 - xv) : 3) + 2, (x2 !== undefined ? Math.abs(x2 - xv) : 3) + 2);
  const xmin = xv - span, xmax = xv + span;
  const f = (x) => a * x * x + b * x + c;
  let ys = []; for (let i = 0; i <= 40; i++) ys.push(f(xmin + (i / 40) * (xmax - xmin)));
  const ymin = Math.min(0, ...ys), ymax = Math.max(0, ...ys) || 1;
  const X = (x) => pad + ((x - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const Y = (y) => H - pad - ((y - ymin) / (ymax - ymin || 1)) * (H - 2 * pad);
  let d = ""; for (let i = 0; i <= 60; i++) { const x = xmin + (i / 60) * (xmax - xmin); d += (i ? "L" : "M") + X(x).toFixed(1) + " " + Y(f(x)).toFixed(1) + " "; }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", marginTop: 8, background: CI.papel2, borderRadius: 10, border: `1.5px solid ${CI.ink}` }}>
      {ymin < 0 && ymax > 0 && <line x1={X(xmin)} y1={Y(0)} x2={X(xmax)} y2={Y(0)} stroke={CI.linea} strokeWidth="1" />}
      <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke={CI.linea} strokeWidth="1" />
      <path d={d} fill="none" stroke={CI.milpa} strokeWidth="2.4" />
      {[x1, x2].map((r, i) => r !== undefined && Math.abs(r - xv) <= span ? <circle key={i} cx={X(r)} cy={Y(0)} r="5" fill={CI.rojo} stroke="#fff" strokeWidth="1.5" /> : null)}
    </svg>
  );
}

// --- Escala de pH con marcador ---
function VisualPH({ res }) {
  const pH = Math.max(0, Math.min(14, res.pH));
  const W = 280, H = 56;
  const X = (v) => 10 + (v / 14) * (W - 20);
  const colores = ["#C0392B", "#E67E22", "#F1C40F", "#7DB63A", "#27AE60", "#1F8A70", "#2C6F9B", "#5B4E9E"];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", marginTop: 8 }}>
      <defs>
        <linearGradient id="phgrad" x1="0" x2="1">
          {colores.map((col, i) => <stop key={i} offset={`${(i / (colores.length - 1)) * 100}%`} stopColor={col} />)}
        </linearGradient>
      </defs>
      <rect x="10" y="8" width={W - 20} height="16" rx="3" fill="url(#phgrad)" stroke={CI.ink} strokeWidth="1" />
      <text x="10" y="40" fontSize="9" fill={CI.muted}>0 ácido</text>
      <text x={W / 2} y="40" fontSize="9" fill={CI.muted} textAnchor="middle">7 neutro</text>
      <text x={W - 10} y="40" fontSize="9" fill={CI.muted} textAnchor="end">14 base</text>
      <polygon points={`${X(pH)},26 ${X(pH) - 5},34 ${X(pH) + 5},34`} fill={CI.ink} />
      <text x={X(pH)} y="54" fontSize="11" fontWeight="800" fill={CI.ink} textAnchor="middle">pH {dispNum(res.pH)}</text>
    </svg>
  );
}

function renderVisual(res, p) {
  switch (res.visual) {
    case "balanza": return <VisualBalanza p={p} />;
    case "proporcion": return <VisualProporcion p={p} />;
    case "sistema": return <VisualSistema res={res} />;
    case "parabola": return <VisualParabola res={res} />;
    case "phscale": return res.pH !== undefined ? <VisualPH res={res} /> : null;
    default: return null;
  }
}

// --- Presentación reutilizable del desglose paso a paso ---
// Una fila de paso, reutilizada tanto en modo paso-a-paso como en cascada.
function FilaPaso({ resultado, p, idx, total, compacto }) {
  return (
    <div style={compacto ? { marginBottom: 10 } : undefined}>
      {compacto && (
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: CI.azul, textTransform: "uppercase", marginBottom: 3 }}>
          {idx + 1}. {p.titulo || `Paso ${idx + 1}`}
        </div>
      )}
      <div style={{ background: CI.papel2, border: `1.5px solid ${compacto ? CI.linea : CI.ink}`, borderRadius: 10, padding: compacto ? "10px 14px" : 16, textAlign: "center" }}>
        <div style={{ fontSize: compacto ? 18 : 22, fontWeight: 800, color: CI.ink, lineHeight: 1.4, whiteSpace: "pre-line" }}>{conResalte(p.linea, p.resalta, p.rojo)}</div>
        {renderVisual(resultado, p)}
        <div style={{ fontSize: compacto ? 12 : 13, color: CI.muted, fontStyle: "italic", marginTop: compacto ? 6 : 10, lineHeight: 1.5 }}>{p.nota}</div>
      </div>
    </div>
  );
}

function DesglosePasos({ resultado }) {
  const [i, setI] = useState(0);
  const [cascada, setCascada] = useState(false);
  const pasoRef = useRef(null);
  useEffect(() => { setI(0); setCascada(false); }, [resultado]);
  // Cada vez que cambia el paso mostrado, entra con un rebote suave (GSAP).
  useEffect(() => {
    if (!cascada && pasoRef.current) {
      animarDesde(pasoRef.current, { y: 10, opacity: 0, duration: 0.35, ease: "back.out(1.7)" });
    }
  }, [i, cascada, resultado]);
  if (!resultado) return null;
  if (!resultado.ok) return <div style={{ background: "#F6E3DE", border: `1.5px solid ${CI.rojo}`, borderRadius: 10, padding: "10px 12px", color: CI.rojo, fontSize: 13 }}>⚠️ {resultado.error}</div>;
  const pasos = resultado.pasos;
  const idx = Math.min(i, pasos.length - 1);
  const p = pasos[idx];
  const ultimo = idx >= pasos.length - 1;

  // Alternador de modo (arriba a la derecha)
  const modoBtns = (
    <div style={{ display: "flex", gap: 4 }}>
      <button className={`tab ${!cascada ? "on" : ""}`} style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => setCascada(false)}>Paso a paso</button>
      <button className={`tab ${cascada ? "on" : ""}`} style={{ padding: "3px 9px", fontSize: 11 }} onClick={() => setCascada(true)}>Cascada</button>
    </div>
  );

  if (cascada) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.azul, textTransform: "uppercase" }}>Los {pasos.length} pasos</span>
          {modoBtns}
        </div>
        {pasos.map((pp, k) => <FilaPaso key={k} resultado={resultado} p={pp} idx={k} total={pasos.length} compacto />)}
        {resultado.resumen && (
          <div style={{ background: CI.milpaS, borderRadius: 8, padding: "9px 12px", marginTop: 4, fontSize: 14, fontWeight: 800, color: CI.milpaD, textAlign: "center" }}>{resultado.resumen}</div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.azul, textTransform: "uppercase" }}>Paso {idx + 1} de {pasos.length}{p.titulo ? <span style={{ color: CI.ink }}> · {p.titulo}</span> : null}</span>
        {modoBtns}
      </div>
      <div ref={pasoRef}><FilaPaso resultado={resultado} p={p} idx={idx} total={pasos.length} /></div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
        <button className="tab" disabled={idx === 0} onClick={() => setI(Math.max(0, idx - 1))}>← Anterior</button>
        {!ultimo ? <button className="tab on" onClick={() => setI(Math.min(pasos.length - 1, idx + 1))}>Siguiente paso →</button>
                 : <button className="tab" onClick={() => setI(0)}>↺ Reiniciar</button>}
      </div>
      {ultimo && resultado.resumen && (
        <div style={{ background: CI.milpaS, borderRadius: 8, padding: "9px 12px", marginTop: 10, fontSize: 14, fontWeight: 800, color: CI.milpaD, textAlign: "center" }}>{resultado.resumen}</div>
      )}
    </div>
  );
}

// --- Catálogo de tipos, agrupado por área ---
const TIPOS_RESOLVEDOR = [
  { id: "jerarquia", grupo: "mate", label: "Jerarquía de operaciones", ph: "6 + 4 × 2", ayuda: "Escribe una operación numérica. Usa + − × ÷ ^ y paréntesis.", fn: resolverJerarquia },
  { id: "lineal", grupo: "mate", label: "Ecuación lineal", ph: "2x + 3 = 11", ayuda: "Ecuación con x y un signo =. Ejemplo: 3x − 5 = x + 7.", fn: resolverLineal },
  { id: "regla3", grupo: "mate", label: "Regla de tres", ph: "3, 12, 5", ayuda: "Tres números separados por coma: si A da B, ¿cuánto da C?", fn: resolverReglaTres },
  { id: "sistema", grupo: "mate", label: "Sistema 2×2", ph: "x + y = 5 ; x − y = 1", ayuda: "Dos ecuaciones en x, y separadas por punto y coma (;).", fn: resolverSistema },
  { id: "cuadratica", grupo: "mate", label: "Ecuación cuadrática", ph: "x^2 − 5x + 6 = 0", ayuda: "Ecuación de grado 2 en x. Usa ^2. Ejemplo: 2x^2 − 3x + 1 = 0.", fn: resolverCuadratica },
  { id: "derivada", grupo: "mate", label: "Derivada (potencia)", ph: "5x^3", ayuda: "Una potencia de x: 5x^3, x^2, 7x. Aplica la regla de la potencia paso a paso.", fn: resolverDerivadaPotencia },
  { id: "densidad", grupo: "cien", label: "Densidad", ph: "240, 30", ayuda: "Masa y volumen: masa (g), volumen (cm³). Ejemplo: 240, 30.", fn: resolverDensidad },
  { id: "ph", grupo: "cien", label: "pH", ph: "0.001", ayuda: "Concentración de H⁺ en mol/L. Se acepta decimal o 1e-3.", fn: resolverPH },
  { id: "ohm", grupo: "cien", label: "Ley de Ohm (V)", ph: "2, 5", ayuda: "Corriente (A) y resistencia (Ω) para hallar el voltaje. Ejemplo: 2, 5.", fn: resolverOhm },
  { id: "cinetica", grupo: "cien", label: "Energía cinética", ph: "4, 3", ayuda: "Masa (kg) y velocidad (m/s). Ejemplo: 4, 3.", fn: resolverCinetica },
];

function Resolvedor({ matId, tipoInicial, soloTipo, compacto, ejemploSugerido }) {
  const [tipo, setTipo] = useState(tipoInicial || "jerarquia");
  const [entrada, setEntrada] = useState("");
  const [resultado, setResultado] = useState(null);
  const T = TIPOS_RESOLVEDOR.find((t) => t.id === tipo);
  // En modo embebido (soloTipo), si hay un ejemplo real del propósito, se usa en
  // vez del placeholder genérico del tipo — así "Notación científica" sugiere
  // "(4 × 10^4) × (3 × 10^4)" y no el "6 + 4 × 2" genérico de Jerarquía.
  const phEfectivo = (soloTipo && ejemploSugerido) || T.ph;
  const prep = (s) => s.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");

  const resolver = () => {
    if (!entrada.trim()) { setResultado({ ok: false, error: "Escribe un problema primero." }); return; }
    try { setResultado(T.fn(prep(entrada))); }
    catch (e) { setResultado({ ok: false, error: "No pude procesar eso. Revisa el formato del ejemplo." }); }
  };
  const elegir = (id) => { setTipo(id); setResultado(null); setEntrada(""); };
  const atajos = tipo === "lineal" ? ["x", "+", "−", "×", "÷", "=", "( )"]
    : tipo === "sistema" ? ["x", "y", "+", "−", "=", ";"]
    : tipo === "cuadratica" ? ["x", "^2", "+", "−", "=", "( )"]
    : tipo === "derivada" ? ["x", "^", "−"]
    : ["mate", "cien"].includes(T.grupo) && tipo === "jerarquia" ? ["+", "−", "×", "÷", "^", "( )"]
    : [",", ".", "+", "−", "×", "÷"];

  const grupos = [{ id: "mate", label: "Matemáticas" }, { id: "cien", label: "Ciencias" }];

  return (
    <div>
      {!soloTipo && <>
        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.azul, textTransform: "uppercase" }}>🧩 Resolvedor paso a paso</p>
        <p className="muted" style={{ margin: "0 0 10px", fontSize: 12.5 }}>Elige el tipo, escribe tu problema y sigue el desglose. Es para <b>entender el procedimiento</b>, no para saltártelo.</p>
        {grupos.map((g) => (
          <div key={g.id} style={{ marginBottom: 8 }}>
            <p style={{ margin: "0 0 4px", fontSize: 10.5, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: CI.muted }}>{g.label}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TIPOS_RESOLVEDOR.filter((t) => t.grupo === g.id).map((t) => (
                <button key={t.id} className={`tab ${tipo === t.id ? "on" : ""}`} style={{ flex: "none" }} onClick={() => elegir(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>
        ))}
      </>}

      <p style={{ margin: soloTipo ? "0 0 6px" : "10px 0 6px", fontSize: 12, color: CI.muted }}>{T.ayuda}</p>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input value={entrada} onChange={(e) => setEntrada(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") resolver(); }} placeholder={phEfectivo}
          style={{ flex: 1, padding: "10px 12px", fontSize: 16, border: `1.5px solid ${CI.linea}`, borderRadius: 8, background: "#fff", color: CI.ink }} />
        <button className="btn btn-g" style={{ whiteSpace: "nowrap" }} onClick={resolver}>Resolver →</button>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {atajos.map((s) => (
          <button key={s} className="tab" style={{ padding: "5px 10px", fontSize: 14, flex: "none" }}
            onClick={() => setEntrada((e) => e + (s === "( )" ? "()" : s === "−" ? "-" : s === "^2" ? "^2" : s))}>{s}</button>
        ))}
        <button className="tab" style={{ padding: "5px 10px", fontSize: 13, flex: "none" }} onClick={() => { setEntrada(""); setResultado(null); }}>Borrar</button>
      </div>

      <DesglosePasos resultado={resultado} />

      {!resultado && (
        <p style={{ fontSize: 12, color: CI.muted, fontStyle: "italic", marginTop: 10, lineHeight: 1.5 }}>
          {soloTipo ? "Propón tu propio problema arriba, o " : "Ejemplo para probar: "}<button style={{ background: "none", border: "none", color: CI.azul, cursor: "pointer", padding: 0, fontSize: 12, textDecoration: "underline" }} onClick={() => setEntrada(phEfectivo)}>prueba {phEfectivo}</button>
        </p>
      )}
    </div>
  );
}

// Panel plegable para el Resolvedor embebido en Aprender: CERRADO por defecto
// (mantiene el minimalismo visual de la pantalla), se abre al tocarlo. Se
// vuelve a cerrar solo al cambiar de propósito, para no arrastrar el estado
// abierto de un tema al siguiente.
function PanelResolvedorEmbebido({ matId, propActivo, ejemploResolvedorEmbebido, onGuiado }) {
  const [abierto, setAbierto] = useState(false);
  useEffect(() => { setAbierto(false); }, [propActivo?.code]);
  const tipo = tipoResolvedorDe(matId, propActivo.code);
  if (!tipo) return null;
  if (!abierto) {
    return (
      <button className="card" style={{ borderColor: CI.azul, width: "100%", textAlign: "left", cursor: "pointer", display: "block" }} onClick={() => setAbierto(true)}>
        <p className="eyebrow" style={{ margin: 0, color: CI.azul }}>🧩 Juega con el resolvedor ▸</p>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: 12.5 }}>Toca para resolver uno tú mismo, paso a paso, antes de practicar.</p>
      </button>
    );
  }
  return (
    <div className="card" style={{ borderColor: CI.azul }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p className="eyebrow" style={{ margin: "0 0 2px", color: CI.azul }}>🧩 Juega con el resolvedor</p>
        <button className="tab" style={{ flex: "none", padding: "3px 9px", fontSize: 11 }} onClick={() => setAbierto(false)}>Cerrar</button>
      </div>
      <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5 }}>Antes de practicar, resuelve uno tú mismo paso a paso. Propón tu problema o prueba el ejemplo, y muévelo hasta entenderlo.</p>
      <Resolvedor matId={matId} tipoInicial={tipo} soloTipo ejemploSugerido={ejemploResolvedorEmbebido} />
      {tieneDesglose(matId, propActivo.code) && (
        <button className="tab" style={{ width: "100%", marginTop: 12, padding: "9px 0" }} onClick={onGuiado}>
          🧩 Prefiero un ejemplo resuelto + practicar guiado →
        </button>
      )}
    </div>
  );
}

// Fuente ÚNICA de verdad para "¿qué tipo de Resolvedor le toca a este propósito?":
// se deriva directo de DESGLOSE_MAP (ya sabe resolverlo, no hay que mantener dos
// mapas sincronizados a mano — la inconsistencia de v20 fue justo por eso).
// PROP_A_TIPO_EXTRA cubre únicamente los de CNEyT que aún no están en DESGLOSE_MAP.
const PROP_A_TIPO_EXTRA = {
  "cneyt1:PF3": "densidad", "cneyt2:PF2": "cinetica", "cneyt4:PF4": "ph", "cneyt5:PF1": "cinetica",
};
function tipoResolvedorDe(matId, code) {
  const clave = `${matId}:${code}`;
  return DESGLOSE_MAP[clave]?.tipo || PROP_A_TIPO_EXTRA[clave] || null;
}


const INTERACTIVOS = { BarraPorcentaje, Parabola, BalanzaEcuacion, RectaInteractiva, TraductorAlgebraico, ClasificadorExpresion, ModeloAreaMonomios, CuadradoBinomio, IdentidadOEcuacion,
  TasaVariacion, DerivadaPotencia, Optimizacion, VennConjuntos, CampanaNormal, EnergiaCinetica, EscalasTemperatura, EscalaPH, SegundaLeyNewton, OndaInteractiva, LeyOhm, CuadroPunnett, TablaVerdad, ValorPosicional, RectaEnteros, PorcentajeFraccion, CrecimientoPotencias, NotacionCientifica, JerarquiaOperaciones,
  SistemaDosRectas, FactorizacionCuadratica, InteresSimpleCompuesto, TeoremaPitagoras,
  DistanciaPuntos, CirculoUnitario, CoordenadasPolares, EcuacionRecta, CirculoEcuacion, SeccionesConicas,
  PosicionTiempo, SimetriaFuncion, ConceptoLimite, FuncionesTrascendentes, AreaBajoCurva,
  DeterministaAleatorio, SimulacionDado, ConteoPermutaciones, TipoGrafica, CorrelacionDispersión, PoblacionMuestra,
  CienciaSocial, FenomenosInterrelacionados, DensidadObjetos, ClasificadorMateria, ModeloAtomo, EnlacesQuimicos, EstadosAgregacion, NaturalezaDual,
  TierraSistema, CapasAtmosfera, CadenaTrofica, ReaccionEstructura, OxigenacionAtmosfera, FotosintesisVisual, DeterioroAmbiental, InnovacionesAmbientales,
  CadenaEnergia, PropagacionCalor, ConversorCaloriaJoule, GasIdeal, EntropiaVisual, EficienciaEnergetica,
  ClasificadorReacciones, BalanceadorEcuaciones, EquilibrioQuimico, RedoxTransferencia, EnlacesCarbono, ClasificadorBiomoleculas, RespiracionComparada,
  AccionReaccion, GravitacionDistancia, OpticaRayo, ArquimedesFlota, RelatividadDivulgativa,
  MillerUreyExperimento, ZoomCelula, ProcariotaEucariota, EmparejamientoBases, MitosisMeiosis, SeleccionNatural, CaracteristicasVida };
const PORQUE_INTERACTIVO = {
  BarraPorcentaje: "Todo porcentaje es una proporción con base 100. Mover el deslizador de p% cambia cuántas de las 100 partes se pintan; ese mismo porcentaje, aplicado a N, es el valor que buscas. Por eso «30% de 80» y «30 de cada 100» son la misma idea.",
  Parabola: "El vértice está donde la parábola deja de bajar y empieza a subir: x = −b/2a. Mueve a para ver cómo se abre o cierra (y hacia dónde), y b, c para desplazarla. Las raíces existen solo cuando la curva cruza el eje x — es decir, cuando el discriminante es ≥ 0.",
  BalanzaEcuacion: "Una ecuación es una balanza en equilibrio. Resolverla es hacer la MISMA operación a ambos lados —quitar lo mismo, dividir entre lo mismo— hasta que quede una sola x de un lado. El equilibrio nunca se rompe: por eso el resultado sigue siendo verdadero.",
  RectaInteractiva: "Toda recta y = mx + b tiene dos números que la definen por completo: dónde cruza el eje y (b) y qué tan inclinada está (m, la pendiente). Mover cualquiera de los dos deslizadores cambia la recta de forma predecible: b la sube o baja completa; m la gira.",
  TraductorAlgebraico: "Una letra representa CUALQUIER número, no uno fijo. Por eso la misma expresión algebraica traduce la frase sin importar qué valor le des a n — muévela y comprueba que la traducción sigue siendo correcta para todos los casos.",
  ClasificadorExpresion: "Clasificar una expresión es simplemente contar cuántos términos separados por + o − tiene. No depende de qué tan complicado sea cada término, solo de cuántos hay: 1 es monomio, 2 binomio, 3 trinomio, 4 o más polinomio.",
  ModeloAreaMonomios: "Multiplicar dos monomios es armar un rectángulo cuya área es el producto. Por eso la regla «multiplica coeficientes, suma exponentes» no es arbitraria: es la manera algebraica de calcular el área de esa cuadrícula.",
  CuadradoBinomio: "(a+b)² no es a²+b²: al elevar al cuadrado un cuadrado de lado (a+b), aparecen 4 piezas —no 2—, incluyendo dos rectángulos iguales de área ab. Por eso el término de en medio (2ab) tiene que estar ahí.",
  TablaVerdad: "Cada operador lógico sigue un patrón fijo de verdadero/falso. Cambiar de operador te muestra que la lógica no es intuición: es un conjunto de reglas exactas y verificables.",
  ValorPosicional: "El mismo dígito vale distinto según su posición. Ver el valor de cada uno por separado hace visible por qué el sistema decimal funciona con solo diez símbolos.",
  RectaEnteros: "Sumar un entero es saltar sobre la recta numérica: a la derecha si es positivo, a la izquierda si es negativo. El resultado es dónde terminas tras encadenar los saltos.",
  PorcentajeFraccion: "Toda fracción es un porcentaje disfrazado: dividir y multiplicar por 100 revela la misma proporción que la barra pintada muestra visualmente.",
  CrecimientoPotencias: "Cada barra multiplica la anterior por la base una vez más. Por eso el crecimiento exponencial se acelera tan rápido: no suma, multiplica.",
  NotacionCientifica: "La notación científica siempre mantiene la mantisa entre 1 y 10; el exponente hace todo el trabajo de escalar el número, ya sea gigante o diminuto.",
  JerarquiaOperaciones: "Seguir siempre el mismo orden (paréntesis, potencias, multiplicación/división, suma/resta) elimina cualquier ambigüedad al resolver una expresión.",
  SistemaDosRectas: "La solución de un sistema 2x2 es el único punto donde ambas rectas se cruzan. Si son paralelas (misma pendiente), nunca se cruzan y no hay solución.",
  FactorizacionCuadratica: "Elegir las raíces directamente y expandir el producto es el camino inverso a factorizar: de las soluciones a la ecuación general.",
  InteresSimpleCompuesto: "El interés compuesto gana interés también sobre el interés acumulado, por eso se dispara con los años mucho más que el simple.",
  TeoremaPitagoras: "El cuadrado de la hipotenusa siempre iguala la suma de los cuadrados de los catetos, sin importar el tamaño del triángulo rectángulo.",
  DistanciaPuntos: "La distancia entre dos puntos es la hipotenusa de un triángulo formado por sus diferencias en x y en y: es el teorema de Pitágoras aplicado al plano cartesiano.",
  CirculoUnitario: "En el círculo de radio 1, el coseno es la proyección horizontal y el seno la vertical del punto marcado por el ángulo, así nacen las razones trigonométricas.",
  CoordenadasPolares: "Un mismo punto puede describirse por su distancia y ángulo al origen (polares) o por sus coordenadas x, y (cartesianas): dos idiomas para el mismo lugar.",
  EcuacionRecta: "En y=mx+b, la pendiente m inclina la recta y b marca dónde cruza el eje vertical. Cambiar ambos parámetros mueve y gira la recta en tiempo real.",
  CirculoEcuacion: "Toda circunferencia es el conjunto de puntos a una distancia fija (el radio) de un centro, la misma idea que rige las órbitas planetarias de Kepler.",
  SeccionesConicas: "Círculo, elipse, parábola e hipérbola son la misma familia de curvas, distinguidas solo por su excentricidad: qué tan estirada está la curva.",
  PosicionTiempo: "La velocidad instantánea es la pendiente de la recta tangente a la curva posición-tiempo en un instante exacto, no el promedio de todo el trayecto.",
  SimetriaFuncion: "Una función par es simétrica al eje y; una impar es simétrica al origen. Cambiar de función revela el patrón visual detrás de cada tipo.",
  ConceptoLimite: "Aunque la función no esté definida exactamente en un punto, puede acercarse cada vez más a un valor específico, ese valor es el límite.",
  FuncionesTrascendentes: "Exponencial, logarítmica y trigonométrica no se resuelven con álgebra elemental; cada una tiene su propio patrón de crecimiento o repetición.",
  AreaBajoCurva: "El área bajo una curva es la integral de la función. El Teorema Fundamental del Cálculo conecta esa área acumulada con la derivada de su antiderivada.",
  DeterministaAleatorio: "Un evento determinista siempre da el mismo resultado bajo las mismas condiciones; uno aleatorio no se puede predecir con certeza aunque se repita.",
  SimulacionDado: "Con pocos lanzamientos las frecuencias son desiguales, pero mientras más lanzas, más se acercan a la probabilidad teórica de cada cara (1/6).",
  ConteoPermutaciones: "La permutación cuenta el orden; la combinación no. Por eso las combinaciones siempre son menos que las permutaciones para los mismos n y r.",
  TipoGrafica: "La gráfica correcta depende del tipo de dato: categorías piden barras, datos continuos agrupados piden histograma, evolución en el tiempo pide líneas.",
  CorrelacionDispersión: "Cuando los puntos se acomodan cerca de una línea, la correlación es fuerte; dispersos sin patrón, es débil. Correlación no implica causalidad.",
  PoblacionMuestra: "En el muestreo aleatorio simple, cada miembro de la población tiene la misma probabilidad de quedar en la muestra, a mayor muestra, mejor representa al total.",
  CienciaSocial: "La ciencia avanza en comunidad: hipótesis discutidas y revisadas por muchas personas a lo largo del tiempo, no por la iluminación de un genio aislado.",
  FenomenosInterrelacionados: "Un mismo fenómeno natural casi nunca pertenece a una sola disciplina: física, química y biología suelen explicar ángulos distintos de la misma realidad.",
  DensidadObjetos: "Si la densidad de un objeto es menor que la del líquido en que se sumerge, flota; si es mayor, se hunde, sin importar cuánto pese en total.",
  ClasificadorMateria: "Elemento: un solo tipo de átomo. Compuesto: átomos distintos en proporción fija. Mezcla: sustancias combinadas sin unión química, en proporción variable.",
  ModeloAtomo: "El número atómico define cuántos protones (y electrones, si es neutro) tiene un átomo, eso determina de qué elemento se trata.",
  EnlacesQuimicos: "En el enlace iónico se transfieren electrones completos; en el covalente, se comparten. Esa diferencia define muchas propiedades del compuesto resultante.",
  EstadosAgregacion: "La energía cinética de las partículas aumenta con la temperatura: vibran poco en el sólido, se deslizan en el líquido, y vuelan libres en el gas.",
  NaturalezaDual: "La materia se comporta como partículas discretas y también participa en fenómenos energéticos continuos, ambas vistas son necesarias para explicarla.",
  TierraSistema: "Lo que ocurre en un subsistema terrestre (como la atmósfera) afecta a los demás (hidrosfera, biosfera), por eso se estudian como un sistema interconectado.",
  CapasAtmosfera: "La atmósfera se organiza en capas según altura y temperatura; la troposfera, la más baja, es donde ocurre el clima que vivimos a diario.",
  CadenaTrofica: "La energía se pierde como calor en cada nivel de la cadena trófica, por eso las pirámides ecológicas se angostan hacia los niveles superiores.",
  ReaccionEstructura: "En una reacción química los átomos no se crean ni se destruyen: se reorganizan, rompiendo enlaces viejos y formando enlaces nuevos.",
  OxigenacionAtmosfera: "La atmósfera primitiva casi no tenía oxígeno libre; los organismos fotosintéticos lo liberaron durante cientos de millones de años hasta el 21% actual.",
  FotosintesisVisual: "La fotosíntesis transforma dióxido de carbono, agua y luz solar en glucosa y oxígeno, la base energética de casi toda cadena trófica.",
  DeterioroAmbiental: "El deterioro ambiental se mide con evidencia (gases, cobertura vegetal, temperatura), no solo con percepción: cada nivel representa un daño real y medible.",
  InnovacionesAmbientales: "La tecnología puede reducir el deterioro ambiental cuando se diseña considerando su impacto en los subsistemas terrestres, no solo su eficiencia económica.",
  CadenaEnergia: "Cada tecnología es, en el fondo, una cadena de transformaciones de energía diseñada con un propósito útil, la energía nunca desaparece, solo cambia de forma.",
  PropagacionCalor: "Conducción (contacto), convección (corrientes) y radiación (ondas sin medio) son las tres formas en que el calor viaja de un lugar a otro.",
  ConversorCaloriaJoule: "Caloría y Joule miden lo mismo, energía, con distinta unidad; por eso existe una equivalencia fija y exacta entre ambas.",
  GasIdeal: "Si la temperatura y la cantidad de gas no cambian, comprimir el volumen aumenta la presión y expandirlo la reduce: son inversamente proporcionales.",
  EntropiaVisual: "La entropía mide el desorden de un sistema. Con el tiempo, las partículas tienden a dispersarse, ese desorden nunca disminuye por sí solo.",
  EficienciaEnergetica: "La eficiencia mide qué porcentaje de la energía consumida se convierte en la forma útil deseada; el resto casi siempre se pierde como calor.",
  ClasificadorReacciones: "Síntesis combina, descomposición rompe, desplazamiento reemplaza, neutralización forma sal y agua, cuatro patrones que cubren casi cualquier reacción.",
  BalanceadorEcuaciones: "Ajustar coeficientes hasta que cada elemento tenga el mismo número de átomos en ambos lados es la manera de honrar la ley de conservación de la masa.",
  EquilibrioQuimico: "En el equilibrio, las reacciones directa e inversa ocurren a la misma velocidad: es un balance dinámico, no un estado congelado.",
  RedoxTransferencia: "En toda reacción redox hay transferencia de electrones: quien los pierde se oxida, quien los gana se reduce, siempre ocurren juntos.",
  EnlacesCarbono: "El carbono puede compartir 1, 2 o 3 pares de electrones con otro átomo de carbono, esa flexibilidad explica la enorme diversidad orgánica.",
  ClasificadorBiomoleculas: "Carbohidratos dan energía rápida, lípidos dan estructura y reserva, proteínas dan función, ácidos nucleicos guardan la información genética.",
  RespiracionComparada: "La respiración aerobia completa rinde muchísima más energía que la fermentación anaerobia, que se detiene apenas después de la glucólisis.",
  AccionReaccion: "Las fuerzas siempre vienen en pares iguales y opuestos, actuando sobre cuerpos distintos, por eso nunca se cancelan entre sí.",
  GravitacionDistancia: "La fuerza gravitacional cae con el cuadrado de la distancia: duplicar la distancia no reduce la fuerza a la mitad, la reduce a la cuarta parte.",
  OpticaRayo: "En la reflexión el ángulo de salida iguala al de entrada; en la refracción el rayo se desvía porque la luz cambia de velocidad entre medios.",
  ArquimedesFlota: "Un cuerpo sumergido recibe un empuje igual al peso del fluido que desplaza; si su densidad es menor que la del fluido, ese empuje lo hace flotar.",
  RelatividadDivulgativa: "A velocidades cercanas a la de la luz, el tiempo transcurre más lento para quien se mueve, un efecto real, medible y crucial para el GPS.",
  MillerUreyExperimento: "El experimento de 1953 mostró que, con los gases correctos y una fuente de energía, la materia inorgánica puede formar moléculas orgánicas complejas.",
  ZoomCelula: "Lo que Hooke vio como celdas vacías en un corcho en 1665 resultó ser, con mejores microscopios, la unidad estructural y funcional de todo ser vivo.",
  ProcariotaEucariota: "La diferencia clave es el núcleo: las procariotas no lo tienen delimitado por membrana; las eucariotas sí, junto con otros organelos especializados.",
  EmparejamientoBases: "A siempre empareja con T, y G siempre con C. Esa regla fija de complementariedad es lo que permite copiar con precisión la información genética.",
  MitosisMeiosis: "La mitosis da 2 células idénticas con el mismo número de cromosomas; la meiosis da 4 células con la mitad, la base de los gametos.",
  SeleccionNatural: "Cuando el ambiente cambia, el rasgo antes desventajoso puede volverse ventajoso: los individuos mejor adaptados sobreviven y se reproducen más.",
  CaracteristicasVida: "Ningún rasgo por sí solo define la vida; es la combinación de organización celular, metabolismo, reproducción y evolución lo que la distingue.",
  IdentidadOEcuacion: "Probar varios valores de x es la forma más directa de distinguir una identidad de una ecuación: si el resultado coincide siempre, ambos lados son la misma expresión disfrazada; si solo coincide una vez, es una condición que x debe cumplir.",
  TasaVariacion: "La tasa de variación promedio entre dos puntos es la pendiente de la recta secante que los une. Al acercar un punto al otro, la secante se transforma en la recta tangente — ese paso al límite es el corazón del cálculo diferencial.",
  DerivadaPotencia: "Derivar una función te da una nueva función que, en cada punto, indica la pendiente de su recta tangente. Para f(x)=x², la regla de la potencia da f'(x)=2x: negativa donde la curva baja, cero en el fondo, positiva donde sube.",
  Optimizacion: "Muchos problemas de optimización se reducen a hallar el punto más alto (o más bajo) de una curva. Ahí la recta tangente es horizontal, es decir, la derivada vale cero. Ese es el método: derivar, igualar a cero y resolver.",
  VennConjuntos: "El diagrama de Venn muestra por qué la unión no es solo sumar: los elementos compartidos (la intersección) se contarían dos veces. Por eso se restan una vez: |A∪B| = |A| + |B| − |A∩B|.",
  CampanaNormal: "La distribución normal describe muchos fenómenos naturales. La media (μ) marca su centro y la desviación (σ) qué tan dispersos están los datos: mueve los deslizadores y verás que la campana se traslada o se ensancha, pero nunca pierde su forma simétrica.",
  EnergiaCinetica: "La energía cinética (Ec = ½mv²) depende del cuadrado de la velocidad: por eso al duplicar la rapidez, la energía se cuadruplica. Esto explica por qué un choque a alta velocidad es mucho más peligroso que a baja.",
  EscalasTemperatura: "Celsius, Fahrenheit y Kelvin miden la misma temperatura con distinto origen y tamaño de grado. El termómetro te muestra cómo un mismo estado térmico se expresa en las tres escalas al mismo tiempo.",
  EscalaPH: "El pH mide qué tan ácida o básica es una sustancia, de 0 a 14. Mover el indicador te muestra dónde caen sustancias cotidianas: por debajo de 7 ácidas, por encima básicas, y en 7 justo neutras como el agua pura.",
  SegundaLeyNewton: "La segunda ley de Newton (F = m·a) conecta fuerza, masa y aceleración. La flecha roja crece cuando aplicas más fuerza y se acorta cuando aumentas la masa: el mismo empujón acelera menos a un cuerpo más pesado.",
  OndaInteractiva: "La velocidad de una onda es v = λ·f. La longitud de onda (λ) es la distancia entre crestas y la frecuencia (f) cuántas pasan por segundo. Mueve los deslizadores y observa cómo se comprime o estira la onda.",
  LeyOhm: "La ley de Ohm (V = I·R) relaciona voltaje, corriente y resistencia en un circuito. Los puntos rojos representan la corriente fluyendo: más amperios los aceleran; más resistencia exige más voltaje para mantener la misma corriente.",
  CuadroPunnett: "El cuadro de Punnett predice las proporciones de la descendencia combinando un alelo de cada progenitor por celda. El cruce Aa × Aa da la clásica proporción 3:1 — tres con rasgo dominante, uno recesivo.",
};

// ---------------------------- ESTADO INICIAL / PERSISTENCIA
const STORAGE_KEY = "entrenador-v2";
// Sello de versión visible en el pie — sube este número en cada build para
// confirmar de un vistazo (en el sitio en vivo) que cargó la última versión.
const BUILD = "v26 · 12 jul 2026";
function materiaVacia(matId) {
  const props = {};
  MATERIAS[matId].propositos.forEach((p) => { props[p.code] = propVacio(); });
  return { diagnostico: "pendiente", props };
}
function estadoInicial() {
  const materias = {};
  Object.keys(MATERIAS).forEach((mid) => { materias[mid] = materiaVacia(mid); });
  return { v: 3, xp: 0, racha: 0, totalCorrectas: 0, materiaActiva: "pm1", materias };
}
const XP_POR_NIVEL = 120;
const RANGOS = ["Semilla", "Brote", "Milpa joven", "Espiga", "Mazorca", "Cosecha"];

// ============================================================================
export default function EntrenamaticoV1() {
  const [prog, setProg] = useState(null);           // progreso persistente
  const [vista, setVista] = useState("inicio");     // inicio | practica | diagnostico | resumen | mapaDiag | aprender | casos | herramientas | guiado
  const [guiado, setGuiado] = useState(null);       // Fase 5: { ejemplo, intento, fase, elegida, verDesg }
  const [subHerramienta, setSubHerramienta] = useState("calculadora"); // calculadora | graficador | resolvedor
  const [areaActiva, setAreaActiva] = useState("mate"); // mate | cneyt — cuál grupo de semestres se muestra
  const [propActivo, setPropActivo] = useState(null);
  const [pregunta, setPregunta] = useState(null);
  const [elegida, setElegida] = useState(null);
  const [sesion, setSesion] = useState({ resueltas: 0, correctas: 0, xpGanado: 0 });
  const [avisoDominio, setAvisoDominio] = useState(false);
  const [diag, setDiag] = useState(null);           // { idx, resultados: [{code, ok}] }
  const [ultimoMs, setUltimoMs] = useState(null);
  const [verDesglose, setVerDesglose] = useState(false); // Fase 3: mostrar paso a paso inline
  const [tema, setTema] = useState("campo");        // Fase 6: tema visual
  const [escala, setEscala] = useState(1);          // Fase 6: tamaño de texto (0.9 / 1 / 1.15)
  const [showSettings, setShowSettings] = useState(false);
  const t0 = useRef(0);
  const memRef = useRef(null); // respaldo en memoria si storage falla

  // Aplica el tema al objeto CI antes de cada render (síncrono).
  aplicarTema(tema);

  // Cargar preferencias visuales guardadas (tema + escala)
  useEffect(() => {
    (async () => {
      try { const r = await window.storage.get("entrenador-ui"); if (r && r.value) { const p = JSON.parse(r.value); if (p.tema) setTema(p.tema); if (p.escala) setEscala(p.escala); } } catch (e) {}
    })();
  }, []);
  const guardarUI = (t, e) => { try { window.storage.set("entrenador-ui", JSON.stringify({ tema: t, escala: e })); } catch (err) {} };
  const cambiarTema = (t) => { setTema(t); guardarUI(t, escala); };
  const cambiarEscala = (e) => { setEscala(e); guardarUI(tema, e); };

  // Reinicia el desglose cada vez que cambia la pregunta
  useEffect(() => { setVerDesglose(false); }, [pregunta]);

  // Tecla Escape (PC): cierra el panel de Ajustes si está abierto; si no, y no
  // estamos ya en el inicio, regresa a la pantalla de propósitos. Es un atajo de
  // escritorio; en celular se usan los botones "Volver" de siempre.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (showSettings) { setShowSettings(false); return; }
      if (avisoDominio) { setAvisoDominio(false); setVista("inicio"); return; }
      if (vista !== "inicio") { setVista("inicio"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vista, showSettings, avisoDominio]);

  // ---- Cargar progreso
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r && r.value) {
          const data = JSON.parse(r.value);
          // migración defensiva: asegura ambas materias y todos los propósitos
          const base = estadoInicial();
          const merged = { ...base, ...data, materias: { ...base.materias, ...(data.materias || {}) } };
          for (const mid of Object.keys(MATERIAS)) {
            merged.materias[mid] = { ...materiaVacia(mid), ...merged.materias[mid], props: { ...materiaVacia(mid).props, ...(merged.materias[mid]?.props || {}) } };
          }
          setProg(merged);
          return;
        }
      } catch (e) { /* clave no existe aún */ }
      setProg(estadoInicial());
    })();
  }, []);

  // ---- Guardar progreso
  const guardar = useCallback(async (nuevo) => {
    memRef.current = nuevo;
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(nuevo)); } catch (e) { /* sigue en memoria */ }
  }, []);
  const setYGuarda = useCallback((fn) => {
    setProg((prev) => { const n = typeof fn === "function" ? fn(prev) : fn; guardar(n); return n; });
  }, [guardar]);

  // Ejemplo real del propósito activo, para sugerir en el Resolvedor embebido en
  // Aprender (en vez del placeholder genérico del tipo). Memoizado por propósito
  // para no regenerar en cada tecla que el alumno escribe en el input. Depende
  // solo de `prog` y `propActivo` (declarados ANTES del guard de carga) para no
  // violar las reglas de hooks — nunca debe quedar después de un return condicional.
  const ejemploResolvedorEmbebido = useMemo(() => {
    if (!prog || !propActivo) return null;
    const mid = prog.materiaActiva;
    const mat = MATERIAS[mid];
    const tipo = tipoResolvedorDe(mid, propActivo.code);
    if (!tipo) return null;
    const mapa = DESGLOSE_MAP[`${mid}:${propActivo.code}`];
    if (!mapa) return null;
    for (const nv of [1, 2, 3]) {
      for (let k = 0; k < 6; k++) {
        const q = mat.gen[propActivo.code](nv);
        const entrada = mapa.extraer(q.texto || "");
        if (entrada) return entrada;
      }
    }
    return null;
  }, [prog?.materiaActiva, propActivo?.code]);

  if (!prog) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", fontFamily: "system-ui", color: CI.muted, background: CI.papel }}>
        <div>🌱 Abriendo tu cuaderno de campo…</div>
      </div>
    );
  }

  const matId = prog.materiaActiva;
  const MAT = MATERIAS[matId];
  const estadoMat = prog.materias[matId];
  // Mantener el área mostrada en sincronía con la materia activa (p. ej. al recargar)
  if (MAT && MAT.area !== areaActiva) setAreaActiva(MAT.area);
  const nivelGlobal = Math.floor(prog.xp / XP_POR_NIVEL) + 1;
  const rango = RANGOS[Math.min(RANGOS.length - 1, nivelGlobal - 1)];

  // Propósito más débil no dominado (para recomendación adaptativa)
  const noDominados = MAT.propositos.filter((p) => !estadoMat.props[p.code]?.dominado);
  const debil = noDominados.length
    ? noDominados.reduce((min, p) => ((estadoMat.props[p.code]?.conf ?? 0) < (estadoMat.props[min.code]?.conf ?? 0) ? p : min), noDominados[0])
    : null;

  // ---------------- flujo de práctica ----------------
  const nuevaPregunta = (pr) => {
    const conf = estadoMat.props[pr.code]?.conf ?? 0;
    const nv = nivelDeConf(conf);
    const q = MAT.gen[pr.code](nv);
    q._nivel = nv;
    setPregunta(q);
    setElegida(null);
    setUltimoMs(null);
    t0.current = Date.now();
  };
  const iniciarPractica = (pr) => {
    setPropActivo(pr);
    setSesion({ resueltas: 0, correctas: 0, xpGanado: 0 });
    setAvisoDominio(false);
    setVista("practica");
    nuevaPregunta(pr);
  };
  const iniciarAprender = (pr) => {
    setPropActivo(pr);
    setVista("aprender");
  };
  // ---- Practicar guiado (Fase 5): par ejemplo-problema (worked example–problem pair) ----
  // Genera una pregunta del propósito que SÍ sea desglosable (los generadores mezclan
  // variantes, y algunas SOLO aparecen en ciertos niveles — ej. notación científica
  // solo produce su variante desglosable en nivel 3). El modo guiado es una herramienta
  // de ENSEÑANZA, no de práctica adaptativa: no importa en qué nivel salga el ejemplo,
  // solo que sea representativo. Por eso se busca en los 3 niveles, no solo el del
  // alumno (verificado por simulación: resuelve el 100% de los 9 propósitos que antes
  // fallaban para un alumno nuevo — Fase 7).
  const generarDesglosable = (pr, nvPreferido, intentosPorNivel = 6) => {
    const niveles = [nvPreferido, ...[1, 2, 3].filter((n) => n !== nvPreferido)];
    for (const nv of niveles) {
      for (let k = 0; k < intentosPorNivel; k++) {
        const q = MAT.gen[pr.code](nv);
        const desg = resolverInline(matId, pr.code, q.texto);
        if (desg) return { q, desg };
      }
    }
    return null;
  };
  const nuevoParGuiado = (pr) => {
    const conf = estadoMat.props[pr.code]?.conf ?? 0;
    const nv = nivelDeConf(conf);
    const ejemplo = generarDesglosable(pr, nv);
    const intento = generarDesglosable(pr, nv);
    setGuiado({ ejemplo, intento, fase: "ejemplo", elegida: null, verDesg: false });
  };
  const iniciarGuiado = (pr) => {
    setPropActivo(pr);
    setVista("guiado");
    nuevoParGuiado(pr);
  };
  const responder = (idx) => {
    if (elegida !== null) return;
    const ms = Date.now() - t0.current;
    setUltimoMs(ms);
    setElegida(idx);
    const ok = idx === pregunta.correcta;
    setYGuarda((prev) => {
      const n = JSON.parse(JSON.stringify(prev));
      const pAntes = n.materias[matId].props[propActivo.code];
      const yaDominaba = pAntes.dominado;
      const pDesp = actualizarProp(pAntes, ok, ms);
      n.materias[matId].props[propActivo.code] = pDesp;
      if (ok) {
        const bonoNivel = pregunta._nivel === 3 ? 5 : 0;
        const xpGanado = 10 + Math.min(10, n.racha) + bonoNivel;
        const nivelAntes = Math.floor(n.xp / XP_POR_NIVEL);
        n.xp += xpGanado;
        n.racha += 1;
        n.totalCorrectas += 1;
        const nivelDesp = Math.floor(n.xp / XP_POR_NIVEL);
        setSesion((s) => ({ resueltas: s.resueltas + 1, correctas: s.correctas + 1, xpGanado: s.xpGanado + xpGanado }));
        // Recompensas visuales (confeti). Prioridad: nivel > dominado (abajo) > racha.
        if (nivelDesp > nivelAntes) festejar("nivel");
        else if (n.racha > 0 && n.racha % 5 === 0) festejar("acierto"); // cada 5 seguidas
      } else {
        n.racha = 0;
        setSesion((s) => ({ ...s, resueltas: s.resueltas + 1 }));
      }
      if (!yaDominaba && pDesp.dominado) { setAvisoDominio(true); festejar("dominado"); } // freno de sobre-práctica + festejo
      return n;
    });
  };
  const siguiente = () => {
    if (avisoDominio) return; // el aviso toma la pantalla
    nuevaPregunta(propActivo);
  };
  const terminarSesion = () => setVista("resumen");

  // ---------------- flujo de diagnóstico ----------------
  const iniciarDiagnostico = () => {
    setDiag({ idx: 0, resultados: [] });
    const pr = MAT.propositos[0];
    setPropActivo(pr);
    const q = MAT.gen[pr.code](2);
    q._nivel = 2;
    setPregunta(q); setElegida(null); t0.current = Date.now();
    setVista("diagnostico");
  };
  const responderDiag = (idx) => {
    if (elegida !== null) return;
    setElegida(idx);
  };
  const siguienteDiag = () => {
    const ok = elegida === pregunta.correcta;
    const resultados = [...diag.resultados, { code: MAT.propositos[diag.idx].code, ok }];
    const nextIdx = diag.idx + 1;
    if (nextIdx < MAT.propositos.length) {
      setDiag({ idx: nextIdx, resultados });
      const pr = MAT.propositos[nextIdx];
      setPropActivo(pr);
      const q = MAT.gen[pr.code](2);
      q._nivel = 2;
      setPregunta(q); setElegida(null); t0.current = Date.now();
    } else {
      // cerrar diagnóstico: sembrar confianza inicial por propósito
      setYGuarda((prev) => {
        const n = JSON.parse(JSON.stringify(prev));
        resultados.forEach((r) => {
          const p = n.materias[matId].props[r.code];
          p.conf = r.ok ? 55 : 15;
          p.vistas += 1;
          if (r.ok) { p.correctas += 1; p.consec = 1; }
        });
        n.materias[matId].diagnostico = "hecho";
        return n;
      });
      setDiag({ idx: nextIdx, resultados });
      setVista("mapaDiag");
    }
  };
  const omitirDiagnostico = () => {
    setYGuarda((prev) => {
      const n = JSON.parse(JSON.stringify(prev));
      n.materias[matId].diagnostico = "omitido";
      return n;
    });
  };
  const cambiarMateria = (mid) => {
    setYGuarda((prev) => ({ ...prev, materiaActiva: mid }));
    setVista("inicio");
  };
  // Al elegir un área (Matemáticas / CNEyT), salta a la primera materia de esa área
  const cambiarArea = (area) => {
    setAreaActiva(area);
    const primera = Object.keys(MATERIAS).find((mid) => MATERIAS[mid].area === area);
    if (primera && MATERIAS[matId]?.area !== area) cambiarMateria(primera);
  };
  const reiniciar = async () => {
    const n = estadoInicial();
    setProg(n);
    try { await window.storage.set(STORAGE_KEY, JSON.stringify(n)); } catch (e) {}
    setVista("inicio");
  };

  // ---------------- estilos ----------------
  const css = `
    .ent-root { min-height: 100vh; background: ${CI.papel}; color: ${CI.ink};
      font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
      background-image: radial-gradient(${CI.punto} 1px, transparent 1px); background-size: 22px 22px; }
    .ent-wrap { max-width: 560px; margin: 0 auto; padding: 16px 14px 48px; }
    .ent-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:8px; flex-wrap:wrap; }
    .ent-brand { display:flex; align-items:center; gap:10px; }
    .ent-logo { width:40px; height:40px; border-radius:10px; display:grid; place-items:center; background:${CI.milpa}; color:${CI.papel}; font-size:18px; box-shadow: 2px 2px 0 ${CI.ink}; }
    .ent-brand h1 { font-family: Georgia, "Times New Roman", serif; font-size:21px; margin:0; letter-spacing:.2px; }
    .ent-brand small { color:${CI.muted}; font-size:12px; display:block; margin-top:-2px; }
    .pill { background:${CI.campo}; border:1.5px solid ${CI.ink}; border-radius:999px; padding:4px 12px; font-weight:700; font-size:13px; box-shadow: 2px 2px 0 ${CI.ink}; display:flex; align-items:center; gap:5px; }
    .area-tabs { display:flex; gap:10px; margin-bottom:10px; }
    .area-tab { flex:1; padding:11px 8px; border-radius:12px; border:2px solid ${CI.ink}; background:${CI.campo}; font-weight:800; font-size:14px; cursor:pointer; box-shadow:3px 3px 0 ${CI.ink}; color:${CI.ink}; transition:transform .05s; }
    .area-tab.on { background:${CI.milpaD}; color:${CI.papel}; }
    .area-tab:active { transform:translate(1px,1px); box-shadow:2px 2px 0 ${CI.ink}; }
    .tabs { display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap; }
    .tab { flex:1; min-width:64px; padding:9px 6px; border-radius:10px; border:1.5px solid ${CI.ink}; background:${CI.campo}; font-weight:700; font-size:12.5px; cursor:pointer; box-shadow:2px 2px 0 ${CI.ink}; color:${CI.ink}; }
    .tab.on { background:${CI.milpa}; color:${CI.papel}; }
    .card { background:${CI.papel2}; border:1.5px solid ${CI.ink}; border-radius:14px; padding:16px; margin-bottom:12px; box-shadow: 3px 3px 0 ${CI.ink}; }
    .hero { display:flex; gap:14px; align-items:center; }
    .hero-rango { font-family:Georgia,serif; font-size:22px; margin:0 0 2px; }
    .hero-sub { margin:0; color:${CI.muted}; font-size:13px; }
    .lvl-track { height:9px; background:${CI.track}; border:1px solid ${CI.linea}; border-radius:99px; overflow:hidden; margin-top:8px; }
    .lvl-fill { height:100%; background:linear-gradient(90deg,${CI.milpa},${CI.milpa}); }
    .eyebrow { font-size:11px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase; color:${CI.muted}; margin:16px 2px 8px; }
    .prop-btn { width:100%; text-align:left; display:flex; gap:12px; align-items:center; background:${CI.papel2}; border:1.5px solid ${CI.ink}; border-radius:12px; padding:12px; margin-bottom:9px; cursor:pointer; box-shadow:2px 2px 0 ${CI.ink}; }
    .prop-btn:active { transform:translate(1px,1px); box-shadow:1px 1px 0 ${CI.ink}; }
    .prop-ico { width:38px; height:38px; border-radius:9px; display:grid; place-items:center; font-weight:800; font-size:15px; border:1.5px solid ${CI.ink}; flex:none; }
    .prop-tit { margin:0; font-size:14.5px; font-weight:800; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
    .prop-desc { margin:1px 0 5px; font-size:12px; color:${CI.muted}; }
    .dom-track { height:7px; background:${CI.track}; border-radius:99px; overflow:hidden; }
    .dom-fill { height:100%; }
    .chip { font-size:10.5px; font-weight:800; border:1px solid ${CI.ink}; border-radius:999px; padding:1px 8px; background:${CI.track}; }
    .chip.dom { background:${CI.maiz}; }
    .q-text { font-family:Georgia,serif; font-size:18px; line-height:1.45; margin:4px 0 12px; }
    .opt { width:100%; text-align:left; padding:12px 13px; border-radius:10px; border:1.5px solid ${CI.ink}; background:${CI.campo}; margin-bottom:8px; font-size:15px; cursor:pointer; box-shadow:2px 2px 0 ${CI.ink}; color:${CI.ink}; }
    .opt.ok { background:${CI.milpa}; color:${CI.papel}; }
    .opt.no { background:${CI.rojo}; color:${CI.papel}; }
    .opt.dim { opacity:.55; }
    .fb { border-radius:10px; padding:11px 13px; font-size:13.5px; line-height:1.5; margin-top:4px; border:1.5px solid ${CI.ink}; }
    .fb.ok { background:${CI.fbOk}; } .fb.no { background:${CI.fbNo}; }
    .fb-cuad { display:block; margin-top:7px; font-size:12.5px; color:${CI.inkSoft}; border-top:1px dashed #b7ab88; padding-top:7px; }
    .btn { padding:12px 16px; border-radius:10px; border:1.5px solid ${CI.ink}; font-weight:800; font-size:14px; cursor:pointer; box-shadow:2px 2px 0 ${CI.ink}; }
    .btn:active { transform:translate(1px,1px); box-shadow:1px 1px 0 ${CI.ink}; }
    .btn-p { background:${CI.milpa}; color:${CI.papel}; }
    .btn-g { background:${CI.campo}; color:${CI.ink}; }
    .btn-a { background:${CI.maiz}; color:${CI.ink}; }
    .btn-block { width:100%; display:block; }
    .row { display:flex; gap:8px; margin-top:10px; }
    .muted { color:${CI.muted}; font-size:12.5px; }
    .big { font-family:Georgia,serif; font-size:40px; margin:6px 0 0; }
    .rgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin:14px 0; }
    .rs { background:${CI.track}; border:1px solid ${CI.linea}; border-radius:10px; padding:10px 6px; }
    .rs .n { font-weight:800; font-size:19px; } .rs .l { font-size:11px; color:${CI.muted}; }
    .foot { text-align:center; margin-top:22px; }
    .link { background:none; border:none; color:${CI.muted}; text-decoration:underline; font-size:12px; cursor:pointer; }
    @media (prefers-reduced-motion: no-preference) { .card { transition: box-shadow .15s ease; } }
    /* Fase 11: pulido transversal de TODOS los sliders (input range) de una sola vez.
       Thumb personalizado con transición suave y leve crecimiento al presionar. */
    input[type="range"] { -webkit-appearance:none; appearance:none; height:6px; border-radius:6px;
      background:${CI.linea}; outline:none; cursor:pointer; }
    input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:20px; height:20px;
      border-radius:50%; background:${CI.milpa}; border:2.5px solid ${CI.papel2}; box-shadow:0 1px 4px rgba(0,0,0,.25);
      cursor:pointer; }
    input[type="range"]::-moz-range-thumb { width:20px; height:20px; border-radius:50%; background:${CI.milpa};
      border:2.5px solid ${CI.papel2}; box-shadow:0 1px 4px rgba(0,0,0,.25); cursor:pointer; }
    @media (prefers-reduced-motion: no-preference) {
      input[type="range"]::-webkit-slider-thumb { transition: transform .12s ease, box-shadow .12s ease; }
      input[type="range"]:active::-webkit-slider-thumb { transform: scale(1.3); box-shadow:0 2px 8px rgba(0,0,0,.35); }
      input[type="range"]::-moz-range-thumb { transition: transform .12s ease; }
      input[type="range"]:active::-moz-range-thumb { transform: scale(1.3); }
    }
  `;

  const colorDom = (d, dominado) => (dominado ? CI.maiz : d >= 75 ? CI.milpa : d >= 40 ? "#6FA05C" : d > 0 ? "#B08650" : CI.linea);

  const encabezado = (
    <div className="ent-header">
      <div className="ent-brand">
        <div className="ent-logo">✦</div>
        <div>
          <h1>Entrenamático</h1>
          <small>{MAT.eje}</small>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div className="pill"><span>🌱</span>{prog.racha}</div>
        <div className="pill"><span>◆</span>{prog.xp} XP</div>
        <button aria-label="Ajustes" className="pill" style={{ cursor: "pointer", fontSize: 16, padding: "4px 9px" }} onClick={() => setShowSettings(true)}>⚙️</button>
      </div>
    </div>
  );

  const panelSettings = showSettings && (
    <div onClick={() => setShowSettings(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 50, padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 420, width: "100%", marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <p className="eyebrow" style={{ margin: 0 }}>⚙️ Ajustes</p>
          <button className="tab" style={{ flex: "none", padding: "4px 10px" }} onClick={() => setShowSettings(false)}>Cerrar ✕</button>
        </div>

        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: CI.muted, textTransform: "uppercase", margin: "14px 0 8px" }}>Tema visual</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {Object.keys(TEMAS).map((id) => {
            const ov = { ...{ papel: "#F6F1E3", papel2: "#FFFDF6", ink: "#2E2A21", milpa: "#3D6B35" }, ...TEMAS[id].overrides };
            return (
              <button key={id} onClick={() => cambiarTema(id)} style={{ cursor: "pointer", border: `2.5px solid ${tema === id ? CI.milpa : CI.linea}`, borderRadius: 10, padding: 0, overflow: "hidden", background: ov.papel }}>
                <div style={{ height: 42, background: ov.papel, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: ov.milpa, border: `1px solid ${ov.ink}` }} />
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: ov.papel2, border: `1px solid ${ov.ink}` }} />
                </div>
                <div style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 3px", background: CI.campo, color: CI.ink, borderTop: `1px solid ${CI.linea}` }}>{TEMAS[id].nombre}</div>
              </button>
            );
          })}
        </div>

        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, color: CI.muted, textTransform: "uppercase", margin: "18px 0 8px" }}>Tamaño de texto</p>
        <div style={{ display: "flex", gap: 8 }}>
          {[["Chico", 0.9], ["Normal", 1], ["Grande", 1.15]].map(([lab, val]) => (
            <button key={lab} className={`tab ${escala === val ? "on" : ""}`} onClick={() => cambiarEscala(val)}>{lab}</button>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 11.5, marginTop: 16, lineHeight: 1.5 }}>Estas preferencias se guardan en este dispositivo. Build {BUILD}.</p>
      </div>
    </div>
  );

  // ---------------- render ----------------
  return (
    <div className="ent-root" style={{ fontSize: `${escala * 100}%` }}>
      <style>{css}</style>
      {panelSettings}
      <div className="ent-wrap">
        {encabezado}

        {vista === "inicio" && (
          <>
            <div className="area-tabs" role="tablist" aria-label="Área de conocimiento">
              <button role="tab" aria-selected={areaActiva === "mate"} className={`area-tab ${areaActiva === "mate" ? "on" : ""}`} onClick={() => cambiarArea("mate")}>
                📐 Matemáticas
              </button>
              <button role="tab" aria-selected={areaActiva === "cneyt"} className={`area-tab ${areaActiva === "cneyt" ? "on" : ""}`} onClick={() => cambiarArea("cneyt")}>
                🔬 CNEyT
              </button>
            </div>
            <div className="tabs" role="tablist" aria-label="Semestre">
              {Object.keys(MATERIAS).filter((mid) => MATERIAS[mid].area === areaActiva).map((mid) => (
                <button key={mid} role="tab" aria-selected={mid === matId} className={`tab ${mid === matId ? "on" : ""}`} onClick={() => cambiarMateria(mid)}>
                  {MATERIAS[mid].corto}
                </button>
              ))}
            </div>

            <div className="card">
              <div className="hero">
                <Milpa racha={prog.racha} />
                <div style={{ flex: 1 }}>
                  <p className="hero-rango">{rango}</p>
                  <p className="hero-sub">Nivel {nivelGlobal} · {prog.totalCorrectas} aciertos en total</p>
                  <div className="lvl-track"><div className="lvl-fill" style={{ width: `${((prog.xp % XP_POR_NIVEL) / XP_POR_NIVEL) * 100}%` }} /></div>
                  <p className="muted" style={{ marginTop: 5 }}>{XP_POR_NIVEL - (prog.xp % XP_POR_NIVEL)} XP para el nivel {nivelGlobal + 1}</p>
                </div>
              </div>
            </div>

            {estadoMat.diagnostico === "pendiente" && (
              <div className="card" style={{ borderColor: CI.ink, background: "#FDF6E0" }}>
                <p className="prop-tit" style={{ fontSize: 15 }}>📋 Diagnóstico inicial de {MAT.corto}</p>
                <p className="muted" style={{ margin: "6px 0 10px" }}>
                  {MAT.propositos.length} preguntas rápidas, una por propósito, para saber de dónde partes.
                  Así el Entrenamático te recomienda por dónde empezar — sin adivinar tu nivel por el semestre.
                </p>
                <div className="row">
                  <button className="btn btn-a" style={{ flex: 2 }} onClick={iniciarDiagnostico}>Hacer diagnóstico</button>
                  <button className="btn btn-g" style={{ flex: 1 }} onClick={omitirDiagnostico}>Ahora no</button>
                </div>
              </div>
            )}

            {debil && (estadoMat.props[debil.code]?.vistas ?? 0) > 0 && (
              <button className="prop-btn" style={{ borderColor: CI.maiz, background: "#FDF6E0" }} onClick={() => iniciarPractica(debil)}>
                <div className="prop-ico" style={{ background: CI.maiz }}>{debil.icono}</div>
                <div style={{ flex: 1 }}>
                  <p className="prop-tit">Practica lo que más te cuesta</p>
                  <p className="prop-desc">Recomendado: {debil.titulo} · dominio {estadoMat.props[debil.code]?.conf ?? 0}%</p>
                </div>
                <span style={{ fontSize: 20, color: "#B08650" }}>→</span>
              </button>
            )}

            <div className="eyebrow">Elige un propósito · {MAT.nombre}</div>
            {MAT.propositos.map((pr) => {
              const st = estadoMat.props[pr.code] || propVacio();
              const fl = fluidez(st);
              return (
                <div key={pr.code} className="prop-btn" style={{ cursor: "default", flexWrap: "wrap" }}>
                  <div className="prop-ico" style={{ background: colorDom(st.conf, st.dominado), color: st.conf > 0 ? CI.papel : CI.inkSoft, cursor: "pointer" }} onClick={() => iniciarPractica(pr)}>{pr.icono}</div>
                  <div style={{ flex: 1, minWidth: 180, cursor: "pointer" }} onClick={() => iniciarPractica(pr)}>
                    <p className="prop-tit">
                      {pr.titulo}
                      <span className="chip">Parcial {pr.parcial}</span>
                      {pr.extra && <span className="chip" style={{ background: CI.maizS, borderColor: "#B08650", color: "#8a6a2f" }}>➕ complementario</span>}
                      {pr.interactivo && <span className="chip" style={{ background: "#E7ECF3", borderColor: CI.azul, color: CI.azul }}>✦ interactivo</span>}
                      {st.dominado && <span className="chip dom">🌽 Dominado</span>}
                      {fl && !st.dominado && <span className="chip">{fl.em} {fl.label}</span>}
                    </p>
                    <p className="prop-desc">{pr.desc}</p>
                    <div className="dom-track"><div className="dom-fill" style={{ width: `${st.conf}%`, background: colorDom(st.conf, st.dominado) }} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 6, width: "100%", marginTop: 4, flexWrap: "wrap" }}>
                    {pr.interactivo && (
                      <button className="tab" style={{ flex: 1, minWidth: 90, padding: "7px", fontSize: 12.5 }} onClick={() => iniciarAprender(pr)}>Aprender ✦</button>
                    )}
                    <button className="tab on" style={{ flex: 1, minWidth: 90, padding: "7px", fontSize: 12.5 }} onClick={() => iniciarPractica(pr)}>Practicar →</button>
                  </div>
                </div>
              );
            })}

            {CASOS_REALES[matId] && CASOS_REALES[matId].length > 0 && (
              <button className="prop-btn" style={{ borderColor: "#B08650", background: CI.maizS, cursor: "pointer" }} onClick={() => setVista("casos")}>
                <div className="prop-ico" style={{ background: "#B08650", color: CI.papel }}>🌎</div>
                <div style={{ flex: 1 }}>
                  <p className="prop-tit">Casos reales</p>
                  <p className="prop-desc">Situaciones cotidianas resueltas con lo que aprendiste en {MAT.corto} — {CASOS_REALES[matId].length} caso{CASOS_REALES[matId].length > 1 ? "s" : ""}</p>
                </div>
              </button>
            )}

            <button className="prop-btn" style={{ borderColor: CI.azul, background: "#E6F1FB", cursor: "pointer" }} onClick={() => setVista("herramientas")}>
              <div className="prop-ico" style={{ background: CI.azul, color: CI.papel }}>🧮</div>
              <div style={{ flex: 1 }}>
                <p className="prop-tit">Herramientas</p>
                <p className="prop-desc">Calculadora científica y graficador de funciones, con atajos para {MAT.corto}</p>
              </div>
            </button>

            <p className="muted" style={{ marginTop: 14, textAlign: "center" }}>
              📓 Este Entrenamático acompaña tu <b>{MAT.cuadernillo}</b>: si un tema se te resiste,
              ahí están los ejemplos resueltos paso a paso. Aquí, la práctica es ilimitada.
            </p>
            <div className="foot"><button className="link" onClick={reiniciar}>Reiniciar todo mi progreso</button></div>
          </>
        )}

        {vista === "casos" && (
          <>
            <div className="card">
              <p className="eyebrow" style={{ margin: "0 0 4px" }}>Casos reales · {MAT.nombre}</p>
              <p className="muted" style={{ margin: "0 0 4px" }}>Donde la matemática deja de ser ejercicio y se vuelve decisión real.</p>
            </div>
            {(CASOS_REALES[matId] || []).map((c, i) => <CasoCard key={i} c={c} />)}
            <button className="btn btn-g btn-block" onClick={() => setVista("inicio")}>← Volver a los propósitos</button>
          </>
        )}

        {vista === "herramientas" && (
          <>
            <div className="card">
              <p className="eyebrow" style={{ margin: "0 0 4px" }}>Herramientas · {MAT.nombre}</p>
              <p className="muted" style={{ margin: "0 0 4px" }}>Para resolver, comprobar o explorar — no reemplazan aprender el procedimiento.</p>
            </div>
            <div className="tabs" role="tablist" style={{ marginBottom: 12 }}>
              <button role="tab" aria-selected={subHerramienta === "calculadora"} className={`tab ${subHerramienta === "calculadora" ? "on" : ""}`} onClick={() => setSubHerramienta("calculadora")}>🧮 Calculadora</button>
              <button role="tab" aria-selected={subHerramienta === "graficador"} className={`tab ${subHerramienta === "graficador" ? "on" : ""}`} onClick={() => setSubHerramienta("graficador")}>📈 Graficador</button>
              <button role="tab" aria-selected={subHerramienta === "resolvedor"} className={`tab ${subHerramienta === "resolvedor" ? "on" : ""}`} onClick={() => setSubHerramienta("resolvedor")}>🧩 Resolvedor</button>
              <button role="tab" aria-selected={subHerramienta === "glosario"} className={`tab ${subHerramienta === "glosario" ? "on" : ""}`} onClick={() => setSubHerramienta("glosario")}>📖 Glosario</button>
            </div>
            <div className="card">
              {subHerramienta === "calculadora" ? <CalculadoraCientifica matId={matId} /> : subHerramienta === "graficador" ? <GraficadorFunciones matId={matId} /> : subHerramienta === "resolvedor" ? <Resolvedor matId={matId} /> : <GlosarioSimbolos matId={matId} />}
            </div>
            <button className="btn btn-g btn-block" onClick={() => setVista("inicio")}>← Volver a los propósitos</button>
          </>
        )}

        {vista === "diagnostico" && pregunta && (
          <>
            <div className="card">
              <p className="eyebrow" style={{ margin: "0 0 6px" }}>Diagnóstico · pregunta {diag.idx + 1} de {MAT.propositos.length}</p>
              <p className="muted" style={{ margin: "0 0 4px" }}>{MAT.propositos[diag.idx].titulo}</p>
              <p className="q-text">{pregunta.texto}</p>
              {pregunta.plot && <PlotSVG spec={pregunta.plot} />}
              {pregunta.opciones.map((op, i) => (
                <button key={i} className={`opt ${elegida !== null ? (i === pregunta.correcta ? "ok" : i === elegida ? "no" : "dim") : ""}`} onClick={() => responderDiag(i)}>
                  <b style={{ marginRight: 8 }}>{String.fromCharCode(65 + i)})</b>{op}
                </button>
              ))}
              {elegida !== null && (
                <div className={`fb ${elegida === pregunta.correcta ? "ok" : "no"}`}>
                  <b>{elegida === pregunta.correcta ? "Correcto. " : "Aún no. "}</b>{pregunta.explica}
                </div>
              )}
              <div className="row">
                {elegida !== null
                  ? <button className="btn btn-p btn-block" onClick={siguienteDiag}>{diag.idx + 1 < MAT.propositos.length ? "Siguiente →" : "Ver mi mapa →"}</button>
                  : <div className="muted" style={{ padding: "8px 2px" }}>Elige una respuesta (sin presión: esto solo ubica tu punto de partida)</div>}
              </div>
            </div>
          </>
        )}

        {vista === "mapaDiag" && (
          <>
            <div className="card" style={{ textAlign: "center" }}>
              <p className="hero-rango" style={{ fontSize: 20 }}>Tu mapa de partida</p>
              <p className="muted">Verde: vas bien. Barro: por ahí conviene empezar.</p>
            </div>
            {MAT.propositos.map((pr) => {
              const r = diag?.resultados.find((x) => x.code === pr.code);
              return (
                <div key={pr.code} className="prop-btn" style={{ cursor: "default" }}>
                  <div className="prop-ico" style={{ background: r?.ok ? CI.milpa : "#B08650", color: CI.papel }}>{pr.icono}</div>
                  <div style={{ flex: 1 }}>
                    <p className="prop-tit">{pr.titulo} {r?.ok ? "✓" : "· para empezar aquí"}</p>
                    <p className="prop-desc">{r?.ok ? "Buen punto de partida" : `Repasa el ejemplo resuelto en tu ${MAT.cuadernillo} y practica aquí`}</p>
                  </div>
                </div>
              );
            })}
            <button className="btn btn-p btn-block" style={{ marginTop: 8 }} onClick={() => setVista("inicio")}>Empezar a entrenar</button>
          </>
        )}

        {vista === "aprender" && propActivo && (() => {
          const Comp = INTERACTIVOS[propActivo.interactivo];
          return (
            <>
              <div className="card">
                <p className="eyebrow" style={{ margin: "0 0 6px" }}>Aprender · {propActivo.titulo}</p>
                <p style={{ margin: "0 0 12px", fontSize: 14, color: CI.inkSoft }}>{propActivo.desc}</p>
                <div style={{ background: "#E7ECF3", borderLeft: "4px solid #355070", borderRadius: 8, padding: "11px 13px", marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: CI.azul, marginBottom: 4 }}>¿Por qué funciona?</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55, color: CI.ink }}>{PORQUE_INTERACTIVO[propActivo.interactivo]}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: CI.muted, marginBottom: 8 }}>Interactivo — muévelo</div>
                {Comp ? <Comp /> : <p className="muted">Interactivo no disponible.</p>}
              </div>
              <PanelResolvedorEmbebido matId={matId} propActivo={propActivo} ejemploResolvedorEmbebido={ejemploResolvedorEmbebido} onGuiado={() => iniciarGuiado(propActivo)} />
              <div className="row">
                <button className="btn btn-p btn-block" onClick={() => iniciarPractica(propActivo)}>Ya lo entendí — practicar →</button>
              </div>
              <button className="btn btn-g btn-block" onClick={() => setVista("inicio")}>Volver a los propósitos</button>
              <p className="muted" style={{ marginTop: 10, textAlign: "center", fontSize: 12 }}>
                📓 Este interactivo es la misma figura de tu <b>{MAT.cuadernillo}</b>, aquí en vivo.
              </p>
            </>
          );
        })()}

        {vista === "guiado" && propActivo && guiado && (() => {
          const { ejemplo, intento, fase, elegida, verDesg } = guiado;
          const responderGuiado = (i) => { if (elegida === null) { setGuiado((g) => ({ ...g, elegida: i })); if (intento && i === intento.q.correcta) festejar("acierto"); } };
          return (
            <>
              <div className="card">
                <p className="eyebrow" style={{ margin: "0 0 2px" }}>Práctica guiada · {propActivo.titulo}</p>
                <p className="muted" style={{ margin: "0 0 12px", fontSize: 12.5 }}>Primero mira un ejemplo resuelto; luego intentas uno igual. Así se aprende un procedimiento nuevo con menos esfuerzo.</p>

                {/* FASE 1: EJEMPLO RESUELTO */}
                <div style={{ background: "#E7ECF3", borderLeft: "4px solid #355070", borderRadius: 8, padding: "11px 13px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: CI.azul, marginBottom: 4 }}>1 · Ejemplo resuelto — obsérvalo</div>
                  <div style={{ fontSize: 14, color: CI.ink, fontWeight: 700 }}>{ejemplo?.q.texto}</div>
                </div>
                {ejemplo ? <DesglosePasos resultado={ejemplo.desg} /> : <p className="muted">No se pudo generar el ejemplo.</p>}

                {/* FASE 2: AHORA TÚ */}
                {fase === "ejemplo" ? (
                  <button className="btn btn-p btn-block" style={{ marginTop: 14 }} onClick={() => setGuiado((g) => ({ ...g, fase: "intento" }))}>Ya lo vi — ahora yo →</button>
                ) : (
                  <div style={{ marginTop: 16, borderTop: "2px dashed #cabf9d", paddingTop: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: CI.milpa, marginBottom: 8 }}>2 · Ahora tú — mismo tipo, otros números</div>
                    {intento ? (
                      <>
                        <p className="q-text" style={{ marginTop: 0 }}>{intento.q.texto}</p>
                        {intento.q.opciones.map((op, i) => (
                          <button key={i} className={`opt ${elegida !== null ? (i === intento.q.correcta ? "ok" : i === elegida ? "no" : "dim") : ""}`} onClick={() => responderGuiado(i)}>
                            <b style={{ marginRight: 8 }}>{String.fromCharCode(65 + i)})</b>{op}
                          </button>
                        ))}
                        {elegida !== null && (
                          <div className={`fb ${elegida === intento.q.correcta ? "ok" : "no"}`}>
                            <b>{elegida === intento.q.correcta ? "¡Correcto! " : "Revisa esto: "}</b>{intento.q.explica}
                          </div>
                        )}
                        {elegida !== null && !verDesg && (
                          <button className="tab" style={{ marginTop: 10, padding: "6px 12px", fontSize: 12.5 }} onClick={() => setGuiado((g) => ({ ...g, verDesg: true }))}>🧩 Ver este resuelto paso a paso</button>
                        )}
                        {verDesg && (
                          <div style={{ background: CI.papel2, border: "1.5px solid #2E2A21", borderRadius: 12, padding: 14, marginTop: 10 }}>
                            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.azul, textTransform: "uppercase" }}>Cómo se resolvía</p>
                            <DesglosePasos resultado={intento.desg} />
                          </div>
                        )}
                      </>
                    ) : <p className="muted">No se pudo generar el problema.</p>}
                  </div>
                )}
              </div>
              <div className="row">
                <button className="btn btn-p btn-block" onClick={() => nuevoParGuiado(propActivo)}>↺ Otro par (ejemplo + problema)</button>
              </div>
              <button className="btn btn-g btn-block" onClick={() => setVista("inicio")}>Volver a los propósitos</button>
            </>
          );
        })()}

        {vista === "practica" && pregunta && propActivo && !avisoDominio && (
          <>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <p className="eyebrow" style={{ margin: 0 }}>{propActivo.titulo}</p>
                <span className="chip">Nivel: {NOMBRE_NIVEL[pregunta._nivel]}</span>
              </div>
              <p className="q-text">{pregunta.texto}</p>
              {pregunta.plot && <PlotSVG spec={pregunta.plot} />}
              {pregunta.opciones.map((op, i) => (
                <button key={i} className={`opt ${elegida !== null ? (i === pregunta.correcta ? "ok" : i === elegida ? "no" : "dim") : ""}`} onClick={() => responder(i)}>
                  <b style={{ marginRight: 8 }}>{String.fromCharCode(65 + i)})</b>{op}
                </button>
              ))}
              {elegida !== null && (
                <div className={`fb ${elegida === pregunta.correcta ? "ok" : "no"}`}>
                  <b>{elegida === pregunta.correcta ? "¡Correcto! " : "Revisa esto: "}</b>{pregunta.explica}
                  {ultimoMs !== null && <span className="muted" style={{ display: "block", marginTop: 5 }}>⏱ {Math.round(ultimoMs / 1000)} s — la fluidez también cuenta: dominar es acertar <i>y</i> hacerlo con soltura.</span>}
                  {elegida !== pregunta.correcta && (
                    <span className="fb-cuad">📓 Consejo: abre tu <b>{MAT.cuadernillo}</b> en el propósito "{propActivo.titulo}" y sigue el ejemplo resuelto paso a paso antes de la siguiente.</span>
                  )}
                </div>
              )}
              {elegida !== null && tieneDesglose(matId, propActivo.code) && (() => {
                const desg = resolverInline(matId, propActivo.code, pregunta.texto);
                if (!desg) return null; // la variante de esta pregunta no es desglosable: no se muestra nada
                return (
                  <div style={{ marginTop: 10 }}>
                    {!verDesglose ? (
                      <button className="btn btn-a btn-block" onClick={() => setVerDesglose(true)}>🧩 Ver este ejercicio paso a paso</button>
                    ) : (
                      <div style={{ background: CI.papel2, border: "1.5px solid #2E2A21", borderRadius: 12, padding: 14 }}>
                        <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: CI.azul, textTransform: "uppercase" }}>Resuelto paso a paso</p>
                        <DesglosePasos resultado={desg} />
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="row">
                {elegida !== null
                  ? <button className="btn btn-p btn-block" onClick={siguiente}>Siguiente →</button>
                  : <div className="muted" style={{ padding: "8px 2px" }}>Elige una respuesta</div>}
              </div>
            </div>
            <button className="btn btn-g btn-block" onClick={terminarSesion}>Terminar sesión</button>
          </>
        )}

        {vista === "practica" && avisoDominio && (
          <div className="card" style={{ textAlign: "center", background: "#FDF6E0" }}>
            <div style={{ fontSize: 40 }}>🌽</div>
            <p className="hero-rango" style={{ fontSize: 20 }}>¡Dominaste "{propActivo.titulo}"!</p>
            <p className="muted" style={{ maxWidth: 380, margin: "6px auto 12px" }}>
              {CONSEC_DOMINIO}+ aciertos seguidos con confianza alta. Seguir aquí ya es sobre-práctica:
              tu sesión rinde más en otro tema.
            </p>
            {debil && debil.code !== propActivo.code ? (
              <button className="btn btn-a btn-block" onClick={() => { setAvisoDominio(false); iniciarPractica(debil); }}>
                Pasar a "{debil.titulo}" →
              </button>
            ) : (
              <button className="btn btn-a btn-block" onClick={() => { setAvisoDominio(false); setVista("inicio"); }}>
                Elegir otro tema →
              </button>
            )}
            <div className="row">
              <button className="btn btn-g" style={{ flex: 1 }} onClick={() => { setAvisoDominio(false); nuevaPregunta(propActivo); }}>Seguir aquí de todos modos</button>
              <button className="btn btn-g" style={{ flex: 1 }} onClick={() => { setAvisoDominio(false); setVista("resumen"); }}>Terminar sesión</button>
            </div>
          </div>
        )}

        {vista === "resumen" && (
          <>
            <div className="card" style={{ textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center" }}><Milpa racha={prog.racha} /></div>
              <p className="big">{sesion.correctas}/{sesion.resueltas}</p>
              <p className="hero-sub">aciertos en esta sesión</p>
              <div className="rgrid">
                <div className="rs"><div className="n">+{sesion.xpGanado}</div><div className="l">XP ganado</div></div>
                <div className="rs"><div className="n">{prog.racha}</div><div className="l">Racha</div></div>
                <div className="rs"><div className="n">{sesion.resueltas ? Math.round((sesion.correctas / sesion.resueltas) * 100) : 0}%</div><div className="l">Acierto</div></div>
              </div>
              <div className="row">
                {propActivo && !estadoMat.props[propActivo.code]?.dominado && (
                  <button className="btn btn-p" style={{ flex: 1 }} onClick={() => iniciarPractica(propActivo)}>Seguir practicando</button>
                )}
                <button className="btn btn-g" style={{ flex: 1 }} onClick={() => setVista("inicio")}>Volver al inicio</button>
              </div>
            </div>
            <p className="muted" style={{ textAlign: "center" }}>Sesiones cortas y frecuentes rinden más que maratones — 15 a 40 minutos al día bastan. 🌱</p>
          </>
        )}
        <div style={{ textAlign: "center", padding: "18px 0 6px", fontSize: 10.5, color: "#B4A98A", letterSpacing: 0.4 }}>
          Entrenamático · build {BUILD}
        </div>
      </div>
    </div>
  );
}
