import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { uploadChartToS3 } from './s3Service.js';

const ChartToolParams = z.object({
  type: z.enum(['bar', 'line', 'pie']),
  data: z.array(z.object({
    label: z.string(),
    value: z.number(),
  })),
  title: z.string().optional(),
});

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 1200,
  height: 700,
  backgroundColour: 'white',
  plugins: {
    modern: [ChartDataLabels],
  },
  chartCallback: (ChartJS) => {
    ChartJS.defaults.set('plugins.datalabels', { display: false });
  }
});

const gradientColors = [
  { start: '#3b82f6', end: '#1e40af' },
  { start: '#10b981', end: '#047857' },
  { start: '#f59e0b', end: '#d97706' },
  { start: '#ef4444', end: '#b91c1c' },
  { start: '#a855f7', end: '#7e22ce' },
];

export async function executeChart(input: unknown): Promise<{ chartUrl: string; dataPoints: number; message: string }> {
  const raw = input as any;
  if (typeof raw.data === 'string') {
    raw.data = JSON.parse(raw.data);
  }

  const validated = ChartToolParams.parse(raw);
  const labels = validated.data.map(d => d.label);
  const values = validated.data.map(d => d.value);

  let configuration: any = {
    type: validated.type,
    data: {
      labels,
      datasets: [{
        label: validated.title || 'Data',
        data: values,
        backgroundColor: gradientColors.map(g => g.start + 'DD'),
        borderColor: gradientColors.map(g => g.start),
        borderWidth: 3,
        borderRadius: validated.type === 'bar' ? 12 : 0,
        hoverBackgroundColor: gradientColors.map(g => g.start),
        hoverBorderWidth: 4,
        shadowOffsetX: 3,
        shadowOffsetY: 3,
        shadowBlur: 10,
        shadowColor: 'rgba(0, 0, 0, 0.15)',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      layout: { padding: { top: 60, right: 40, bottom: 40, left: 40 } },
      plugins: {
        title: {
          display: !!validated.title,
          text: validated.title || '',
          font: { size: 32, weight: 'bold', family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif" },
          padding: { top: 15, bottom: 35 },
          color: '#111827'
        },
        legend: {
          display: validated.type === 'pie',
          position: 'right',
          labels: {
            font: { size: 15, family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif" },
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
          titleFont: { size: 16, weight: 'bold' },
          bodyFont: { size: 14 },
          displayColors: true,
          boxPadding: 8,
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1
        },
        datalabels: {
          display: true,
          color: '#ffffff',
          backgroundColor: (context: any) => {
            const colors = ['#1e40af', '#047857', '#b45309', '#991b1b', '#6b21a8'];
            return colors[context.dataIndex % colors.length];
          },
          borderRadius: 6,
          padding: { top: 6, bottom: 6, left: 10, right: 10 },
          font: { weight: 'bold', size: 16, family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif" },
          formatter: (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
          anchor: validated.type === 'pie' ? 'center' : 'end',
          align: validated.type === 'pie' ? 'center' : 'top',
          offset: validated.type === 'pie' ? 0 : 8,
          textShadowColor: 'rgba(0, 0, 0, 0.3)',
          textShadowBlur: 4,
        }
      }
    }
  };

  if (validated.type !== 'pie') {
    configuration.options.scales = {
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0, 0, 0, 0.04)', drawBorder: false, lineWidth: 1 },
        ticks: { font: { size: 14, family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif" }, color: '#6b7280', padding: 12 }
      },
      x: {
        grid: { display: false, drawBorder: false },
        ticks: { font: { size: 14, family: "'Segoe UI', 'Helvetica Neue', 'Arial', sans-serif", weight: '500' }, color: '#374151', padding: 12, maxRotation: 45, minRotation: 0 }
      }
    };
  }

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
    configuration.options.plugins.datalabels.backgroundColor = 'rgba(59, 130, 246, 0.9)';
    configuration.options.plugins.datalabels.borderRadius = 6;
    configuration.options.plugins.datalabels.padding = 8;
  }

  if (validated.type === 'pie') {
    configuration.data.datasets[0].borderWidth = 4;
    configuration.data.datasets[0].borderColor = '#ffffff';
    configuration.options.plugins.legend.display = true;
    configuration.options.plugins.datalabels.formatter = (value: number, context: any) => {
      const total = context.chart.data.datasets[0].data.reduce((a: number, b: number) => a + b, 0);
      const percentage = ((value / total) * 100).toFixed(1);
      return `${percentage}%\n${value.toLocaleString()}`;
    };
    configuration.options.plugins.datalabels.font.size = 14;
  }

  const imageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration as any);

  const timestamp = Date.now();
  const filename = `chart_${timestamp}.png`;
  const chartsDir = join(process.cwd(), 'charts');
  if (!existsSync(chartsDir)) mkdirSync(chartsDir);
  const filepath = join(chartsDir, filename);
  writeFileSync(filepath, imageBuffer);

  const chartUrl = await uploadChartToS3(filepath);

  return { chartUrl, dataPoints: validated.data.length, message: `Chart uploaded to S3: ${chartUrl}` };
}
