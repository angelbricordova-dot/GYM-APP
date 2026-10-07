import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { Sheet, Icon, toast } from './kit.js';

const OUT = 256; // lado de la foto de perfil guardada
const MAX_ZOOM = 4;

/**
 * Encuadrar la foto de perfil: se arrastra para mover, se pellizca o se usa el control para acercar.
 * Entrega un JPEG cuadrado (data URL) con lo que se ve dentro del círculo.
 */
export function AvatarCropper({ file, onDone, onClose }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // desplazamiento del centro de la imagen respecto al centro del recuadro
  const box = useRef();
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const [V, setV] = useState(280);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => { toast('No pude leer esa foto', { icon: '⚠️' }); onClose(); };
    im.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => { setV(Math.min(300, Math.max(220, window.innerWidth - 64))); }, []);

  const base = img ? V / Math.min(img.naturalWidth, img.naturalHeight) : 1; // “cubrir” el recuadro
  const s = base * zoom;
  const clamp = (p, z = zoom) => {
    if (!img) return p;
    const sc = base * z;
    const mx = Math.max(0, (img.naturalWidth * sc - V) / 2), my = Math.max(0, (img.naturalHeight * sc - V) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  const setZ = (z) => { const nz = Math.min(MAX_ZOOM, Math.max(1, z)); setZoom(nz); setPos((p) => clamp(p, nz)); };

  const down = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; }
  };
  const move = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      setZ(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.d));
    } else setPos((p) => clamp({ x: p.x + cur.x - prev.x, y: p.y + cur.y - prev.y }));
  };
  const up = (e) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };
  const wheel = (e) => { e.preventDefault(); setZ(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); };
  useEffect(() => { const el = box.current; if (!el) return; el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel); });

  const save = () => {
    const c = document.createElement('canvas');
    c.width = c.height = OUT;
    const g = c.getContext('2d');
    const size = V / s; // lado del recorte en píxeles de la imagen original
    const sx = img.naturalWidth / 2 - pos.x / s - size / 2;
    const sy = img.naturalHeight / 2 - pos.y / s - size / 2;
    g.fillStyle = '#fff'; g.fillRect(0, 0, OUT, OUT);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, size, size, 0, 0, OUT, OUT);
    onDone(c.toDataURL('image/jpeg', 0.85));
  };

  return html`<${Sheet} title="Encuadra tu foto" onClose=${onClose}>
    <div class="crop-wrap">
      <div class="crop-box" ref=${box} style=${`width:${V}px;height:${V}px`} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} aria-label="Arrastra para mover la foto">
        ${img && html`<img src=${img.src} alt="" draggable="false" style=${`width:${img.naturalWidth * s}px;height:${img.naturalHeight * s}px;transform:translate(calc(-50% + ${pos.x}px),calc(-50% + ${pos.y}px))`} />`}
        <div class="crop-mask"></div>
      </div>
      <p class="muted small center">Arrastra para mover · pellizca o usa el control para acercar</p>
      <div class="crop-zoom"><${Icon} name="minus" size=${16} /><input type="range" min="1" max=${MAX_ZOOM} step="0.01" value=${zoom} onInput=${(e) => setZ(Number(e.target.value))} aria-label="Acercar" /><${Icon} name="plus" size=${16} /></div>
      <button class="btn primary block lg" disabled=${!img} onClick=${save}>Usar esta foto</button>
    </div>
  <//>`;
}
