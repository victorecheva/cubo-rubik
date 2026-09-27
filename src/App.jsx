import { useCallback, useEffect, useRef, useState } from 'react';
import { RubikCube, moveFromNotation } from './cube/RubikCube.js';
import { SPEEDCUBE, NOTATION_KEYS, KEYBOARD_ROWS, defaultLabel } from './keymaps.js';

const parseMove = (str) => moveFromNotation(str[0], str.endsWith("'"));

function loadLayout() {
  try {
    return localStorage.getItem('rubik-layout') || 'speedcube';
  } catch {
    return 'speedcube';
  }
}

// Flechas: giran el cubo entero
const ARROW_MOVES = {
  ArrowLeft: ['y', false],
  ArrowRight: ['y', true],
  ArrowUp: ['x', false],
  ArrowDown: ['x', true],
};

function formatTime(ms) {
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const s = Math.floor(totalCs / 100) % 60;
  const m = Math.floor(totalCs / 6000);
  const pad = (n) => String(n).padStart(2, '0');
  return m > 0 ? `${m}:${pad(s)}.${pad(cs)}` : `${s}.${pad(cs)}`;
}

export default function App() {
  const mountRef = useRef(null);
  const cubeRef = useRef(null);

  const [state, setState] = useState({ moves: 0, lastMoves: [], locked: false, solved: true, canUndo: false });
  const [showHelp, setShowHelp] = useState(true);
  const [banner, setBanner] = useState(null);
  const [layout, setLayout] = useState(loadLayout);
  const [labels, setLabels] = useState({});

  useEffect(() => {
    try {
      localStorage.setItem('rubik-layout', layout);
    } catch {}
  }, [layout]);

  // Etiquetas reales de las teclas según el teclado del usuario (Chrome/Edge)
  useEffect(() => {
    navigator.keyboard?.getLayoutMap?.().then((map) => {
      const l = {};
      map.forEach((v, k) => (l[k] = v.toUpperCase()));
      setLabels(l);
    }).catch(() => {});
  }, []);
  const keyLabel = (code) => labels[code] || defaultLabel(code);

  // ---- Timer ----
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const movesAtStartRef = useRef(0);

  const stopTimer = useCallback(() => {
    if (!runningRef.current) return null;
    cancelAnimationFrame(rafRef.current);
    runningRef.current = false;
    const final = performance.now() - startRef.current;
    setElapsed(final);
    setRunning(false);
    return final;
  }, []);

  const startTimer = useCallback(() => {
    startRef.current = performance.now();
    runningRef.current = true;
    movesAtStartRef.current = cubeRef.current?.userMoves ?? 0;
    setRunning(true);
    setBanner(null);
    const loop = () => {
      setElapsed(performance.now() - startRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const toggleTimer = useCallback(() => {
    if (runningRef.current) stopTimer();
    else startTimer();
  }, [startTimer, stopTimer]);

  const resetTimer = useCallback(() => {
    stopTimer();
    setElapsed(0);
  }, [stopTimer]);

  // ---- Cubo ----
  useEffect(() => {
    const cube = new RubikCube(mountRef.current, {
      onChange: (s) => {
        setState((prev) => ({ ...prev, ...s, solved: s.solved ?? prev.solved }));
        // Parada automática del timer al resolver el cubo a mano
        if (s.settled && s.byUser && s.solved && runningRef.current) {
          const time = stopTimer();
          setBanner({ time, moves: s.moves - movesAtStartRef.current });
        }
      },
    });
    cubeRef.current = cube;
    return () => {
      cube.dispose();
      cubeRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, [stopTimer]);

  const scramble = useCallback(() => {
    resetTimer();
    setBanner(null);
    cubeRef.current?.scramble();
  }, [resetTimer]);

  const solve = useCallback(() => {
    stopTimer();
    setBanner(null);
    cubeRef.current?.solve();
  }, [stopTimer]);

  const undo = useCallback(() => cubeRef.current?.undo(), []);

  // ---- Teclado ----
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const cube = cubeRef.current;
      if (!cube) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) toggleTimer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === 'Backspace') {
        e.preventDefault();
        undo();
      } else if (ARROW_MOVES[e.code]) {
        e.preventDefault();
        const [name, prime] = ARROW_MOVES[e.code];
        cube.move(moveFromNotation(name, prime));
      } else if (layout === 'speedcube' && SPEEDCUBE[e.code]) {
        e.preventDefault();
        cube.move(parseMove(SPEEDCUBE[e.code]));
      } else if (layout === 'notation' && NOTATION_KEYS[e.code]) {
        e.preventDefault();
        cube.move(moveFromNotation(NOTATION_KEYS[e.code], e.shiftKey));
      } else if (e.code === 'Enter') {
        e.preventDefault();
        scramble();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        solve();
      } else if (e.code === 'Home') {
        e.preventDefault();
        cube.resetView();
      } else if (e.code === 'F1') {
        e.preventDefault();
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleTimer, undo, scramble, solve, layout]);

  // Evita que un botón con foco se "pulse" con la barra espaciadora
  const click = (fn) => (e) => {
    e.currentTarget.blur();
    fn();
  };

  return (
    <div className="app">
      <div className="stage" ref={mountRef} />

      <header className="topbar">
        <h1>Cubo de Rubik</h1>
        <div className="stats">
          <span className="stat"><b>{state.moves}</b> movimientos</span>
          <span className={`badge ${state.solved ? 'ok' : ''}`}>
            {state.locked ? 'Girando…' : state.solved ? 'Resuelto' : 'Sin resolver'}
          </span>
        </div>
      </header>

      <div className={`timer ${running ? 'running' : ''}`}>{formatTime(elapsed)}</div>

      {banner && (
        <div className="banner" onClick={() => setBanner(null)}>
          ¡Resuelto en <b>{formatTime(banner.time)}</b> con <b>{banner.moves}</b> movimientos!
        </div>
      )}

      <div className="last-moves">
        {state.lastMoves.map((m, i) => (
          <span key={i} className="chip">{m}</span>
        ))}
      </div>

      <div className="controls">
        <button className={`btn timer-btn ${running ? 'active' : ''}`} onClick={click(toggleTimer)}>
          {running ? 'Parar' : 'Timer'} <kbd>Espacio</kbd>
        </button>
        <button className="btn" onClick={click(scramble)} disabled={state.locked}>
          Mezclar <kbd>Enter</kbd>
        </button>
        <button className="btn" onClick={click(solve)} disabled={state.locked}>
          Resolver <kbd>Esc</kbd>
        </button>
        <button className="btn ghost" onClick={click(undo)} disabled={!state.canUndo}>
          Deshacer <kbd>⌫</kbd>
        </button>
      </div>

      <button className="help-toggle" onClick={click(() => setShowHelp((v) => !v))}>
        {showHelp ? '×' : '?'}
      </button>

      {showHelp && (
        <aside className="help">
          <h2>Controles</h2>
          <h3>Ratón / táctil</h3>
          <ul>
            <li>Arrastra sobre una pieza para girar esa capa</li>
            <li>Arrastra fuera del cubo para girar la vista</li>
          </ul>

          <h3>Teclado</h3>
          <div className="layout-switch">
            <button className={layout === 'speedcube' ? 'on' : ''} onClick={click(() => setLayout('speedcube'))}>
              Speedcube
            </button>
            <button className={layout === 'notation' ? 'on' : ''} onClick={click(() => setLayout('notation'))}>
              Notación
            </button>
          </div>

          {layout === 'speedcube' ? (
            <>
              <div className="keyboard">
                {KEYBOARD_ROWS.map((row, r) => (
                  <div key={r} className={`krow r${r}`}>
                    {row.map((code) => {
                      const mv = SPEEDCUBE[code];
                      return (
                        <div key={code} className={`key ${mv ? 'kind-' + mv[0] : 'empty'}`}>
                          <span className="klabel">{keyLabel(code)}</span>
                          {mv && <span className="kmove">{mv}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="tip">
                Índices: <kbd>{keyLabel('KeyJ')}</kbd> U · <kbd>{keyLabel('KeyF')}</kbd> U′ — corazón:{' '}
                <kbd>{keyLabel('KeyI')}</kbd> R · <kbd>{keyLabel('KeyK')}</kbd> R′ — el sexy move es{' '}
                <kbd>{keyLabel('KeyI')}</kbd><kbd>{keyLabel('KeyJ')}</kbd><kbd>{keyLabel('KeyK')}</kbd><kbd>{keyLabel('KeyF')}</kbd>
              </p>
            </>
          ) : (
            <ul>
              <li><kbd>U</kbd><kbd>D</kbd><kbd>R</kbd><kbd>L</kbd><kbd>F</kbd><kbd>B</kbd> caras</li>
              <li><kbd>M</kbd><kbd>E</kbd><kbd>S</kbd> capas centrales</li>
              <li><kbd>X</kbd><kbd>Y</kbd><kbd>Z</kbd> girar cubo</li>
              <li><kbd>Shift</kbd> + tecla: sentido antihorario (′)</li>
            </ul>
          )}

          <ul className="extra">
            <li>Flechas: girar el cubo entero</li>
            <li><kbd>Espacio</kbd> timer · <kbd>⌫</kbd> deshacer</li>
            <li><kbd>Inicio</kbd> centrar vista · <kbd>F1</kbd> ayuda</li>
          </ul>
        </aside>
      )}
    </div>
  );
}
