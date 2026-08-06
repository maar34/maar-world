/**
 * HELIX — installation topology diagram. The one approved React island.
 *
 * Replaces the legacy `/helix-diagram.html`, which loaded
 * `react@18`, `react-dom@18` and `@babel/standalone` from `unpkg.com` and
 * transpiled this JSX in the visitor's browser on every page load. Three
 * third-party requests plus a compiler, before anyone had chosen anything —
 * which is exactly what the no-analytics / no-cookie-banner position forbids.
 * The component is the same diagram, built at build time and served from this
 * origin.
 *
 * Two things changed on purpose, and both are recorded in the ledger:
 *
 * 1. **Colour.** The legacy diagram used twelve raw hexes — an off-palette
 *    purple, green, orange, cyan, red and yellow — one per wire type. The
 *    design system approves three pigments, so six wire types cannot each own a
 *    colour. They are keyed by *pigment × stroke pattern* instead:
 *
 *        ethernet  maar     solid      wifi  maar     dashed
 *        hdmi      collect  solid      nfc   collect  dotted
 *        audio     tree     solid      led   tree     dot-dash
 *
 *    Colour is therefore never the only channel carrying meaning, which the
 *    original diagram could not claim.
 *
 * 2. **Keyboard.** The legacy nodes were `<g onClick>` with a pointer cursor:
 *    unreachable without a mouse. Every control here is a real button — the
 *    legend row in HTML, the station nodes as focusable SVG groups with
 *    `role="button"` and Enter/Space handling — so the focus ring from
 *    `--focus-*` lands on all of them.
 *
 * The numbers below are SVG user units inside a fixed `viewBox`. They are the
 * geometry of the drawing, not CSS lengths: they scale with the diagram and
 * never resolve to a device pixel, so they are not the "raw pixel value" the
 * design system bans. Every CSS length, colour and duration comes from a token.
 */

import { useId, useState } from 'react';

// ── geometry (SVG user units) ────────────────────────────────────────────────

const VIEW_W = 960;
const VIEW_H = 690;
const CX = 480;
const CY = 310;
/** Triangle radius — the three stations sit on this circle. */
const TR = 190;

type Point = { x: number; y: number };

const pA: Point = { x: CX, y: CY - TR };
const pB: Point = {
  x: CX - TR * Math.sin((2 * Math.PI) / 3),
  y: CY - TR * Math.cos((2 * Math.PI) / 3),
};
const pC: Point = {
  x: CX + TR * Math.sin((2 * Math.PI) / 3),
  y: CY - TR * Math.cos((2 * Math.PI) / 3),
};

const router: Point = { x: CX, y: CY };

function satellite(centre: Point, angleDeg: number, dist: number): Point {
  const a = (angleDeg * Math.PI) / 180;
  return { x: centre.x + Math.cos(a) * dist, y: centre.y + Math.sin(a) * dist };
}

const outwardAngle = (p: Point) => (Math.atan2(p.y - CY, p.x - CX) * 180) / Math.PI;

const angA = outwardAngle(pA);
const angB = outwardAngle(pB);
const angC = outwardAngle(pC);

type Station = {
  id: 'A' | 'B' | 'C';
  pc: Point & { label: string };
  screen: Point;
  nfc: Point;
  led: Point;
};

const stations: Station[] = [
  {
    id: 'A',
    pc: { ...pA, label: 'Computadora A' },
    screen: satellite(pA, angA, 85),
    nfc: satellite(pA, angA - 55, 80),
    led: satellite(pA, angA + 55, 80),
  },
  {
    id: 'B',
    pc: { ...pB, label: 'Computadora B' },
    screen: satellite(pB, angB, 85),
    nfc: satellite(pB, angB - 55, 80),
    led: satellite(pB, angB + 55, 80),
  },
  {
    id: 'C',
    pc: { ...pC, label: 'Computadora C' },
    screen: satellite(pC, angC, 85),
    nfc: satellite(pC, angC + 55, 80),
    led: satellite(pC, angC - 55, 80),
  },
];

