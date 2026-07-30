import { exp } from "../exp.js";
import { FIELD } from "../field.js";
import { clamp, type Vec2 } from "../math.js";

/**
 * A scalar field sampled on a regular grid over the pitch. Cheap to build and
 * to sample bilinearly. The building block for every influence/space/danger
 * layer in the spatial analysis.
 */
export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  private readonly data: Float64Array;

  constructor(cell: number) {
    this.cell = cell;
    this.cols = Math.ceil(FIELD.LENGTH / cell) + 1;
    this.rows = Math.ceil(FIELD.WIDTH / cell) + 1;
    this.data = new Float64Array(this.cols * this.rows);
  }

  clear(): void {
    this.data.fill(0);
  }

  private index(cx: number, cy: number): number {
    return cy * this.cols + cx;
  }

  /** World position of a cell's centre. */
  cellPos(cx: number, cy: number): Vec2 {
    return { x: cx * this.cell, y: cy * this.cell };
  }

  addAt(cx: number, cy: number, value: number): void {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
    this.data[this.index(cx, cy)] += value;
  }

  /**
   * Deposit a Gaussian bump of the given amplitude and sigma (metres) centred
   * on a world position — a player's influence footprint.
   */
  splat(center: Vec2, amp: number, sigma: number): void {
    const reach = Math.ceil((sigma * 3) / this.cell);
    const gx = center.x / this.cell;
    const gy = center.y / this.cell;
    const cx0 = Math.round(gx);
    const cy0 = Math.round(gy);
    const inv2s2 = 1 / (2 * sigma * sigma);
    for (let cy = cy0 - reach; cy <= cy0 + reach; cy++) {
      for (let cx = cx0 - reach; cx <= cx0 + reach; cx++) {
        if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
        const dx = cx * this.cell - center.x;
        const dy = cy * this.cell - center.y;
        // The Gaussian kernel is kept EXACTLY as it was — only the exp changes. A
        // cheaper polynomial bump would alter the field's shape, and this field is
        // what every off-ball player steers by, so it would need a full re-tune.
        this.data[this.index(cx, cy)] += amp * exp(-(dx * dx + dy * dy) * inv2s2);
      }
    }
  }

  /** Bilinear sample at a world position. */
  sample(p: Vec2): number {
    const gx = clamp(p.x / this.cell, 0, this.cols - 1.001);
    const gy = clamp(p.y / this.cell, 0, this.rows - 1.001);
    const cx = Math.floor(gx);
    const cy = Math.floor(gy);
    const fx = gx - cx;
    const fy = gy - cy;
    const a = this.data[this.index(cx, cy)]!;
    const b = this.data[this.index(cx + 1, cy)]!;
    const c = this.data[this.index(cx, cy + 1)]!;
    const d = this.data[this.index(cx + 1, cy + 1)]!;
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
}
