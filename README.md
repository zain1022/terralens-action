# TerraLens GitHub Action
Analyze Terraform plans on every pull request with AI-powered risk detection, cost estimates, and a pre-apply checklist — posted directly as a PR comment.
## What it does
- Detects risky changes (destroyed resources, IAM permission shifts, security group exposure)
- Estimates the monthly cost impact of every plan
- Generates a plain-English explanation of each resource change
- Produces a pre-apply checklist your team can check off before merging
- Posts the analysis as a PR comment (or updates the existing comment on push)
## Quick start
Add this to `.github/workflows/terralens.yml` in your repo:
```yaml
name: TerraLens
on:
  pull_request:
    paths:
      - "**.tf"
      - ".github/workflows/terralens.yml"
jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.9.0"
      - name: Terraform init
        run: terraform init
      - name: Terraform plan
        run: |
          terraform plan -out=tfplan
          terraform show -json tfplan > plan.json
      - name: Analyze with TerraLens
        uses: zain1022/terralens-action@v1
        with:
          plan-file: plan.json
          api-key: ${{ secrets.TERRALENS_API_KEY }}
```
The JSON plan format (`terraform show -json`) is recommended — it gives TerraLens complete, structured data for the most accurate analysis. The classic text format (`terraform show -no-color tfplan > plan.txt`) still works too; TerraLens auto-detects the format from the file contents.
## Inputs
| Input | Required | Description |
|-------|----------|-------------|
| `plan-file` | Yes | Path to your terraform plan output. Recommended: JSON from `terraform show -json tfplan > plan.json`. Text output from `terraform show -no-color` also works. |
| `api-key` | No | Your TerraLens Pro API key. Generate at [terralens.io/account](https://terralens.io/account) |
| `format` | No | Plan format: `json` or `text`. Leave blank to auto-detect from the file contents (recommended). |
| `github-token` | No | Defaults to the workflow's `github.token` |
## Outputs
| Output | Description |
|--------|-------------|
| `risk-level` | Highest severity found: `critical`, `high`, `medium`, `low`, or `none` |
| `cost-delta` | Estimated monthly cost change in USD |
| `safe-to-apply` | `true` if no critical risks were detected |
## Pricing
- **Free**: 5 PR analyses per repository per month
- **Pro**: Unlimited PR analyses across unlimited repos. [Upgrade at terralens.io](https://terralens.io/pricing)
Pro users get analyses powered by Claude Opus 4.7 (our most advanced AI model). Free users use Claude Sonnet 4.6, which is still excellent — just with monthly per-repo limits.
## Privacy
Plans are processed in-memory and not stored in our database unless you explicitly save them via the web UI. See our full [privacy policy](https://terralens.io/privacy) and [security details](https://terralens.io/security).
## Support
- Website: [terralens.io](https://terralens.io)
- Issues: [github.com/zain1022/terralens-action/issues](https://github.com/zain1022/terralens-action/issues)
- Email: support@terralens.io
## License
MIT