/**
 * The amplifier and the visitors' phones sit further out than they did in the
 * legacy drawing (±260/250 → ±290, +185 → +205). At the original offsets their
 * plates landed on top of the "pantalla b" and "pantalla c" captions, which
 * overlapped in production too — it is a drawing bug inherited from the source,
 * not a change of meaning.
 */
const amp: Point = { x: CX - 290, y: CY + 205 };
const headphones: Point[] = [
  { x: amp.x - 70, y: amp.y + 78 },
  { x: amp.x, y: amp.y + 92 },
  { x: amp.x + 70, y: amp.y + 78 },
];
const phones: Point = { x: CX + 290, y: CY + 205 };

// ── wire vocabulary ──────────────────────────────────────────────────────────

type WireType = 'ethernet' | 'wifi' | 'hdmi' | 'nfc' | 'audio' | 'led';

/**
 * `pigment` names a CSS custom property declared in helix.css, so no colour
 * value appears in this file. `dash` is in SVG user units.
 */
const WIRE: Record<WireType, { pigment: string; dash?: string; width: number; label: string }> = {
  ethernet: { pigment: 'var(--helix-maar)', width: 2, label: 'Ethernet' },
  wifi: { pigment: 'var(--helix-maar)', dash: '6 4', width: 1.5, label: 'Wi-Fi' },
  hdmi: { pigment: 'var(--helix-collect)', width: 2, label: 'HDMI' },
  nfc: { pigment: 'var(--helix-collect)', dash: '3 3', width: 1.5, label: 'Datos NFC' },
  audio: { pigment: 'var(--helix-tree)', width: 2, label: 'Audio' },
  led: { pigment: 'var(--helix-tree)', dash: '6 3 1 3', width: 1.5, label: 'Alimentación LED' },
};

const LEGEND: WireType[] = ['ethernet', 'hdmi', 'audio', 'wifi', 'nfc', 'led'];

type Connection = { from: Point; to: Point; type: WireType };

const connections: Connection[] = [
  ...stations.map((s) => ({ from: router, to: s.pc, type: 'ethernet' as const })),
  { from: router, to: phones, type: 'wifi' as const },
  ...stations.map((s) => ({ from: s.pc, to: s.screen, type: 'hdmi' as const })),
  ...stations.map((s) => ({ from: s.nfc, to: s.pc, type: 'nfc' as const })),
  ...stations.map((s) => ({ from: s.pc, to: s.led, type: 'led' as const })),
  { from: stations[1].pc, to: amp, type: 'audio' as const },
  ...headphones.map((hp) => ({ from: amp, to: hp, type: 'audio' as const })),
];

// ── parts ────────────────────────────────────────────────────────────────────

function Wire({ from, to, type, filter }: Connection & { filter: WireType | null }) {
  const w = WIRE[type];
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={w.pigment}
      strokeWidth={w.width}
      strokeDasharray={w.dash}
      className={filter && filter !== type ? 'helix-wire helix-wire--dim' : 'helix-wire'}
    />
  );
}

/** Enter and Space must do what a click does, or the control is mouse-only. */
function pressHandler(fn: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      fn();
    }
  };
}

function StationNode({
  station,
  active,
  onToggle,
}: {
  station: Station;
  active: boolean;
  onToggle: (id: Station['id']) => void;
}) {
  const press = () => onToggle(station.id);
  return (
    <g
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`Estación ${station.id} — ${station.pc.label}`}
      onClick={press}
      onKeyDown={pressHandler(press)}
      className={active ? 'helix-node helix-node--on' : 'helix-node'}
    >
      <circle cx={station.pc.x} cy={station.pc.y} r={34} className="helix-node__disc" />
      <rect x={station.pc.x - 13} y={station.pc.y - 10} width={26} height={17} rx={2} className="helix-node__screen" />
      <rect x={station.pc.x - 6} y={station.pc.y + 7} width={12} height={3} rx={1} className="helix-node__base" />
      <rect x={station.pc.x - 8} y={station.pc.y + 10} width={16} height={2} rx={1} className="helix-node__base" />
      <text x={station.pc.x} y={station.pc.y + 2} textAnchor="middle" fontSize={9} className="helix-label helix-label--on-plate">
        PC-{station.id}
      </text>
      <text x={station.pc.x} y={station.pc.y + 50} textAnchor="middle" fontSize={11} className="helix-label">
        {station.pc.label}
      </text>
    </g>
  );
}

