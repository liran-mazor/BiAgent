# Routing Strategy: Haiku vs Embedding

---

## Cost Breakdown (1,000 queries/day, 85% simple / 15% complex)

### Embedding Approach
```
Daily costs:
- Routing (embeddings):   1,000 × $0.00002 = $0.02
- Simple queries (Haiku): 850 × $0.003    = $2.55
- Complex queries (Sonnet): 150 × $0.015  = $2.25
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total daily: $4.82
Monthly API: $144.60

Maintenance overhead:
- Update embeddings when adding tools
- Retrain similarity thresholds
Accuracy: 80-85%
```

### Haiku Approach
```
Daily costs:
- Routing (Haiku):        1,000 × $0.0003 = $0.30
- Simple queries (Haiku): 850 × $0.003    = $2.55
- Complex queries (Sonnet): 150 × $0.015  = $2.25
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total daily: $5.10
Monthly API: $153.00

Maintenance: $0 (self-adapting)
Accuracy: 95%
```
---