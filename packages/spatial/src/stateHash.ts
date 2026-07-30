/**
 * A digest of the simulation's state, for finding where two runtimes disagree.
 *
 * Bit-exactness is only a claim until something checks it, and comparing final
 * scorelines is a terrible check: it tells you a match diverged, not where, and the
 * distance between the two is usually tens of thousands of substeps of chaos. So the
 * conformance harness samples this every N steps and reports the FIRST step at which
 * two runtimes differ, which is the only place worth reading code.
 *
 * The hash is over the raw BITS of each double, read through a `DataView` with the
 * endianness stated explicitly — a `Float64Array` viewed as `Uint32Array` would
 * inherit the platform's byte order, which is the one thing a portability check must
 * not do. Values are never rounded before hashing: rounding would hide exactly the
 * last-bit differences this exists to catch.
 *
 * FNV-1a, 32 bits at a time, in two independent lanes so the digest is 64 bits. This
 * is a diagnostic, not a security primitive — collisions cost a missed divergence,
 * not an exploit.
 */
export class StateHasher {
  private a = 0x811c9dc5;
  private b = 0x01000193;
  private readonly buf = new DataView(new ArrayBuffer(8));

  private mix(word: number): void {
    this.a = Math.imul(this.a ^ (word >>> 0), 0x01000193) >>> 0;
    this.b = (Math.imul(this.b ^ ((word >>> 0) + 0x9e3779b9), 0x85ebca6b) ^ (this.a >>> 13)) >>> 0;
  }

  /** Hash a float by its bit pattern, so -0, NaN and every last bit all count. */
  num(x: number): this {
    this.buf.setFloat64(0, x, true);
    this.mix(this.buf.getUint32(0, true));
    this.mix(this.buf.getUint32(4, true));
    return this;
  }

  /** Hash an integer (or anything already exactly integral). */
  int(x: number): this {
    this.mix(x | 0);
    return this;
  }

  /** Hash a string by codepoint — never by a locale-dependent transformation. */
  str(s: string): this {
    this.mix(s.length);
    for (let i = 0; i < s.length; i++) this.mix(s.charCodeAt(i));
    return this;
  }

  /** Hash a nullable string, distinguishing absent from empty. */
  maybeStr(s: string | null | undefined): this {
    if (s === null || s === undefined) return this.int(-1);
    return this.str(s);
  }

  bool(v: boolean): this {
    return this.int(v ? 1 : 0);
  }

  /** 16 hex characters. */
  digest(): string {
    return this.a.toString(16).padStart(8, "0") + this.b.toString(16).padStart(8, "0");
  }
}
