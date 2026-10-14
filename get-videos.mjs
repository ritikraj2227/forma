// Forma: download free demo clips into ./videos
// Get a free key: sign in at https://pixabay.com/api/docs/ (your key is shown on that page)
// Usage:  PIXABAY_KEY=xxxx node get-videos.mjs            (skips clips you already have)
//         PIXABAY_KEY=xxxx node get-videos.mjs --force pu   (re-pick one exercise)
// Swap a clip: put {"pu": 123456} (the number at the end of a Pixabay video page URL) in videos/overrides.json, then --force pu
// Also works with PEXELS_KEY if you have one.
// Pixabay Content License / Pexels License: free to use and modify, no attribution required.
import fs from 'node:fs';
import path from 'node:path';

const PX = process.env.PIXABAY_KEY, KEY = process.env.PEXELS_KEY;
if (!PX && !KEY) { console.error('Set your key first, e.g.  PIXABAY_KEY=abc node get-videos.mjs'); process.exit(1); }
const DIR = path.resolve('videos');
const Q = JSON.parse(fs.readFileSync(path.join(DIR, 'queries.json'), 'utf8'));
const OV = fs.existsSync(path.join(DIR, 'overrides.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'overrides.json'), 'utf8')) : {};
const IDX_F = path.join(DIR, 'index.json');
const IDX = fs.existsSync(IDX_F) ? JSON.parse(fs.readFileSync(IDX_F, 'utf8')) : {};
const args = process.argv.slice(2), force = args.includes('--force'), only = args.filter(a => !a.startsWith('--'));
const H = KEY ? { Authorization: KEY } : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: H });
    if (r.status === 429) { await sleep(5000 * (i + 1)); continue; }
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return r.json();
  }
  throw new Error('rate limited');
}
function pickFile(v) {
  const f = v.video_files.filter(x => x.file_type === 'video/mp4' && x.width && x.height);
  const land = f.filter(x => x.width >= x.height);
  const pool = (land.length ? land : f).sort((a, b) => a.width - b.width);
  return pool.find(x => Math.min(x.width, x.height) >= 540) || pool[pool.length - 1];
}
function score(v, q) {
  const slug = (v.url || '').toLowerCase();
  const words = q.toLowerCase().split(/\s+/).map(w => w.replace(/s$/, '')).filter(w => w.length > 2);
  let s = 0; words.forEach(w => { if (slug.includes(w)) s += 10; });
  const d = v.duration || 0; s -= Math.abs(d - 10) * 0.6; if (d < 3 || d > 40) s -= 30;
  if (v.width < v.height) s -= 8;
  return s;
}
// ---- Pixabay ----
function pxScore(v, q) {
  const tags = (v.tags || '').toLowerCase() + ' ' + (v.pageURL || '').toLowerCase();
  const words = q.toLowerCase().split(/\s+/).map(w => w.replace(/s$/, '')).filter(w => w.length > 2);
  let s = 0; words.forEach(w => { if (tags.includes(w)) s += 10; });
  const d = v.duration || 0; s -= Math.abs(d - 10) * 0.6; if (d < 3 || d > 40) s -= 30;
  const m = v.videos.medium || v.videos.small; if (m && m.width < m.height) s -= 8;
  return s;
}
function pxNorm(v) {
  const vs = v.videos || {};
  const f = [vs.medium, vs.small, vs.large, vs.tiny].filter(x => x && x.url && x.width).sort((a, b) => a.width - b.width).find(x => Math.min(x.width, x.height) >= 540) || vs.medium || vs.small || vs.tiny;
  return { id: v.id, url: v.pageURL, by: v.user, file: f, image: f.thumbnail || (vs.medium && vs.medium.thumbnail) || (vs.large && vs.large.thumbnail) };
}
async function pixabay(id) {
  if (OV[id]) { const r = await api('https://pixabay.com/api/videos/?key=' + PX + '&id=' + OV[id]); return r.hits && r.hits[0] && pxNorm(r.hits[0]); }
  const r = await api('https://pixabay.com/api/videos/?safesearch=true&per_page=30&key=' + PX + '&q=' + encodeURIComponent(Q[id]));
  const hits = (r.hits || []).sort((a, b) => pxScore(b, Q[id]) - pxScore(a, Q[id]));
  return hits[0] && pxNorm(hits[0]);
}
async function pexels(id) {
  let v;
  if (OV[id]) v = await api('https://api.pexels.com/videos/videos/' + OV[id]);
  else {
    const res = await api('https://api.pexels.com/videos/search?per_page=20&size=medium&query=' + encodeURIComponent(Q[id]));
    v = (res.videos || []).sort((a, b) => score(b, Q[id]) - score(a, Q[id]))[0];
  }
  return v && { id: v.id, url: v.url, by: v.user && v.user.name, file: pickFile(v), image: v.image };
}
async function dl(url, file) {
  const r = await fetch(url); if (!r.ok) throw new Error('download ' + r.status);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

const ids = only.length ? only : Object.keys(Q);
let got = 0, miss = [];
for (const id of ids) {
  if (!force && IDX[id] && fs.existsSync(path.join(DIR, IDX[id].v))) { continue; }
  try {
    const v = PX ? await pixabay(id) : await pexels(id);
    if (!v || !v.file) { miss.push(id); console.log('  no clip  ', id, '(' + Q[id] + ')'); continue; }
    const f = v.file;
    await dl(f.url || f.link, path.join(DIR, id + '.mp4'));
    if (v.image) await dl(v.image, path.join(DIR, id + '.jpg'));
    IDX[id] = { v: id + '.mp4', p: v.image ? id + '.jpg' : undefined, w: f.width, h: f.height, src: v.url, srcId: v.id, by: v.by };
    fs.writeFileSync(IDX_F, JSON.stringify(IDX, null, 1));
    got++; console.log('  ok', id.padEnd(8), (f.width + 'x' + f.height).padEnd(10), v.url);
    await sleep(400);
  } catch (e) { miss.push(id); console.log('  error', id, e.message); }
}
// review page: open videos/review.html in a browser to eyeball every clip
const cards = Object.keys(Q).map(id => IDX[id]
  ? `<figure><video src="${IDX[id].v}" muted loop autoplay playsinline></video><figcaption><b>${id}</b> ${Q[id]}<br><a href="${IDX[id].src}">source ${IDX[id].srcId}</a></figcaption></figure>`
  : `<figure class="miss"><div>no clip</div><figcaption><b>${id}</b> ${Q[id]}</figcaption></figure>`).join('\n');
fs.writeFileSync(path.join(DIR, 'review.html'), `<!doctype html><meta charset="utf-8"><title>Forma clips</title><style>body{font:14px system-ui;background:#111;color:#eee;margin:16px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}figure{margin:0;background:#222;border-radius:10px;overflow:hidden}video,.miss div{width:100%;aspect-ratio:3/2;object-fit:cover;display:grid;place-items:center;background:#000}figcaption{padding:8px}a{color:#fb4}</style><main>${cards}</main>`);
console.log(`\nDone: ${got} downloaded, ${Object.keys(IDX).length} total, ${miss.length} missing${miss.length ? ' (' + miss.join(', ') + ')' : ''}.`);
console.log('Check them: open videos/review.html');
