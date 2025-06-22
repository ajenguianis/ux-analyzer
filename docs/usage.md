

```markdown
# UX Analyzer Usage Guide

## Command-Line Options
- `--url <string>`: URL to analyze (e.g., `https://www.brevo.com`).
- `--html <string>`: Path to local HTML file (e.g., `./brevo.html`).
- `--output <string>`: Output directory (default: `./ux-analysis`).
- `--screenshot`: Capture desktop and mobile screenshots.
- `--performance`: Analyze performance metrics (FCP, LCP).
- `--deep`: Perform deep analysis (larger HTML limit).

## Example Commands
```bash
# Full analysis with screenshots
node ux-analyzer.js --url https://www.brevo.com --screenshot --performance --deep

# Local HTML analysis
node ux-analyzer.js --html ./examples/brevo.html --output ./analysis-brevo

# Minimal analysis
node ux-analyzer.js --url https://example.com