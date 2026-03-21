import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Tool, ToolResult } from './types';
import { z } from 'zod';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { uploadChartToS3 } from '../services/s3Service';


export const ChartToolParams = z.object({
  type: z.enum(['bar', 'line', 'pie']).describe('Chart type'),
  data: z.array(z.object({
    label: z.string().describe('Label for this data point'),
    value: z.number().describe('Numeric value for this data point'),
  })).describe('Array of data points. MUST be an array of objects with label and value properties. Example: [{"label": "Product A", "value": 1000}, {"label": "Product B", "value": 900}]'),
  title: z.string().optional().describe('Chart title'),
});

export type ChartToolInput = z.infer<typeof ChartToolParams>;

const chartJSNodeCanvas = new ChartJSNodeCanvas({ 
  width: 1200, 
  height: 700,
  backgroundColour: 'white',
  plugins: {
    modern: [ChartDataLabels],
  },
  chartCallback: (ChartJS) => {
    // Enable shadow plugin
    ChartJS.defaults.set('plugins.datalabels', { display: false });
  }
});

// Modern gradient color schemes
const gradientColors = [
  { start: '#3b82f6', end: '#1e40af' },   // Blue gradient
  { start: '#10b981', end: '#047857' },   // Green gradient
  { start: '#f59e0b', end: '#d97706' },   // Amber gradient
  { start: '#ef4444', end: '#b91c1c' },   // Red gradient
  { start: '#a855f7', end: '#7e22ce' },   // Purple gradient
];