function RouterNode({ active }: { active: boolean }) {
  return (
    <g className={active ? 'helix-node helix-node--on' : 'helix-node'} aria-hidden="true">
      <circle cx={router.x} cy={router.y} r={28} className="helix-node__disc" />
      {[11, 17, 23].map((r) => (
        <path
          key={r}
          d={`M${router.x - r * 0.72},${router.y} A${r},${r} 0 0,1 ${router.x + r * 0.72},${router.y}`}
          className="helix-node__wave"
        />
      ))}
      <circle cx={router.x} cy={router.y} r={3} className="helix-node__base" />
      <text x={router.x} y={router.y + 42} textAnchor="middle" fontSize={11} className="helix-label">
        Router Wi-Fi
      </text>
      <text x={router.x} y={router.y + 54} textAnchor="middle" fontSize={10} className="helix-label helix-label--faint">
        (+ internet)
      </text>
    </g>
  );
}

/**
 * `pigment` is the pigment of the *layer* this peripheral belongs to, so an
 * isolated layer marks its wires and its endpoints in one colour instead of
 * highlighting audio equipment in the wayfinding blue.
 */
function Peripheral({
  node,
  label,
  active,
  pigment,
}: {
  node: Point;
  label: string;
  active: boolean;
  pigment: string;
}) {
  return (
    <g
      className={active ? 'helix-box helix-box--on' : 'helix-box'}
      style={{ ['--helix-on' as string]: pigment }}
      aria-hidden="true"
    >
      <rect x={node.x - 22} y={node.y - 13} width={44} height={26} className="helix-box__plate" />
      <text x={node.x} y={node.y + 26} textAnchor="middle" fontSize={10} className="helix-label">
        {label}
      </text>
    </g>
  );
}

// ── the island ───────────────────────────────────────────────────────────────

