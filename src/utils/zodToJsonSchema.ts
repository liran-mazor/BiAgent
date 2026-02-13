export function zodToJsonSchema(schema: any): Record<string, any> {
  // Access shape as property, not function
  const shape = schema._def.shape;
  
  const properties: Record<string, any> = {};

  for (const [key, zodType] of Object.entries(shape)) {
    const typeDef = (zodType as any)._def;
    
    // Handle different Zod types
    if (typeDef.typeName === 'ZodString') {
      properties[key] = { 
        type: 'string',
        description: typeDef.description || undefined
      };
    } else if (typeDef.typeName === 'ZodNumber') {
      properties[key] = { 
        type: 'number',
        description: typeDef.description || undefined
      };
    } else if (typeDef.typeName === 'ZodArray') {
      properties[key] = { 
        type: 'array',
        description: typeDef.description || undefined,
        items: { type: 'object' }
      };
    } else if (typeDef.typeName === 'ZodEnum') {
      properties[key] = { 
        type: 'string',
        enum: typeDef.values,
        description: typeDef.description || undefined
      };
    } else if (typeDef.typeName === 'ZodOptional') {
      const innerType = typeDef.innerType._def;
      properties[key] = { 
        type: innerType.typeName === 'ZodString' ? 'string' : 'object',
        description: innerType.description || undefined
      };
    } else {
      properties[key] = { type: 'string' };
    }
  }

  return properties;
}