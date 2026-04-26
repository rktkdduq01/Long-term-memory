export interface BooleanFlag<Key extends string> {
  flag: string;
  key: Key;
}

export interface StringOption<Key extends string> {
  flag: string;
  key: Key;
}

export interface RequiredOption<Key extends string> {
  key: Key;
  message: string;
}

export interface PositionalOption<Key extends string> {
  key: Key;
  label: string;
}

export interface ParseCliArgsConfig<Key extends string> {
  booleanFlags?: readonly BooleanFlag<Key>[];
  stringOptions?: readonly StringOption<Key>[];
  required?: readonly RequiredOption<Key>[];
  positional?: PositionalOption<Key>;
}

export type ParsedCliArgs<Key extends string> = Partial<Record<Key, string | boolean>>;

function requireFlagName(flag: string): void {
  if (!flag.startsWith('--')) {
    throw new Error(`CLI option definitions must use -- flags: ${flag}`);
  }
}

function requireNonEmptyValue(flag: string, value: string | undefined): string {
  if (!value?.trim() || value.startsWith('--')) {
    throw new Error(`${flag} requires a non-empty value.`);
  }

  return value;
}

function isMissing(value: string | boolean | undefined): boolean {
  return value === undefined || (typeof value === 'string' && !value.trim());
}

export function parseCliArgs<Key extends string>(
  argv: string[],
  config: ParseCliArgsConfig<Key>,
): ParsedCliArgs<Key> {
  const parsed: ParsedCliArgs<Key> = {};
  const options = new Map<string, { key: Key; type: 'boolean' | 'string' }>();

  for (const option of config.booleanFlags ?? []) {
    requireFlagName(option.flag);
    options.set(option.flag, { key: option.key, type: 'boolean' });
    parsed[option.key] = false;
  }

  for (const option of config.stringOptions ?? []) {
    requireFlagName(option.flag);
    options.set(option.flag, { key: option.key, type: 'string' });
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument.startsWith('--')) {
      const option = options.get(argument);

      if (!option) {
        throw new Error(`Unknown option: ${argument}.`);
      }

      if (option.type === 'boolean') {
        parsed[option.key] = true;
        continue;
      }

      parsed[option.key] = requireNonEmptyValue(argument, argv[index + 1]);
      index += 1;
      continue;
    }

    if (!config.positional) {
      throw new Error(`Unexpected positional argument: ${argument}.`);
    }

    if (!argument.trim()) {
      throw new Error(`${config.positional.label} requires a non-empty value.`);
    }

    if (!isMissing(parsed[config.positional.key])) {
      throw new Error(`Unexpected positional argument: ${argument}.`);
    }

    parsed[config.positional.key] = argument;
  }

  for (const required of config.required ?? []) {
    if (isMissing(parsed[required.key])) {
      throw new Error(required.message);
    }
  }

  return parsed;
}
