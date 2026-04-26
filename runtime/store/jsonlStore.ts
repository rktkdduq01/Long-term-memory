import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface JsonlReadOptions {
  missingOk?: boolean;
}

export async function readJsonl<T>(path: string, options?: JsonlReadOptions): Promise<T[]> {
  let contents: string;

  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if (
      options?.missingOk !== false &&
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return [];
    }

    throw error;
  }

  const records: T[] = [];

  for (const [index, rawLine] of contents.split('\n').entries()) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    try {
      records.push(JSON.parse(line) as T);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown parse error';
      throw new Error(`Invalid JSONL in ${path} at line ${index + 1}: ${message}`);
    }
  }

  return records;
}

export async function writeJsonl<T>(path: string, records: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const contents = records.map((record) => JSON.stringify(record)).join('\n');
  await writeFile(path, contents ? `${contents}\n` : '', 'utf8');
}

export async function appendJsonl<T>(path: string, record: T): Promise<void> {
  const records = await readJsonl<T>(path);
  records.push(record);
  await writeJsonl(path, records);
}
