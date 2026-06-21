/**
 * Embeddings live behind this interface so the model is swappable without
 * touching the store. v1 ships a deterministic placeholder; a small local
 * embedding model drops in here later.
 */
export interface Embedder {
  /** Vector length this embedder produces. Fixed for the life of a store. */
  readonly dimensions: number;
  /** Map text to a unit-normalized vector. */
  embed(text: string): Promise<Float32Array>;
}

/**
 * Deterministic, dependency-free placeholder embedder.
 *
 * It buckets characters into a fixed-width vector and L2-normalizes the result,
 * which is enough to exercise the store end-to-end. It is NOT semantic — two
 * unrelated strings can land close together. Replace before v1 ships.
 *
 * TODO(norn): swap for a real local embedding model behind {@link Embedder}.
 */
export class HashEmbedder implements Embedder {
  readonly dimensions: number;

  constructor(dimensions = 256) {
    if (dimensions <= 0) throw new RangeError("dimensions must be positive");
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<Float32Array> {
    const v = new Float32Array(this.dimensions);
    for (let i = 0; i < text.length; i++) {
      const bucket = text.charCodeAt(i) % this.dimensions;
      v[bucket] = (v[bucket] ?? 0) + 1;
    }
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / norm;
    return v;
  }
}
