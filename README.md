# UX Analyzer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Contributions Welcome](https://img.shields.io/badge/Contributions-Welcome-brightgreen.svg)](CONTRIBUTING.md)

A powerful Node.js tool for analyzing web pages to drive **UI/UX modernization**. Extract styles, detect frameworks, evaluate accessibility, measure performance, and generate detailed modernization prompts for AI-driven design improvements. Perfect for analyzing SaaS platforms like [Brevo](https://www.brevo.com) or any modern web app.

## ✨ Features

### 1. Robust Framework Detection
- **Supported Frameworks**: TailwindCSS, Bootstrap, Bulma, Materialize, Foundation.
- **Confidence Scoring**: Prioritizes detections with a confidence-based system.
- **Multi-Framework Support**: Identifies primary and secondary frameworks.

### 2. Advanced Color & Typography Analysis
- **Color Palette**: Counts color occurrences (e.g., `#0059FF (5x)`), supports Tailwind classes.
- **Typography**: Detects fonts (e.g., Inter, Poppins), sizes, and weights from CSS and computed styles.
- **Utility Classes**: Recognizes modern utility classes (e.g., `text-primary`, `font-bold`).

### 3. Enhanced Accessibility Audit
- **WCAG 2.1 Checks**: Validates H1 usage, image alt tags, link hrefs, and form labels.
- **Contrast Detection**: Flags low-contrast issues (basic).
- **Issue Categorization**: Groups problems (images, links, headings, forms) with a score (e.g., 80/100).

### 4. Powerful New Features
- **Screenshots**: Captures desktop (1920x1080) and mobile (375x667) views.
- **Performance Metrics**: Measures First Contentful Paint (FCP), Largest Contentful Paint (LCP), and load time.
- **Deep Analysis Mode**: Processes larger HTML with `--deep` (up to 150,000 chars).
- **Site Type Detection**: Infers context (SaaS, e-commerce, blog, etc.) from metadata and content.

### 5. Rich Modernization Prompt
- **Comprehensive Analysis**: Includes framework, colors, typography, style, accessibility, and structure.
- **Prioritized Recommendations**: Guides UX improvements (e.g., fix accessibility, optimize responsive design).
- **Implementation Phases**: Structured roadmap for modernization (foundations, implementation, optimization).
- **Validation Checklist**: Ensures design coherence, performance, and WCAG compliance.

### 6. Multiple Outputs
- **Prompt**: `uxui-prompt-advanced.md` for AI-driven UI redesign.
- **JSON Data**: `analysis-data.json` for programmatic use.
- **Executive Summary**: `rapport-synthese.md` with key metrics and actions.
- **Screenshots**: `screenshot-desktop.png`, `screenshot-mobile.png` (if enabled).
- **Source HTML**: `source.html` (for URL-based analysis).

## 🚀 Getting Started

### Prerequisites
- **Node.js** >= 18 ([Download](https://nodejs.org))
- **curl** (system-installed, verify with `curl --version`)
- **Git** (for cloning the repo)

### Installation
```bash
git clone https://github.com/your-username/ux-analyzer.git
cd ux-analyzer
npm install
```

### Usage
Run the tool with various options to analyze live URLs or local HTML files.

```bash
# Basic URL analysis
node ux-analyzer.js --url https://www.brevo.com

# Full analysis with screenshots and performance
node ux-analyzer.js --url https://www.brevo.com --screenshot --performance --deep

# Local HTML with deep analysis
node ux-analyzer.js --html ./examples/brevo.html --deep --output ./analysis-brevo
```

### Command-Line Options
| Option          | Description                                      | Default            |
|-----------------|--------------------------------------------------|--------------------|
| `--url <string>`| URL to analyze (e.g., `https://www.brevo.com`)   | -                  |
| `--html <string>`| Local HTML file path (e.g., `./brevo.html`)     | -                  |
| `--output <string>`| Output directory                              | `./ux-analysis`    |
| `--screenshot`  | Capture desktop/mobile screenshots               | Disabled           |
| `--performance`| Measure FCP, LCP, and load time                  | Disabled           |
| `--deep`        | Deep analysis (larger HTML limit)                | Disabled           |

### Example Output
For `https://www.brevo.com`:
```markdown
### Identité visuelle existante
- **Palette de couleurs principales**: #0059FF (5x), #FFFFFF (10x), #1F2A44 (3x)
- **Typographie**: Inter (8x), Poppins (4x)
- **Style général**: Moderne (design system)
```

Files generated in `./ux-analysis`:
- `uxui-prompt-advanced.md`
- `analysis-data.json`
- `rapport-synthese.md`
- `screenshot-desktop.png`, `screenshot-mobile.png` (if `--screenshot`)
- `source.html` (if `--url`)

## 🛠️ How It Works
1. **Crawling**: Uses Puppeteer for live URLs or JSDOM for local HTML.
2. **CSS Extraction**: Fetches external stylesheets (e.g., `/_next/static/css/*.css`) via `curl`.
3. **Analysis**: Detects frameworks, extracts colors/typography, audits accessibility, and measures performance.
4. **Output**: Generates a detailed prompt, JSON data, and summary report for UI/UX modernization.

## 📂 Repository Structure
```
ux-analyzer/
├── ux-analyzer.js        # Main script
├── package.json          # Dependencies and scripts
├── README.md             # Project overview
├── LICENSE               # MIT License
├── examples/             # Sample inputs/outputs
│   ├── brevo.html        # Example HTML
│   └── example-output/   # Sample analysis
└── docs/                 # Documentation
    └── usage.md          # Detailed usage guide
```

## 🤝 Contributing
Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. Suggested improvements:
- Add Core Web Vitals (CLS, INP) analysis.
- Integrate Lighthouse for automated audits.
- Support PDF report export.
- Enable API mode for CI/CD integration.
- Create site-type-specific prompt templates.

## 📜 License
[MIT License](LICENSE) - feel free to use, modify, and distribute.

## 🙌 Acknowledgments
- Built with [Puppeteer](https://pptr.dev), [JSDOM](https://github.com/jsdom/jsdom), and [Commander](https://github.com/tj/commander.js).
- Inspired by the need to modernize SaaS interfaces like Brevo.

## 📞 Contact
Have questions or ideas? Open an [issue](https://github.com/your-username/ux-analyzer/issues) or reach out to [ajenguianis@gmail.com](mailto:ajenguianis@gmail.com).

---

**Ready to modernize your UI?** Clone the repo and start analyzing today! 🚀