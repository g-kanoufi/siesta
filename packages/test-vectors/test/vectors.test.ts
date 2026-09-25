import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateAll } from "../src/generate";

const vectorsDir = join(process.cwd(), "vectors");

/**
 * Drift guard: committed vectors must match what @siesta/core produces.
 * If this fails, the domain changed — run `npm run generate -w
 * @siesta/test-vectors` and re-verify the Swift/Kotlin ports.
 */
describe("test vectors", () => {
  it("committed files match the current domain", async () => {
    const vectors = await generateAll();
    for (const [name, data] of Object.entries(vectors)) {
      const path = join(vectorsDir, `${name}.json`);
      expect(existsSync(path)).toBe(true);
      const committed = readFileSync(path, "utf8");
      expect(committed).toBe(JSON.stringify(data, null, 2) + "\n");
    }
  });

  it("covers every state in the transition table", async () => {
    const vectors = await generateAll();
    const states = new Set(vectors.transitions.cases.map((c) => c.from));
    expect(states.size).toBe(9);
  });
});
