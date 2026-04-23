import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonSchema = boolean | Record<string, unknown>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unescapePointerToken(token: string): string {
  return token.replaceAll('~1', '/').replaceAll('~0', '~');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (isObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function matchesType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'null':
      return value === null;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return isObject(value);
    case 'string':
      return typeof value === 'string';
    default:
      return false;
  }
}

function resolveJsonPointer(rootSchema: JsonSchema, pointer: string): JsonSchema {
  if (pointer === '' || pointer === '#') {
    return rootSchema;
  }

  if (!pointer.startsWith('/')) {
    throw new Error(`Unsupported JSON pointer: #${pointer}`);
  }

  let current: unknown = rootSchema;

  for (const rawToken of pointer.slice(1).split('/')) {
    const token = unescapePointerToken(rawToken);

    if (Array.isArray(current)) {
      current = current[Number(token)];
      continue;
    }

    if (isObject(current)) {
      current = current[token];
      continue;
    }

    throw new Error(`Could not resolve JSON pointer segment "${token}".`);
  }

  return current as JsonSchema;
}

class SchemaRegistry {
  private readonly cache = new Map<string, JsonSchema>();

  async loadSchema(schemaPath: string): Promise<JsonSchema> {
    const absolutePath = resolve(schemaPath);

    if (this.cache.has(absolutePath)) {
      return this.cache.get(absolutePath) as JsonSchema;
    }

    const schemaText = await readFile(absolutePath, 'utf8');
    const schema = JSON.parse(schemaText) as JsonSchema;
    this.cache.set(absolutePath, schema);
    return schema;
  }

  async resolveReference(currentSchemaPath: string, reference: string): Promise<{ schema: JsonSchema; schemaPath: string }> {
    const [relativePathPart, pointerPart = ''] = reference.split('#');
    const targetSchemaPath = relativePathPart
      ? resolve(dirname(currentSchemaPath), relativePathPart)
      : currentSchemaPath;
    const rootSchema = await this.loadSchema(targetSchemaPath);
    const resolvedSchema = pointerPart ? resolveJsonPointer(rootSchema, pointerPart) : rootSchema;

    return {
      schema: resolvedSchema,
      schemaPath: targetSchemaPath,
    };
  }
}

