import jsPDF from 'jspdf';
import { Post } from '../models/post.model';
import { optimizedImageUrl } from './image-url';
import { placeValueMeta } from './place-values';

// Builds the downloadable trip journal: a cover page (hero photo, stats, ratings, day summary)
// followed by itinerary pages with one card per place, grouped by day.

export interface PdfDay {
  key: string;
  dayLabel: string;
  dateLabel: string;
  posts: Post[];
}

export interface TripPdfData {
  title: string;
  dates: string;
  timing: string;
  status: string;
  days: number;
  cover: string | null;
  posts: Post[];
  timeline: PdfDay[];
  fileName: string;
}

type RGB = [number, number, number];

const C = {
  navy: [10, 44, 94] as RGB,
  navyText: [16, 62, 126] as RGB,
  green: [34, 197, 94] as RGB,
  greenDark: [21, 128, 61] as RGB,
  text: [22, 36, 61] as RGB,
  muted: [90, 107, 134] as RGB,
  subtle: [133, 147, 170] as RGB,
  border: [227, 233, 242] as RGB,
  surface: [241, 245, 250] as RGB,
  white: [255, 255, 255] as RGB,
};

const TONES: Record<string, { fg: RGB, bg: RGB, bar: RGB }> = {
  'tone-great': { fg: [21, 128, 61], bg: [220, 252, 231], bar: [34, 197, 94] },
  'tone-good': { fg: [16, 62, 126], bg: [219, 234, 254], bar: [30, 95, 192] },
  'tone-neutral': { fg: [180, 83, 9], bg: [254, 243, 199], bar: [245, 158, 11] },
  'tone-bad': { fg: [185, 28, 28], bg: [254, 226, 226], bar: [220, 38, 38] },
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;               // side margin
const CONTENT_W = PAGE_W - M * 2;
const FOOTER_Y = PAGE_H - 10;
const BOTTOM = PAGE_H - 20; // last usable y above the footer
const PT = 0.3528;          // mm per point

export async function downloadTripPdf(data: TripPdfData): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const images = await loadImages(data);

  drawCover(pdf, data, images.get('__cover__') || null);
  drawItinerary(pdf, data, images);
  drawFooters(pdf, data);

  pdf.save(data.fileName);
}

// ---------------------------------------------------------------------------
// Cover page
// ---------------------------------------------------------------------------

