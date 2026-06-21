import { pipeline } from "@xenova/transformers";
import type { Embedder } from "./embeddings.js";

export interface MiniLMOptions {
  /** Hub model id. Defaults to the 384-dim all-MiniLM-L6-v2. */
  model?: string;
}

type Extractor = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array }>;

/**
 * A real, fully-local semantic embedder using Transformers.js (all-MiniLM-L6-v2,
 * 384 dims). No API key, no network after the first run: the model weights are
 * downloaded from the Hugging Face hub once and cached on disk, then used
 * offline. Output vectors are mean-pooled and L2-normalized, matching what
 * {@link MemoryStore}'s cosine-from-distance scoring expects.
 */
export class MiniLMEmbedder implements Embedder {
  readonly dimensions = 384;
  private readonly model: string;
  private extractor: Promise<Extractor> | null = null;

  constructor(opts: MiniLMOptions = {}) {
    this.model = opts.model ?? "Xenova/all-MiniLM-L6-v2";
  }

  private load(): Promise<Extractor> {
    if (!this.extractor) {
      this.extractor = pipeline("feature-extraction", this.model) as unknown as Promise<Extractor>;
    }
    return this.extractor;
  }

  async embed(text: string): Promise<Float32Array> {
    const extractor = await this.load();
    const output = await extractor(text, { pooling: "mean", normalize: true });
    // copy out of the tensor's backing buffer
    return new Float32Array(output.data);
  }
}
