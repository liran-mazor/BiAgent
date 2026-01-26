import { create, all } from 'mathjs';
import { z } from 'zod';
import { Tool, ToolResult } from './types';

const math = create(all);

export const CalculatorToolParams = z.object({
  expression: z.string().describe('Mathematical expression to evaluate. Supports: arithmetic (+,-,*,/,^), functions (sqrt, abs, round), statistics (mean, median, std, variance), arrays. Examples: "((150 - 120) / 120) * 100", "mean([23, 45, 67])", "sqrt(144)"'),
});

export type CalculatorToolInput = z.infer<typeof CalculatorToolParams>;

export const calculatorTool: Tool = {
  name: 'calculator',
  description: 'Evaluate mathematical expressions and perform calculations. Use this for: growth rates, percentages, statistical calculations (mean, std, variance), complex arithmetic. Can handle arrays and mathematical functions.',
  parameters: CalculatorToolParams,
  
  execute: async (params: any): Promise<ToolResult> => {
    try {
      // Validate input
      const validated = CalculatorToolParams.parse(params) as CalculatorToolInput;
      
      // Evaluate expression
      const result = math.evaluate(validated.expression);
      
      return {
        success: true,
        data: {
          expression: validated.expression,
          result: result,
          formatted: typeof result === 'number' ? result.toFixed(2) : String(result),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to evaluate expression',
      };
    }
  },
};