async function validateAgainstSchema(
  value: unknown,
  schema: JsonSchema,
  schemaPath: string,
  valuePath: string,
  registry: SchemaRegistry,
  errors: string[],
): Promise<void> {
  if (typeof schema === 'boolean') {
    if (!schema) {
      errors.push(`${valuePath}: schema rejected the value.`);
    }

    return;
  }

  const schemaWithRef = { ...schema };
  const reference = typeof schemaWithRef.$ref === 'string' ? schemaWithRef.$ref : null;

  if (reference) {
    delete schemaWithRef.$ref;
    const resolvedReference = await registry.resolveReference(schemaPath, reference);
    await validateAgainstSchema(value, resolvedReference.schema, resolvedReference.schemaPath, valuePath, registry, errors);
  }

  if (Array.isArray(schemaWithRef.allOf)) {
    for (const nestedSchema of schemaWithRef.allOf) {
      await validateAgainstSchema(value, nestedSchema as JsonSchema, schemaPath, valuePath, registry, errors);
    }
  }

  if (schemaWithRef.if) {
    const conditionErrors: string[] = [];
    await validateAgainstSchema(value, schemaWithRef.if as JsonSchema, schemaPath, valuePath, registry, conditionErrors);

    if (conditionErrors.length === 0 && schemaWithRef.then) {
      await validateAgainstSchema(value, schemaWithRef.then as JsonSchema, schemaPath, valuePath, registry, errors);
    }

    if (conditionErrors.length > 0 && schemaWithRef.else) {
      await validateAgainstSchema(value, schemaWithRef.else as JsonSchema, schemaPath, valuePath, registry, errors);
    }
  }

  const expectedType = schemaWithRef.type;

  if (typeof expectedType === 'string' && !matchesType(value, expectedType)) {
    errors.push(`${valuePath}: expected ${expectedType}.`);
    return;
  }

  if (Array.isArray(expectedType) && !expectedType.some((typeName) => matchesType(value, String(typeName)))) {
    errors.push(`${valuePath}: expected one of ${expectedType.join(', ')}.`);
    return;
  }

  if ('const' in schemaWithRef && stableStringify(value) !== stableStringify(schemaWithRef.const)) {
    errors.push(`${valuePath}: expected constant ${JSON.stringify(schemaWithRef.const)}.`);
  }

  if (Array.isArray(schemaWithRef.enum)) {
    const enumMatches = schemaWithRef.enum.some((candidate) => stableStringify(value) === stableStringify(candidate));

    if (!enumMatches) {
      errors.push(`${valuePath}: expected one of ${schemaWithRef.enum.map((entry) => JSON.stringify(entry)).join(', ')}.`);
    }
  }

  if (typeof value === 'string') {
    if (typeof schemaWithRef.minLength === 'number' && value.length < schemaWithRef.minLength) {
      errors.push(`${valuePath}: must have at least ${schemaWithRef.minLength} characters.`);
    }

    if (schemaWithRef.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      errors.push(`${valuePath}: must be a valid date-time string.`);
    }
  }

  if (typeof value === 'number') {
    if (typeof schemaWithRef.minimum === 'number' && value < schemaWithRef.minimum) {
      errors.push(`${valuePath}: must be >= ${schemaWithRef.minimum}.`);
    }

    if (typeof schemaWithRef.maximum === 'number' && value > schemaWithRef.maximum) {
      errors.push(`${valuePath}: must be <= ${schemaWithRef.maximum}.`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof schemaWithRef.minItems === 'number' && value.length < schemaWithRef.minItems) {
      errors.push(`${valuePath}: must have at least ${schemaWithRef.minItems} items.`);
    }

    if (schemaWithRef.uniqueItems) {
      const seen = new Set<string>();

      for (const item of value) {
        const signature = stableStringify(item);

        if (seen.has(signature)) {
          errors.push(`${valuePath}: array items must be unique.`);
          break;
        }

        seen.add(signature);
      }
    }

    if (schemaWithRef.items) {
      for (const [index, item] of value.entries()) {
        await validateAgainstSchema(item, schemaWithRef.items as JsonSchema, schemaPath, `${valuePath}/${index}`, registry, errors);
      }
    }
  }

  if (isObject(value)) {
    const properties = isObject(schemaWithRef.properties) ? schemaWithRef.properties : {};
    const requiredProperties = Array.isArray(schemaWithRef.required)
      ? schemaWithRef.required.filter((entry): entry is string => typeof entry === 'string')
      : [];

    for (const requiredProperty of requiredProperties) {
      if (!(requiredProperty in value)) {
        errors.push(`${valuePath}: missing required property "${requiredProperty}".`);
      }
    }

    if (schemaWithRef.additionalProperties === false) {
      for (const propertyName of Object.keys(value)) {
        if (!(propertyName in properties)) {
          errors.push(`${valuePath}: unexpected property "${propertyName}".`);
        }
      }
    }

    for (const [propertyName, propertySchema] of Object.entries(properties)) {
      if (propertyName in value) {
        await validateAgainstSchema(
          value[propertyName],
          propertySchema as JsonSchema,
          schemaPath,
          `${valuePath}/${propertyName}`,
          registry,
          errors,
        );
      }
    }
  }
}

export async function validateJson(value: unknown, schemaPath: string): Promise<ValidationResult> {
  const registry = new SchemaRegistry();
  const absoluteSchemaPath = resolve(schemaPath);
  const schema = await registry.loadSchema(absoluteSchemaPath);
  const errors: string[] = [];

  await validateAgainstSchema(value, schema, absoluteSchemaPath, '$', registry, errors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function validateJsonFile(jsonPath: string, schemaPath: string): Promise<ValidationResult> {
  const absoluteJsonPath = resolve(jsonPath);
  const jsonValue = JSON.parse(await readFile(absoluteJsonPath, 'utf8')) as JsonValue;
  return validateJson(jsonValue, schemaPath);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [schemaArgument, jsonArgument] = process.argv.slice(2);

  if (!schemaArgument || !jsonArgument) {
    console.error('Usage: node --experimental-strip-types runtime/validateJson.ts <schema-path> <json-path>');
    process.exitCode = 1;
  } else {
    const result = await validateJsonFile(jsonArgument, schemaArgument);

    if (result.valid) {
      console.log(`Valid JSON for ${jsonArgument} against ${schemaArgument}.`);
    } else {
      console.error(`Invalid JSON for ${jsonArgument} against ${schemaArgument}.`);
      for (const error of result.errors) {
        console.error(`- ${error}`);
      }
      process.exitCode = 1;
    }
  }
}
