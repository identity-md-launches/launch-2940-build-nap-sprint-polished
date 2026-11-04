// @ts-check
import { hasArtworkSeed } from './engine.js';
/** @typedef {import('./types').Settlement} Settlement */
/** @param {string} seed */
export function randomFromHash(seed) {
  let a = 2166136261;
  for (let i = 0; i < seed.length; i++) { a ^= seed.charCodeAt(i); a = Math.imul(a, 16777619); }
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** Render in one fixed coordinate space so a piece is the same at every size.
 * @param {HTMLCanvasElement} canvas @param {Settlement} settlement @param {number} [round] */
export function paintArt(canvas, settlement, round = settlement.through) {
  const ctx = canvas.getContext('2d');
  if (!ctx || !hasArtworkSeed(settlement)) return;
  const random = randomFromHash(`${settlement.hash.toLowerCase()}:${round}`);
  const w = 640, h = 420;
  ctx.save(); ctx.scale(canvas.width / w, canvas.height / h);
  const nap = settlement.work === 0;
  const base = nap ? '#34304d' : settlement.blocks > 60 ? '#f09a7b' : settlement.blocks > 30 ? '#f2b28e' : settlement.work > 300 ? '#d8c9e5' : '#d4dfb8';
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  if (nap) {
    for (let ring = 0; ring < 4; ring++) {
      ctx.beginPath(); ctx.ellipse(320, 225, 100 + ring * 83, 60 + ring * 42, -0.35, 0, 2 * Math.PI);
      ctx.strokeStyle = ['#645771', '#736485', '#645771', '#514960'][ring]; ctx.lineWidth = 1; ctx.stroke();
    }
    const density = 70 + Math.min(30, settlement.blocks);
    for (let i = 0; i < density; i++) {
      const x = random() * w, y = random() * h, size = random() > 0.92 ? 4 : 1 + random() * 1.5;
      ctx.fillStyle = ['#e7d3b0', '#b2a3ca', '#dbe5bd'][Math.floor(random() * 3)];
      ctx.fillRect(x, y, size, size);
      if (size === 4) { ctx.fillRect(x + 1.5, y - 3, 1, 10); ctx.fillRect(x - 3, y + 1.5, 10, 1); }
    }
    const x = 170 + random() * 300, y = 110 + random() * 95, radius = 38 + random() * 23;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = '#f3ddac'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + radius * .48, y - radius * .3, radius * .85, 0, Math.PI * 2); ctx.fillStyle = base; ctx.fill();
    for (let layer = 0; layer < 3; layer++) {
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let px = 0; px <= w; px += 5) ctx.lineTo(px, 345 + layer * 27 + Math.sin(px / 90 + layer + random() * .05) * 20);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fillStyle = ['#51475f', '#63516d', '#7b627c'][layer]; ctx.fill();
    }
  } else {
    const energy = Math.min(1, Math.log1p(settlement.work) / Math.log(1001));
    const cx = 280 + random() * 80, cy = 180 + random() * 60, arms = 4 + Math.min(6, Math.floor(settlement.blocks / 15));
    const colors = ['#f8efd8', '#c5d29c', '#786c92', '#34304d', '#efd093'];
    for (let a = 0; a < arms; a++) {
      ctx.beginPath();
      const rotation = a * Math.PI * 2 / arms + random();
      for (let i = 0; i < 200; i++) {
        const t = i / 200, radius = 10 + t * 360, angle = rotation + t * (2.5 + energy * 3);
        const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius * .8;
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = colors[a % colors.length]; ctx.lineWidth = 5 + random() * 17; ctx.lineCap = 'round'; ctx.stroke();
    }
    const density = 75 + Math.floor(energy * 140) + Math.min(100, settlement.blocks);
    for (let i = 0; i < density; i++) {
      const t = random(), angle = t * Math.PI * 9 + random(), radius = t * 340;
      const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius * .7;
      const size = 1 + random() * 7;
      ctx.fillStyle = colors[Math.floor(random() * colors.length)];
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      if (random() > .4) ctx.fillRect(-size / 2, -size / 2, size * 1.5, size); else { ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }
  ctx.restore();
}

/** @param {import('./types').Call} call @returns {Promise<Blob>} */
export async function makeArtCard(call) {
  if (!call.result || !hasArtworkSeed(call.result.settlement)) throw new Error('This settlement has no artwork seed yet.');
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1300;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable in this browser.');
  ctx.fillStyle = '#f8f3e7'; ctx.fillRect(0, 0, 1200, 1300);
  ctx.fillStyle = '#302a25'; ctx.font = '700 58px "Bricolage Grotesque", sans-serif'; ctx.fillText('Nap or Sprint?', 64, 104);
  ctx.font = '400 26px "DM Sans", sans-serif'; ctx.fillText('A little work of hamster.', 64, 150);
  const art = document.createElement('canvas'); art.width = 1072; art.height = 704; paintArt(art, call.result.settlement, call.round);
  ctx.drawImage(art, 64, 195); ctx.strokeStyle = '#302a25'; ctx.lineWidth = 4; ctx.strokeRect(64, 195, 1072, 704);
  ctx.font = '700 48px "Bricolage Grotesque", sans-serif'; ctx.fillText(`Round #${call.round}`, 64, 985);
  ctx.font = '700 30px "DM Sans", sans-serif';
  ctx.fillText(`Called ${call.call.toLowerCase()}${call.bracket ? ` · ${call.bracket} blocks` : ''} · Got it right`, 64, 1045);
  ctx.font = '400 26px "DM Sans", sans-serif';
  ctx.fillText(`${call.result.settlement.work.toLocaleString('en')} wheel passes · ${call.result.settlement.blocks.toLocaleString('en')} blocks · +${call.result.points} points`, 64, 1100);
  ctx.fillText(new Date(call.result.settlement.timestamp).toISOString().replace('T', ' ').slice(0, 16) + ' UTC', 64, 1145);
  ctx.beginPath(); ctx.moveTo(64, 1190); ctx.lineTo(1136, 1190); ctx.lineWidth = 2; ctx.stroke();
  ctx.font = '400 24px "DM Sans", sans-serif'; ctx.fillText('One real hamster. Points, paws & perfectly healthy naps.', 64, 1240);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Unable to create a PNG in this browser.')), 'image/png'));
}

/** @param {Blob} blob @param {string} filename */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
