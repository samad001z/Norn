import { AutoModelForSequenceClassification, AutoTokenizer } from "@xenova/transformers";
import type { ContradictionScorer } from "./contradiction.js";

export interface NliOptions {
  /** Hub model id of a 3-class NLI model. Defaults to nli-deberta-v3-xsmall. */
  model?: string;
}

interface Tokenizer {
  (text: string, opts: { text_pair: string }): Promise<Record<string, unknown>>;
}
interface SeqClassifier {
  (inputs: Record<string, unknown>): Promise<{ logits: { data: ArrayLike<number> } }>;
  config: { id2label: Record<string, string> };
}

const softmax = (xs: number[]): number[] => {
  const max = Math.max(...xs);
  const ex = xs.map((x) => Math.exp(x - max));
  const sum = ex.reduce((a, b) => a + b, 0);
  return ex.map((x) => x / sum);
};

/**
 * A fully-local NLI contradiction scorer using Transformers.js (default
 * nli-deberta-v3-xsmall). Like {@link MiniLMEmbedder}: weights download from the
 * Hugging Face hub once, cache on disk, then run offline. The model classifies a
 * (premise, hypothesis) pair as contradiction / entailment / neutral; we read the
 * contradiction probability and symmetrize by scoring both orderings and taking
 * the max, since "A contradicts B" should hold whichever way we read the pair.
 *
 * Validated on the project's contradiction set: it catches entity swaps
 * (Vercel/Railway), value swaps (600/1000), and word swaps (tabs/spaces) that
 * embeddings miss, and correctly clears refinements. It DOES over-flag unrelated
 * pairs as contradictions, which is why it must run behind the embedding
 * pre-filter (see SqliteStorage), never on its own.
 */
export class NliContradictionScorer implements ContradictionScorer {
  private readonly model: string;
  private loaded: Promise<{ tokenizer: Tokenizer; classifier: SeqClassifier; contraIdx: number }> | null =
    null;

  constructor(opts: NliOptions = {}) {
    this.model = opts.model ?? "Xenova/nli-deberta-v3-xsmall";
  }

  private load() {
    if (!this.loaded) {
      this.loaded = (async () => {
        const tokenizer = (await AutoTokenizer.from_pretrained(this.model)) as unknown as Tokenizer;
        const classifier = (await AutoModelForSequenceClassification.from_pretrained(this.model, {
          quantized: true,
        })) as unknown as SeqClassifier;
        // Don't assume label order — find the contradiction class from the config.
        const entry = Object.entries(classifier.config.id2label).find(([, label]) =>
          label.toLowerCase().includes("contradict"),
        );
        if (!entry) throw new Error(`NLI model ${this.model} has no contradiction label`);
        return { tokenizer, classifier, contraIdx: Number(entry[0]) };
      })();
    }
    return this.loaded;
  }

  private async directional(premise: string, hypothesis: string): Promise<number> {
    const { tokenizer, classifier, contraIdx } = await this.load();
    const inputs = await tokenizer(premise, { text_pair: hypothesis });
    const { logits } = await classifier(inputs);
    return softmax(Array.from(logits.data))[contraIdx] ?? 0;
  }

  async contradiction(a: string, b: string): Promise<number> {
    const [ab, ba] = await Promise.all([this.directional(a, b), this.directional(b, a)]);
    return Math.max(ab, ba);
  }
}