function drawCover(pdf: jsPDF, data: TripPdfData, cover: HTMLImageElement | null) {
  const heroH = 110;
  pdf.addImage(heroImage(cover, 2100, 1100), 'JPEG', 0, 0, PAGE_W, heroH);

  // Brand
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  setText(pdf, C.green);
  pdf.text('JOURNHIVE', M, 16, { charSpace: 0.8 });
  pdf.setFont('helvetica', 'normal');
  setText(pdf, [220, 228, 240]);
  pdf.text('Travel journal', PAGE_W - M, 16, { align: 'right' });

  // Title block, bottom-aligned on the hero
  let size = 34;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(size);
  let lines: string[] = pdf.splitTextToSize(clean(data.title) || 'My trip', CONTENT_W);
  if (lines.length > 2) {
    size = 26;
    pdf.setFontSize(size);
    lines = pdf.splitTextToSize(clean(data.title), CONTENT_W).slice(0, 2);
  }
  const lh = size * PT * 1.1;
  let y = heroH - 22 - (lines.length - 1) * lh;
  setText(pdf, C.white);
  lines.forEach(line => { pdf.text(line, M, y); y += lh; });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  setText(pdf, [226, 232, 240]);
  const sub = [clean(data.dates), data.days ? `${data.days} ${data.days === 1 ? 'day' : 'days'}` : '', data.status]
    .filter(Boolean).join('   |   ');
  pdf.text(sub, M, heroH - 12);

  // At a glance
  y = heroH + 12;
  sectionLabel(pdf, 'TRIP AT A GLANCE', y);
  y += 5;
  const counts = ratingCounts(data.posts);
  const photos = data.posts.filter(p => !!p.image).length;
  const tiles: [string, string][] = [
    [String(data.posts.length), data.posts.length === 1 ? 'Place' : 'Places'],
    [data.days ? String(data.days) : '-', data.days === 1 ? 'Day' : 'Days'],
    [String(photos), photos === 1 ? 'Photo' : 'Photos'],
    [String(counts.get('Totally Worth It') || 0), 'Totally worth it'],
  ];
  const gap = 4;
  const tileW = (CONTENT_W - gap * 3) / 4;
  tiles.forEach(([value, label], i) => {
    const x = M + i * (tileW + gap);
    fill(pdf, C.surface);
    pdf.roundedRect(x, y, tileW, 24, 3, 3, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    setText(pdf, C.navyText);
    pdf.text(value, x + 6, y + 12);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    setText(pdf, C.muted);
    pdf.text(label, x + 6, y + 19);
  });
  y += 24 + 12;

  // How it went
  const rated = [...counts.values()].reduce((a, b) => a + b, 0);
  if (rated > 0) {
    sectionLabel(pdf, 'HOW IT WENT', y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    setText(pdf, C.subtle);
    pdf.text(`${rated} rated`, PAGE_W - M, y, { align: 'right' });
    y += 5;

    const values = ['Totally Worth It', 'Worth Once', 'Missed Out', 'Not Worth It'];
    let x = M;
    const present = values.filter(v => counts.get(v));
    const barGap = 1.2;
    const usable = CONTENT_W - barGap * (present.length - 1);
    present.forEach((v, i) => {
      const w = usable * (counts.get(v)! / rated);
      fill(pdf, TONES[placeValueMeta(v).tone].bar);
      pdf.roundedRect(x, y, w, 4, 1.5, 1.5, 'F');
      x += w + (i < present.length - 1 ? barGap : 0);
    });
    y += 11;

    values.forEach((v, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const lx = M + col * (CONTENT_W / 2);
      const ly = y + row * 8;
      const n = counts.get(v) || 0;
      fill(pdf, n ? TONES[placeValueMeta(v).tone].bar : C.border);
      pdf.circle(lx + 1.8, ly - 1.2, 1.8, 'F');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      setText(pdf, n ? C.text : C.subtle);
      pdf.text(v, lx + 6, ly);
      pdf.setFont('helvetica', 'bold');
      pdf.text(String(n), lx + CONTENT_W / 2 - 8, ly, { align: 'right' });
    });
    y += 16 + 5;
  }

  // Day by day summary
  if (data.timeline.length) {
    sectionLabel(pdf, 'DAY BY DAY', y);
    y += 5;
    const rowH = 12;
    const room = Math.floor((BOTTOM - y) / rowH);
    const shown = data.timeline.length > room ? data.timeline.slice(0, room - 1) : data.timeline;

    shown.forEach((day, i) => {
      const ry = y + i * rowH;
      if (i > 0) {
        stroke(pdf, C.border);
        pdf.setLineWidth(0.2);
        pdf.line(M, ry, M + CONTENT_W, ry);
      }
      const badge = day.key === 'undated' ? '-' : (day.dayLabel ? day.dayLabel.replace('Day ', '') : '-');
      fill(pdf, day.key === 'undated' ? C.surface : C.navy);
      pdf.roundedRect(M, ry + 2.5, 8, 8, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      setText(pdf, day.key === 'undated' ? C.subtle : C.white);
      pdf.text(clean(badge), M + 4, ry + 7.8, { align: 'center' });

      pdf.setFontSize(10);
      setText(pdf, C.text);
      const heading = day.dayLabel && day.key !== 'undated' ? `${day.dayLabel}  ` : '';
      pdf.text(heading, M + 12, ry + 6);
      pdf.setFont('helvetica', 'normal');
      setText(pdf, C.muted);
      pdf.text(clean(day.key === 'undated' ? 'No date' : day.dateLabel), M + 12 + pdf.getTextWidth(heading), ry + 6);

      pdf.setFontSize(8.5);
      setText(pdf, C.subtle);
      const names: string[] = pdf.splitTextToSize(day.posts.map(p => clean(p.title)).join(', '), CONTENT_W - 40);
      pdf.text((names[0] || '') + (names.length > 1 ? '...' : ''), M + 12, ry + 10.5);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      setText(pdf, C.greenDark);
      pdf.text(`${day.posts.length} ${day.posts.length === 1 ? 'place' : 'places'}`, PAGE_W - M, ry + 7.8, { align: 'right' });
    });

    if (shown.length < data.timeline.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      setText(pdf, C.subtle);
      pdf.text(`+ ${data.timeline.length - shown.length} more days in the itinerary`, M + 12, y + shown.length * rowH + 7);
    }
  }
}

// ---------------------------------------------------------------------------
// Itinerary pages
// ---------------------------------------------------------------------------

const PAD = 5;
const IMG_W = 58;
const IMG_H = IMG_W * 2 / 3;
const TEXT_X = M + PAD + IMG_W + 6;
const TEXT_W = M + CONTENT_W - PAD - TEXT_X;

function drawItinerary(pdf: jsPDF, data: TripPdfData, images: Map<string, HTMLImageElement>) {
  if (!data.timeline.length) {
    return;
  }
  let y = newPage(pdf, data);

  data.timeline.forEach(day => {
    const firstCard = cardHeight(pdf, day.posts[0]);
    if (y + 12 + Math.min(firstCard, 60) > BOTTOM) {
      y = newPage(pdf, data);
    }

    // Day heading
    fill(pdf, day.key === 'undated' ? C.border : C.green);
    pdf.circle(M + 2.5, y + 3.2, 2.5, 'F');
    fill(pdf, C.white);
    pdf.circle(M + 2.5, y + 3.2, 1, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    setText(pdf, C.text);
    const heading = day.key === 'undated' ? 'No date' : (day.dayLabel || clean(day.dateLabel));
    pdf.text(heading, M + 8, y + 4.6);
    if (day.dayLabel && day.key !== 'undated') {
      const hw = pdf.getTextWidth(heading);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      setText(pdf, C.muted);
      pdf.text(clean(day.dateLabel), M + 8 + hw + 3, y + 4.6);
    }
    y += 10;

    day.posts.forEach(post => {
      const h = cardHeight(pdf, post);
      if (y + h > BOTTOM) {
        y = newPage(pdf, data);
      }
      drawCard(pdf, post, y, h, images.get(String(post.image)) || null);
      y += h + 5;
    });
    y += 5;
  });
}

function newPage(pdf: jsPDF, data: TripPdfData): number {
  pdf.addPage();
  // Slim running header
  fill(pdf, C.navy);
  pdf.rect(0, 0, PAGE_W, 14, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  setText(pdf, C.green);
  pdf.text('JOURNHIVE', M, 8.8, { charSpace: 0.6 });
  pdf.setFont('helvetica', 'normal');
  setText(pdf, C.white);
  const title = clean(data.title);
  pdf.text(`${title}${data.dates ? '   |   ' + clean(data.dates) : ''}`, PAGE_W - M, 8.8, { align: 'right' });
  return 24;
}

interface CardLayout {
  title: string[];
  caption: string[];
}

function layoutCard(pdf: jsPDF, post: Post): CardLayout {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  const title = pdf.splitTextToSize(clean(post.title) || 'Untitled', TEXT_W).slice(0, 2);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  let caption: string[] = pdf.splitTextToSize(clean(post.caption), TEXT_W);
  const maxLines = 38;
  if (caption.length > maxLines) {
    caption = caption.slice(0, maxLines);
    caption[maxLines - 1] = caption[maxLines - 1].replace(/\s*\S*$/, '') + '...';
  }
  return { title, caption };
}

const TITLE_LH = 13 * PT * 1.2;
const CAPTION_LH = 9.5 * PT * 1.45;

function cardHeight(pdf: jsPDF, post: Post): number {
  const { title, caption } = layoutCard(pdf, post);
  const textH = title.length * TITLE_LH + 9 + (caption.length ? 3 + caption.length * CAPTION_LH : 0);
  return Math.max(IMG_H, textH) + PAD * 2;
}

function drawCard(pdf: jsPDF, post: Post, y: number, h: number, img: HTMLImageElement | null) {
  const { title, caption } = layoutCard(pdf, post);

  // Card surface
  fill(pdf, C.white);
  stroke(pdf, C.border);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(M, y, CONTENT_W, h, 3.5, 3.5, 'FD');

  // Photo (cropped to 3:2, never stretched) or placeholder
  const ix = M + PAD;
  const iy = y + PAD;
  if (img) {
    pdf.addImage(cropImage(img, 900, 600, 36), 'JPEG', ix, iy, IMG_W, IMG_H);
  } else {
    fill(pdf, C.surface);
    pdf.roundedRect(ix, iy, IMG_W, IMG_H, 2.5, 2.5, 'F');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    setText(pdf, C.subtle);
    pdf.text('No photo', ix + IMG_W / 2, iy + IMG_H / 2 + 1, { align: 'center' });
  }

  // Title
  let ty = y + PAD + 4.6;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  setText(pdf, C.text);
  title.forEach(line => { pdf.text(line, TEXT_X, ty); ty += TITLE_LH; });

  // Rating pill + date
  let px = TEXT_X;
  const pillY = ty - 2.2;
  if (post.value) {
    const tone = TONES[placeValueMeta(post.value).tone] || TONES['tone-good'];
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    const label = clean(post.value);
    const w = pdf.getTextWidth(label) + 8;
    fill(pdf, tone.bg);
    pdf.roundedRect(px, pillY, w, 5.6, 2.8, 2.8, 'F');
    fill(pdf, tone.bar);
    pdf.circle(px + 2.8, pillY + 2.8, 1, 'F');
    setText(pdf, tone.fg);
    pdf.text(label, px + 5, pillY + 3.9);
    px += w + 3;
  }
  const date = formatVisitDate(post.date);
  if (date) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    setText(pdf, C.subtle);
    pdf.text(date, px, pillY + 3.9);
  }

  // Notes
  let cy = pillY + 5.6 + 5.2;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  setText(pdf, C.muted);
  caption.forEach(line => { pdf.text(line, TEXT_X, cy); cy += CAPTION_LH; });
}

function drawFooters(pdf: jsPDF, data: TripPdfData) {
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    stroke(pdf, C.border);
    pdf.setLineWidth(0.2);
    pdf.line(M, FOOTER_Y - 4.5, PAGE_W - M, FOOTER_Y - 4.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    setText(pdf, C.subtle);
    pdf.text('Made with JournHive', M, FOOTER_Y);
    pdf.text(`Page ${i} of ${total}`, PAGE_W - M, FOOTER_Y, { align: 'right' });
  }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

async function loadImages(data: TripPdfData): Promise<Map<string, HTMLImageElement>> {
  const map = new Map<string, HTMLImageElement>();
  const jobs: Promise<void>[] = [];
  const add = (key: string, src: unknown, width: number) => {
    if (typeof src !== 'string' || !src || map.has(key)) {
      return;
    }
    jobs.push(loadImage(src, width).then(img => { if (img) { map.set(key, img); } }));
  };
  add('__cover__', data.cover, 2000);
  data.posts.forEach(p => add(String(p.image), p.image, 1000));
  await Promise.all(jobs);
  return map;
}

// Loads a CORS-readable image; falls back to the original URL if the optimised one fails
function loadImage(src: string, width: number): Promise<HTMLImageElement | null> {
  const attempt = (url: string) => new Promise<HTMLImageElement | null>(resolve => {
    const img = new Image();
    if (!url.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    const timer = setTimeout(() => resolve(null), 20000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
  const optimized = optimizedImageUrl(src, width);
  return attempt(optimized).then(img => img || (optimized !== src ? attempt(src) : null));
}

// Centre-crops the image to w×h (like object-fit: cover) with rounded corners on white
function cropImage(img: HTMLImageElement, w: number, h: number, radius: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  roundRectPath(ctx, 0, 0, w, h, radius);
  ctx.clip();
  drawCover(ctx, img, w, h);
  return canvas.toDataURL('image/jpeg', 0.88);

  function drawCover(c: CanvasRenderingContext2D, im: HTMLImageElement, cw: number, ch: number) {
    const scale = Math.max(cw / im.naturalWidth, ch / im.naturalHeight);
    const dw = im.naturalWidth * scale;
    const dh = im.naturalHeight * scale;
    c.drawImage(im, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  }
}

// The cover hero: photo (or brand gradient) with a navy fade so the title stays readable
function heroImage(img: HTMLImageElement | null, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  if (img) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0A2C5E');
    g.addColorStop(0.55, '#103E7E');
    g.addColorStop(1, '#22C55E');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.85, h * 0.15, 0, w * 0.85, h * 0.15, w * 0.45);
    glow.addColorStop(0, 'rgba(74, 222, 128, 0.35)');
    glow.addColorStop(1, 'rgba(74, 222, 128, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  const top = ctx.createLinearGradient(0, 0, 0, h * 0.3);
  top.addColorStop(0, 'rgba(10, 28, 56, 0.55)');
  top.addColorStop(1, 'rgba(10, 28, 56, 0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h);

  const bottom = ctx.createLinearGradient(0, h * 0.35, 0, h);
  bottom.addColorStop(0, 'rgba(10, 28, 56, 0)');
  bottom.addColorStop(1, 'rgba(10, 28, 56, 0.9)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, 0, w, h);

  return canvas.toDataURL('image/jpeg', 0.9);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sectionLabel(pdf: jsPDF, label: string, y: number) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  setText(pdf, C.greenDark);
  pdf.text(label, M, y, { charSpace: 0.7 });
}

function ratingCounts(posts: Post[]): Map<string, number> {
  const counts = new Map<string, number>();
  posts.forEach(p => p.value && counts.set(p.value, (counts.get(p.value) || 0) + 1));
  return counts;
}

function formatVisitDate(date: unknown): string {
  const d = date ? new Date(date as string) : null;
  return d && !isNaN(d.getTime())
    ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '';
}

// The built-in PDF fonts only cover Latin-1, so map common typography and drop the rest
function clean(text: unknown): string {
  return String(text || '')
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–−]/g, '-')
    .replace(/—/g, ' - ')
    .replace(/…/g, '...')
    .replace(/•/g, '-')
    .replace(/[^\x00-\xFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function setText(pdf: jsPDF, c: RGB) {
  pdf.setTextColor(c[0], c[1], c[2]);
}

function fill(pdf: jsPDF, c: RGB) {
  pdf.setFillColor(c[0], c[1], c[2]);
}

function stroke(pdf: jsPDF, c: RGB) {
  pdf.setDrawColor(c[0], c[1], c[2]);
}
