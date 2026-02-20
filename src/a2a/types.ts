export interface A2ATool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
}