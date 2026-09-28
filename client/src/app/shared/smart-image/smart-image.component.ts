import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef,
  HostBinding, Input, NgZone, OnChanges, OnDestroy
} from '@angular/core';
import { optimizedImageUrl } from '../image-url';

// How far an image may be enlarged beyond its native pixel size before we stop cropping-to-fill.
const MAX_UPSCALE = 1.15;
// With keepShape, a photo whose proportions differ from its slot by more than this is shown whole
// (e.g. a portrait photo in a landscape card) rather than cropped to a sliver.
const MAX_ASPECT_MISMATCH = 1.5;

/**
 * A photo that fills its container (object-fit: cover) only when it has enough resolution to do
 * so sharply. If filling would stretch it, the photo is shown whole at no more than its native
 * size (contain), over a softly blurred copy of itself — so low-resolution images never pixelate.
 * The host element takes the size of its container; give the container the dimensions.
 */
@Component({
  selector: 'app-smart-image',
  template: `
    <img *ngIf="mode === 'fit' && url && backdrop" class="backdrop" [src]="url" alt="" aria-hidden="true"
      [attr.crossorigin]="crossorigin">
    <img *ngIf="url" class="main" [class.fit]="mode === 'fit'" [class.ready]="loaded"
      [src]="url" [alt]="alt" [style.object-position]="position"
      [attr.loading]="lazy ? 'lazy' : null" [attr.crossorigin]="crossorigin" decoding="async"
      (load)="onLoad($event)" (error)="onError()">
  `,
  styles: [`
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .main {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      transition: opacity 400ms ease;
    }

    .main.ready {
      opacity: 1;
    }

    /* Shown whole and never larger than its natural size */
    .main.fit {
      position: absolute;
      inset: 0;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      margin: auto;
      object-fit: contain;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.28);
    }

    :host(.align-end) .main.fit {
      margin: auto 0 auto auto;
    }

    .backdrop {
      position: absolute;
      inset: -10%;
      width: 120%;
      height: 120%;
      max-width: none;
      object-fit: cover;
      filter: blur(32px) saturate(1.15) brightness(0.8);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SmartImageComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() src: unknown;
  @Input() alt = '';
  /** Cap on the delivered width in px (never upscales). Omit to serve the full original. */
  @Input() maxWidth?: number;
  @Input() lazy = true;
  @Input() crossorigin: string | null = null;
  @Input() position = 'center';
  /** Where a letterboxed (low-resolution) photo sits: centred, or pushed to the right edge. */
  @Input() @HostBinding('class.align-end') alignEnd = false;
  /** Show photos whose shape doesn't match the slot whole, instead of cropping them. */
  @Input() keepShape = false;
  /** Fill the space around a letterboxed photo with a blurred copy of it (otherwise the container's background shows). */
  @Input() backdrop = true;

  mode: 'cover' | 'fit' = 'cover';
  loaded = false;
  url = '';

  private natural = { width: 0, height: 0 };
  private triedFallback = false;
  private resizeObserver?: ResizeObserver;

  constructor(private host: ElementRef<HTMLElement>, private cdr: ChangeDetectorRef, private zone: NgZone) { }

  ngOnChanges(): void {
    this.url = optimizedImageUrl(this.src, this.maxWidth);
    this.loaded = false;
    this.triedFallback = false;
    this.natural = { width: 0, height: 0 };
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.evaluate());
      this.resizeObserver.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  onLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    this.natural = { width: img.naturalWidth, height: img.naturalHeight };
    this.loaded = true;
    this.evaluate();
    this.cdr.markForCheck();
  }

  // If the optimised Cloudinary URL can't be served, fall back to the original upload
  onError() {
    const original = typeof this.src === 'string' ? this.src : '';
    if (!this.triedFallback && original && this.url !== original) {
      this.triedFallback = true;
      this.url = original;
      this.cdr.markForCheck();
    }
  }

  private evaluate() {
    const { width, height } = this.natural;
    const box = this.host.nativeElement.getBoundingClientRect();
    if (!width || !height || !box.width || !box.height) {
      return;
    }
    // How much object-fit: cover would enlarge the photo, in CSS px per image px
    const coverScale = Math.max(box.width / width, box.height / height);
    const imageRatio = width / height;
    const boxRatio = box.width / box.height;
    const mismatch = Math.max(imageRatio / boxRatio, boxRatio / imageRatio);
    const tooSmall = coverScale > MAX_UPSCALE;
    const wrongShape = this.keepShape && mismatch > MAX_ASPECT_MISMATCH;
    const next = tooSmall || wrongShape ? 'fit' : 'cover';
    if (next !== this.mode) {
      this.zone.run(() => {
        this.mode = next;
        this.cdr.markForCheck();
      });
    }
  }
}
