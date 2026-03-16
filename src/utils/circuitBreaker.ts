import CircuitBreaker from 'opossum';

const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000
} as const;

const breakers: Map<string, CircuitBreaker> = new Map();
// Module-level so open circuit state persists across run() calls and can be injected into prompts
const openCircuits: Set<string> = new Set();

export function getOpenCircuits(): string[] {
  return Array.from(openCircuits);
}

export function getCircuitBreaker(name: string, fn?: (...args: any[]) => Promise<any>): CircuitBreaker {
  if (!breakers.has(name)) {
    if (!fn) throw new Error(`Circuit breaker "${name}" not initialized — fn required on first call`);
    const breaker = new CircuitBreaker(fn, CIRCUIT_BREAKER_OPTIONS);
    breaker.on('open', () => { openCircuits.add(name); console.warn(`⚠️ Circuit OPEN for ${name} — stopping calls`); });
    breaker.on('halfOpen', () => console.warn(`⚠️ Circuit HALF-OPEN for ${name} — probing...`));
    breaker.on('close', () => { openCircuits.delete(name); console.log(`\n✅ Circuit CLOSED for ${name} — recovered`); });
    breaker.fallback(() => ({
      success: false,
      error: `${name} is temporarily unavailable, please try again later`
    }));
    breakers.set(name, breaker);
  }
  return breakers.get(name)!;
}