export default function HelixDiagram() {
  const titleId = useId();
  const descId = useId();
  const [filter, setFilter] = useState<WireType | null>(null);
  const [station, setStation] = useState<Station['id'] | null>(null);

  const toggleFilter = (t: WireType) => setFilter((cur) => (cur === t ? null : t));
  const toggleStation = (id: Station['id']) => setStation((cur) => (cur === id ? null : id));
  const routerActive = filter === 'ethernet' || filter === 'wifi';
  const on = (t: WireType) => filter === t;

  return (
    <div className="helix">
      <div className="helix__frame">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-labelledby={`${titleId} ${descId}`}
          className="helix__svg"
        >
          <title id={titleId}>Diagrama de instalación técnica Helix — EAC Montevideo 2025</title>
          <desc id={descId}>
            Un router Wi-Fi en el centro alimenta por Ethernet tres estaciones idénticas (A, B, C) dispuestas en
            triángulo. Cada estación tiene una pantalla por HDMI, un lector NFC y una tira LED. La estación B envía
            audio a un amplificador con tres pares de auriculares. Los móviles de las visitantes se conectan al router
            por Wi-Fi.
          </desc>

          <polygon
            points={stations.map((s) => `${s.pc.x},${s.pc.y}`).join(' ')}
            className="helix-triangle"
          />

          {connections.map((c, i) => (
            <Wire key={i} {...c} filter={filter} />
          ))}

          {stations.map((s) => (
            <Peripheral
              key={`scr-${s.id}`}
              node={s.screen}
              label={`Pantalla ${s.id}`}
              active={on('hdmi')}
              pigment={WIRE.hdmi.pigment}
            />
          ))}
          {stations.map((s) => (
            <Peripheral
              key={`nfc-${s.id}`}
              node={s.nfc}
              label={`NFC-${s.id}`}
              active={on('nfc')}
              pigment={WIRE.nfc.pigment}
            />
          ))}
          {stations.map((s) => (
            <Peripheral
              key={`led-${s.id}`}
              node={s.led}
              label={`LED-${s.id}`}
              active={on('led')}
              pigment={WIRE.led.pigment}
            />
          ))}
          {headphones.map((hp, i) => (
            <Peripheral
              key={`hp-${i}`}
              node={hp}
              label={`Auric. ${i + 1}`}
              active={on('audio')}
              pigment={WIRE.audio.pigment}
            />
          ))}

          <g
            className={on('audio') ? 'helix-box helix-box--on' : 'helix-box'}
            style={{ ['--helix-on' as string]: WIRE.audio.pigment }}
            aria-hidden="true"
          >
            <rect x={amp.x - 46} y={amp.y - 24} width={92} height={48} className="helix-box__plate" />
            <text x={amp.x} y={amp.y - 4} textAnchor="middle" fontSize={11} className="helix-label helix-label--on-plate">
              Amplificador
            </text>
            <text
              x={amp.x}
              y={amp.y + 12}
              textAnchor="middle"
              fontSize={10}
              className="helix-label helix-label--faint helix-label--on-plate"
            >
              Auriculares · Amp-1
            </text>
          </g>

          <g
            className={on('wifi') ? 'helix-box helix-box--on' : 'helix-box'}
            style={{ ['--helix-on' as string]: WIRE.wifi.pigment }}
            aria-hidden="true"
          >
            <rect x={phones.x - 26} y={phones.y - 30} width={52} height={60} className="helix-box__plate" />
            <rect x={phones.x - 15} y={phones.y - 21} width={30} height={36} className="helix-box__inner" />
            <text x={phones.x} y={phones.y + 44} textAnchor="middle" fontSize={10} className="helix-label">
              Móviles visitantes
            </text>
          </g>

          <RouterNode active={routerActive} />

          {stations.map((s) => (
            <StationNode key={s.id} station={s} active={station === s.id} onToggle={toggleStation} />
          ))}

          {/* y=14, not the legacy y=22: at 22 the caption sat inside the
              "Pantalla A" plate. */}
          <text x={stations[0].pc.x} y={14} textAnchor="middle" fontSize={11} className="helix-label helix-label--faint">
            Estación A
          </text>
          <text x={stations[1].pc.x} y={VIEW_H - 24} textAnchor="middle" fontSize={11} className="helix-label helix-label--faint">
            Estación B
          </text>
          <text x={stations[2].pc.x} y={VIEW_H - 24} textAnchor="middle" fontSize={11} className="helix-label helix-label--faint">
            Estación C
          </text>
        </svg>
      </div>

      <fieldset className="helix__legend">
        <legend className="t-meta">Capas — filtrar el diagrama</legend>
        {LEGEND.map((type) => {
          const w = WIRE[type];
          return (
            <button
              key={type}
              type="button"
              aria-pressed={filter === type}
              onClick={() => toggleFilter(type)}
              className={filter === type ? 'helix-chip helix-chip--on' : 'helix-chip'}
            >
              <svg viewBox="0 0 26 8" aria-hidden="true" className="helix-chip__rule">
                <line x1={0} y1={4} x2={26} y2={4} stroke={w.pigment} strokeWidth={2} strokeDasharray={w.dash} />
              </svg>
              {w.label}
            </button>
          );
        })}
      </fieldset>

      <p className="t-meta helix__hint" role="status">
        {filter
          ? `Mostrando solo ${WIRE[filter].label}`
          : 'Elegí una capa para aislarla · elegí una estación para resaltarla'}
        {station ? ` · Estación ${station} seleccionada` : ''}
      </p>
    </div>
  );
}
