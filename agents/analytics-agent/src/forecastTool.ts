import { z } from 'zod';

const ForecastInputSchema = z.object({
  historicalData: z.array(z.object({
    month: z.string(),
    revenue: z.number()
  })),
  monthsAhead: z.number().int().positive()
});

export async function executeForecast(input: unknown): Promise<{ forecasts: { month: string; forecastedRevenue: number }[] }> {
  const { historicalData, monthsAhead } = ForecastInputSchema.parse(input);

  const n = historicalData.length;
  const revenues = historicalData.map(d => d.revenue);

  const avgGrowth = revenues.reduce((sum, rev, i) => {
    if (i === 0) return sum;
    return sum + (rev - revenues[i - 1]);
  }, 0) / (n - 1);

  const lastRevenue = revenues[n - 1];
  const lastMonth = new Date(historicalData[n - 1].month);

  const forecasts: { month: string; forecastedRevenue: number }[] = [];
  for (let i = 1; i <= monthsAhead; i++) {
    const forecastMonth = new Date(lastMonth);
    forecastMonth.setMonth(forecastMonth.getMonth() + i);
    forecasts.push({
      month: forecastMonth.toISOString().slice(0, 7),
      forecastedRevenue: Math.round(lastRevenue + avgGrowth * i)
    });
  }

  return { forecasts };
}
