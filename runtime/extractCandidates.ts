import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRepoRoot } from './loadPrompt.ts';
import { writeCandidateOutput } from './memoryStore.ts';
import { runSessionDistillation } from './sessionDistill.ts';
import { validateJson } from './validateJson.ts';

export interface CandidateExtractionResult {
  candidates: Awaited<ReturnType<typeof runSessionDistillation>>['durable_candidates'];
}

export async function extractCandidates(options?: {
  repoRoot?: string;
  sessionPath?: string;
  outputPath?: string;
  writeOutput?: boolean;
}): Promise<{
  result: CandidateExtractionResult;
  output_path: string | null;
}> {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const distillation = await runSessionDistillation({
    repoRoot,
    sessionPath: options?.sessionPath,
  });
  const result: CandidateExtractionResult = {
    candidates: distillation.durable_candidates,
  };
  const validation = await validateJson(result, resolve(repoRoot, 'schemas/extract-candidate-memories.schema.json'));

  if (!validation.valid) {
    throw new Error(`Candidate extraction failed validation:\n${validation.errors.join('\n')}`);
  }

  let output_path: string | null = null;

  if (options?.writeOutput) {
    output_path = await writeCandidateOutput(result, {
      repoRoot,
      outputPath: options.outputPath,
    });
  }

  return {
    result,
    output_path,
  };
}

function parseCliArgs(argv: string[]) {
  const parsed = {
    sessionPath: undefined as string | undefined,
    outputPath: undefined as string | undefined,
    writeOutput: false,
    stdout: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case '--session':
        parsed.sessionPath = argv[index + 1];
        index += 1;
        break;
      case '--output':
        parsed.outputPath = argv[index + 1];
        parsed.writeOutput = true;
        parsed.stdout = false;
        index += 1;
        break;
      case '--write':
        parsed.writeOutput = true;
        parsed.stdout = false;
        break;
      case '--stdout':
        parsed.stdout = true;
        break;
      default:
        break;
    }
  }

  return parsed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsedArgs = parseCliArgs(process.argv.slice(2));
  const { result, output_path } = await extractCandidates({
    sessionPath: parsedArgs.sessionPath,
    outputPath: parsedArgs.outputPath,
    writeOutput: parsedArgs.writeOutput,
  });

  if (parsedArgs.stdout) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (output_path) {
    process.stdout.write(`${output_path}\n`);
  }
}
