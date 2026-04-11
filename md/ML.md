# ML Inference Decision Tree

## Replacing a managed API call with a local model (e.g. router → llama3.2:3b)

```
1. How many requests/min does BiAgent's router handle?
      ↓
2. Pick model (llama3.2:3b is enough for classification)
      ↓
3. Calculate: req/min → instances needed
      ↓
4. Calculate: instances × model VRAM → GPU VRAM needed
      ↓
5. One big GPU or several small?
      ↓
6. Cloud VM or on-prem?
      ↓
7. Serving framework:
     dev/low traffic  → Ollama
     production       → vLLM (continuous batching included)
      ↓
8. Batching strategy → vLLM handles this automatically
```
