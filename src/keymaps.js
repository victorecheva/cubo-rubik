// Distribución "speedcube" (la de csTimer): las dos manos trabajan como en un cubo real.
// Mano derecha: I/K = R/R', J = U, H = F, L = D' ...  Mano izquierda: D/E = L/L', F = U', G = F', S = D ...
export const SPEEDCUBE = {
  KeyI: 'R', KeyK: "R'",
  KeyD: 'L', KeyE: "L'",
  KeyJ: 'U', KeyF: "U'",
  KeyS: 'D', KeyL: "D'",
  KeyH: 'F', KeyG: "F'",
  KeyW: 'B', KeyO: "B'",
  KeyU: 'r', KeyM: "r'",
  KeyV: 'l', KeyR: "l'",
  Comma: 'u', KeyC: "u'",
  KeyZ: 'd', Slash: "d'",
  Digit5: 'M', Digit6: 'M', KeyX: "M'", Period: "M'",
  KeyT: 'x', KeyY: 'x', KeyB: "x'", KeyN: "x'",
  Semicolon: 'y', KeyA: "y'",
  KeyP: 'z', KeyQ: "z'",
};

// Distribución por notación: la letra del movimiento, Shift = sentido antihorario
export const NOTATION_KEYS = {
  KeyU: 'U', KeyD: 'D', KeyR: 'R', KeyL: 'L', KeyF: 'F', KeyB: 'B',
  KeyM: 'M', KeyE: 'E', KeyS: 'S',
  KeyX: 'x', KeyY: 'y', KeyZ: 'z',
};

export const KEYBOARD_ROWS = [
  ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'],
  ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
  ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'],
  ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'],
];

// Etiquetas por defecto para teclado español (se sustituyen por las reales si el navegador lo permite)
const FALLBACK_LABELS = { Semicolon: 'Ñ', Comma: ',', Period: '.', Slash: '-' };

export function defaultLabel(code) {
  if (FALLBACK_LABELS[code]) return FALLBACK_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}
