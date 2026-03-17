import { z } from 'zod';
import { Tool, ToolResult } from './types.js';

const ForecastInputSchema = z.object({
  historicalData: z.array(z.object({
    month: z.string(),
    revenue: z.number()
  })),
  monthsAhead: z.number().int().positive()
});

export const forecastTool: Tool<typeof ForecastInputSchema> = {
  name: 'forecast_revenue',
  description: 'Forecast future revenue based on historical monthly data using linear trend analysis. Pass historical data as array of {month, revenue} objects.',
  parameters: ForecastInputSchema,
  execute: async (params: z.infer<typeof ForecastInputSchema>): Promise<ToolResult> => {
    try {
      const { historicalData, monthsAhead } = ForecastInputSchema.parse(params);

      const n = historicalData.length;
      const revenues = historicalData.map(d => d.revenue);

      const avgGrowth = revenues.reduce((sum, rev, i) => {
        if (i === 0) return sum;
        return sum + (rev - revenues[i - 1]);
      }, 0) / (n - 1);

      const lastRevenue = revenues[n - 1];
      const lastMonth = new Date(historicalData[n - 1].month);

      const results: { month: string; forecastedRevenue: number }[] = [];
      for (let i = 1; i <= monthsAhead; i++) {
        const forecastMonth = new Date(lastMonth);
        forecastMonth.setMonth(forecastMonth.getMonth() + i);
        results.push({
          month: forecastMonth.toISOString().slice(0, 7),
          forecastedRevenue: Math.round(lastRevenue + avgGrowth * i)
        });
      }

      return { success: true, data: results };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
