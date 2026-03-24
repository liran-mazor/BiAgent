# BiAgent Retail Co — IT Infrastructure & Security Policy 2025
**Document type:** Policy
**Year:** 2025
**Prepared by:** IT & Operations
**Date:** February 1, 2025
**Confidential — Internal Use Only**

---

## Overview

This document covers IT infrastructure standards, cloud cost allocation, data retention rules, and access control policy for fiscal year 2025. It applies to all internal systems, third-party integrations, and contractor access.

---

## Cloud Infrastructure

### AWS Account Structure
- **Production:** Single AWS account, `us-east-1` primary region, `eu-west-1` standby for EMEA pre-compliance work.
- **Staging:** Isolated account. No production data. Refresh from anonymized snapshots weekly.
- **Development:** Developer sandbox accounts provisioned per-team. Auto-shutdown after 72 hours of inactivity.

### Monthly Cloud Budget (2025)
| Service | Monthly Budget | Owner |
|---------|---------------|-------|
| EC2 (compute) | $3,200 | Engineering |
| RDS (PostgreSQL) | $1,100 | Engineering |
| S3 (storage + CDN) | $620 | Engineering |
| CloudFront | $280 | Engineering |
| SES (email) | $90 | Marketing |
| Other (monitoring, logging) | $410 | Engineering |
| **Total** | **$5,700** | |

Cloud spend over $6,500/month in any rolling 30-day period triggers a mandatory review with Finance before the 15th of the following month.

### Cost Allocation Tags
All AWS resources must carry:
- `env`: `production` | `staging` | `development`
- `team`: `engineering` | `marketing` | `ops`
- `cost-center`: four-digit code per Finance chart of accounts

Untagged resources are flagged automatically and will be terminated after 7 days without a support ticket exemption.

---

## Data Policy

### Retention Schedule
| Data Type | Retention | Storage |
|-----------|-----------|---------|
| Order records | 7 years | RDS + annual cold archive |
| Customer PII | Active + 3 years post-deletion request | RDS |
| Application logs | 90 days | CloudWatch → S3 |
| Audit logs | 3 years | S3 Glacier |
| Analytics events | 2 years | S3 |

### PII Handling
- Customer email addresses, shipping addresses, and payment tokens are classified as PII.
- PII may not be stored in application logs, Slack messages, or development environments.
- Payment data: we do not store card numbers. Stripe tokenizes at capture. Our systems store only the Stripe customer ID and last-4.

---

## Access Control

### Principle of Least Privilege
All AWS IAM roles are scoped to the minimum required actions. No `*:*` policies in production. Policy reviews conducted quarterly by the Engineering lead.

### Admin Access
- Production console access: Engineering lead + one designated backup only.
- All production changes must go through CI/CD pipeline. No direct console modifications to production resources.
- Emergency console access logged via CloudTrail and reviewed within 24 hours.

### Third-Party Integrations (2025 Active)
| Vendor | Access Level | Data Shared |
|--------|-------------|-------------|
| Stripe | Payment processing | Order amount, customer ID |
| Klaviyo | Email marketing | Email, name, purchase history |
| Hotjar | Session recording | Anonymized behavior only |
| Cohere | NLP / reranking API | Query text (no PII) |
| Tavily | Web search API | Search queries (no PII) |

All third-party vendors must maintain SOC 2 Type II certification or equivalent. Annual review in December.

---

## Incident Response

### Severity Levels
| Level | Definition | Response Time |
|-------|-----------|---------------|
| P1 | Production down or data breach | 15 minutes |
| P2 | Degraded production, no data risk | 1 hour |
| P3 | Non-production issue | Next business day |
| P4 | Request / improvement | Sprint planning |

### Breach Notification
Any confirmed PII breach must be reported to the CEO and legal counsel within 2 hours of confirmation. GDPR notification to relevant supervisory authority required within 72 hours if EU data is affected. All customer notifications drafted by legal, not Engineering.

---

## Monitoring & Alerting

- **Uptime monitoring:** Datadog synthetic checks on all production endpoints. Alert threshold: 2 consecutive failures.
- **Error rate:** PagerDuty alert if 5xx rate exceeds 1% for more than 3 minutes.
- **Cost anomaly:** AWS Cost Anomaly Detection with 20% threshold. Notifications to `#eng-alerts` Slack channel.
- **Database:** RDS enhanced monitoring, 60-second granularity. Alert on CPU > 80% sustained for 5 minutes.

---

## Policy Exceptions

Exceptions to any policy in this document require written approval from the Engineering lead and Finance (for cost-related exceptions) or CEO (for data policy exceptions). Exception requests submitted via IT ticketing system. Maximum exception duration: 90 days, renewable with re-approval.
