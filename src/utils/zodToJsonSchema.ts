// Anthropic's API expects JSON Schema, not Zod — this converts our tool parameter schemas.
// Uses Zod v4 internals (_zod.def) with a fallback to v3 (_def) for array/object shapes.
function zodTypeToJsonSchema(zodType: any): Record<string, any> {
  const type = zodType._zod?.def?.type;

  switch (type) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'array': {
      const element = zodType._def?.element;
      const itemSchema = element ? zodTypeToJsonSchema(element) : { type: 'object' };
      return { type: 'array', items: itemSchema };
    }
    case 'object': {
      const shape = zodType._def?.shape;
      if (shape) {
        const props: Record<string, any> = {};
        for (const [k, v] of Object.entries(shape)) {
          props[k] = zodTypeToJsonSchema(v as any);
        }
        return { type: 'object', properties: props };
      }
      return { type: 'object' };
    }
    case 'enum': {
      const entries = zodType._def?.entries;
      return { type: 'string', enum: entries ? Object.keys(entries) : [] };
    }
    case 'optional': {
      const inner = zodType._def?.innerType;
      return inner ? zodTypeToJsonSchema(inner) : { type: 'string' };
    }
    default:
      return { type: 'string' };
  }
}

export function zodToJsonSchema(schema: any): Record<string, any> {
  const shape = schema._def?.shape;
  const properties: Record<string, any> = {};

  for (const [key, zodType] of Object.entries(shape)) {
    properties[key] = zodTypeToJsonSchema(zodType as any);
  }

  return properties;
}
