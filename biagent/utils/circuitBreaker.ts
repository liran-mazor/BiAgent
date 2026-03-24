import CircuitBreaker from 'opossum';

const CIRCUIT_BREAKER_OPTIONS = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000
};

const A2A_CIRCUIT_BREAKER_OPTIONS = {
  ...CIRCUIT_BREAKER_OPTIONS,
  timeout: 30000,
};

const breakers: Map<string, CircuitBreaker> = new Map();
// Module-level so open circuit state persists across run() calls and can be injected into prompts
const openCircuits: Set<string> = new Set();

export function getOpenCircuits(): string[] {
  return Array.from(openCircuits);
}

export function markCircuitOpen(name: string): void {
  openCircuits.add(name);
}

export function getCircuitBreaker(name: string, fn?: (...args: any[]) => Promise<any>, isA2A = false): CircuitBreaker {
  if (!breakers.has(name)) {
    if (!fn) throw new Error(`Circuit breaker "${name}" not initialized — fn required on first call`);
    const breaker = new CircuitBreaker(fn, isA2A ? A2A_CIRCUIT_BREAKER_OPTIONS : CIRCUIT_BREAKER_OPTIONS);
    breaker.on('open', () => { openCircuits.add(name); console.warn(`⚠️ Circuit OPEN for ${name} — stopping calls`); });
    breaker.on('halfOpen', () => console.warn(`⚠️ Circuit HALF-OPEN for ${name} — probing...`));
    breaker.on('close', () => { openCircuits.delete(name); console.log(`\n✅ Circuit CLOSED for ${name} — recovered`); });
    breaker.on('failure', (error) => console.error(`    ❌ Circuit failure for ${name}: ${error?.message}`));
    breaker.fallback(() => ({
      success: false,
      error: `${name} is temporarily unavailable, please try again later`
    }));
    breakers.set(name, breaker);
  }
  return breakers.get(name)!;
}