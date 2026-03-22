export interface A2ATool {
  name: string;
  description: string;
  input_schema: object;
  execute: (input: any) => Promise<{ success: boolean; data?: any; error?: string }>;
}