export const chartTool: Tool<typeof ChartToolParams> = {
  name: 'chart',
  description: 'Generate beautiful, modern charts (bar/line/pie) with gradients, shadows, and data labels as PNG images. Only use this when the user explicitly requests a chart, graph, or visualization.',
  parameters: ChartToolParams,

  execute: async (params: z.infer<typeof ChartToolParams>): Promise<ToolResult> => {
    try {
      // Claude sometimes sends data as a JSON string — normalize before validation
      const raw = params as any;
      if (typeof raw.data === 'string') {
        try {
          raw.data = JSON.parse(raw.data);
        } catch (e) {
          return {
            success: false,
            error: 'Invalid data format. Data must be an array of objects with label and value properties.',
          };
        }
      }

      const validated = ChartToolParams.parse(raw) as ChartToolInput;
      
      const labels = validated.data.map(d => d.label);
      const values = validated.data.map(d => d.value);

      // Generate chart configuration with modern styling
      let configuration: any = {
        type: validated.type,
        data: {
          labels: labels,
          datasets: [{
            label: validated.title || 'Data',
            data: values,
            // Use solid colors for now (gradients need canvas context)
            backgroundColor: gradientColors.map(g => g.start + 'DD'),
            borderColor: gradientColors.map(g => g.start),
            borderWidth: 3,
            borderRadius: validated.type === 'bar' ? 12 : 0,
            hoverBackgroundColor: gradientColors.map(g => g.start),
            hoverBorderWidth: 4,
            // Add shadow effect
            shadowOffsetX: 3,
            shadowOffsetY: 3,
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.15)',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          layout: {
            padding: {
              top: 60,
              right: 40,
              bottom: 40,
              left: 40
            }
          },
          plugins: {
            title: {
              display: !!validated.title,
              text: validated.title || '',
              font: {
                size: 32,
                weight: 'bold',
                family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif"
              },
              padding: {
                top: 15,
                bottom: 35
              },
              color: '#111827'
            },
            legend: {
              display: validated.type === 'pie',
              position: 'right',
              labels: {
                font: {
                  size: 15,
                  family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif"
                },
                padding: 20,
                usePointStyle: true,
                pointStyle: 'circle',
                color: '#374151',
                boxWidth: 15,
                boxHeight: 15
              }
            },
            tooltip: {
              enabled: true,
              backgroundColor: 'rgba(17, 24, 39, 0.95)',
              padding: 16,
              cornerRadius: 12,
              titleFont: {
                size: 16,
                weight: 'bold'
              },
              bodyFont: {
                size: 14
              },
              displayColors: true,
              boxPadding: 8,
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderWidth: 1
            },
            datalabels: {
              display: true,
              color: '#ffffff',
              backgroundColor: (context: any) => {
                // Use the same color as the bar but darker
                const colors = ['#1e40af', '#047857', '#b45309', '#991b1b', '#6b21a8'];
                return colors[context.dataIndex % colors.length];
              },
              borderRadius: 6,
              padding: { top: 6, bottom: 6, left: 10, right: 10 },
              font: {
                weight: 'bold',
                size: 16,
                family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif"
              },
              formatter: (value: number) => {
                return value.toLocaleString('en-US', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 2
                });
              },
              anchor: validated.type === 'pie' ? 'center' : 'end',
              align: validated.type === 'pie' ? 'center' : 'top',
              offset: validated.type === 'pie' ? 0 : 8,
              // Add subtle shadow to data labels
              textShadowColor: 'rgba(0, 0, 0, 0.3)',
              textShadowBlur: 4,
            }
          }
        }
      };

      // Type-specific configurations
      if (validated.type !== 'pie') {
        configuration.options.scales = {
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.04)',
              drawBorder: false,
              lineWidth: 1
            },
            ticks: {
              font: {
                size: 14,
                family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif"
              },
              color: '#6b7280',
              padding: 12
            }
          },
          x: {
            grid: {
              display: false,
              drawBorder: false
            },
            ticks: {
              font: {
                size: 14,
                family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif",
                weight: '500'
              },
              color: '#374151',
              padding: 12,
              maxRotation: 45,
              minRotation: 0
            }
          }
        };
      }

      // Line chart specific styling
      if (validated.type === 'line') {
        configuration.data.datasets[0].fill = true;
        configuration.data.datasets[0].backgroundColor = 'rgba(59, 130, 246, 0.08)';
        configuration.data.datasets[0].borderColor = '#3b82f6';
        configuration.data.datasets[0].borderWidth = 4;
        configuration.data.datasets[0].pointRadius = 7;
        configuration.data.datasets[0].pointHoverRadius = 9;
        configuration.data.datasets[0].pointBackgroundColor = '#3b82f6';
        configuration.data.datasets[0].pointBorderColor = '#ffffff';
        configuration.data.datasets[0].pointBorderWidth = 3;
        configuration.data.datasets[0].tension = 0.4;
        
        // Data labels for line chart with background
        configuration.options.plugins.datalabels.backgroundColor = 'rgba(59, 130, 246, 0.9)';
        configuration.options.plugins.datalabels.borderRadius = 6;
        configuration.options.plugins.datalabels.padding = 8;
      }

      // Pie chart specific styling
      if (validated.type === 'pie') {
        configuration.data.datasets[0].borderWidth = 4;
        configuration.data.datasets[0].borderColor = '#ffffff';
        configuration.options.plugins.legend.display = true;
        
        // Pie chart data labels with percentage
        configuration.options.plugins.datalabels.formatter = (value: number, context: any) => {
          const total = context.chart.data.datasets[0].data.reduce((a: number, b: number) => a + b, 0);
          const percentage = ((value / total) * 100).toFixed(1);
          return `${percentage}%\n${value.toLocaleString()}`;
        };
        configuration.options.plugins.datalabels.font.size = 14;
      }

      // Generate image buffer
      const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration as any);
      
      // Save to file
      const timestamp = Date.now();
      const filename = `chart_${timestamp}.png`;
      const filepath = join(process.cwd(), 'charts', filename);
      
      // Create charts directory if it doesn't exist
      if (!existsSync(join(process.cwd(), 'charts'))) {
        mkdirSync(join(process.cwd(), 'charts'));
      }
      
      writeFileSync(filepath, imageBuffer);
      
      // Upload to S3
      const chartUrl = await uploadChartToS3(filepath);

      return {
        success: true,
        data: { chartUrl, dataPoints: validated.data.length },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};