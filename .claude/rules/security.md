# Security rules

- Never commit secrets, API keys, or credentials. Use `.env` (gitignored) locally and AWS Secrets Manager / SSM in deployed environments.
- Infrastructure changes go through CDK only — no manual console changes to IAM, Lambda, or data stores.
- Apply least-privilege IAM per workload; do not reuse one broad application role across functions.
- GitHub deploys authenticate to AWS via OIDC — no long-lived AWS access keys stored in GitHub.

(This file is a stub — expand it as real IAM roles, secrets, and deploy paths are introduced.)
