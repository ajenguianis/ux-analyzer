#!/usr/bin/env node
const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const { program } = require("commander");
const { JSDOM } = require("jsdom");
const css = require("css");
const { execSync } = require("child_process");

program
    .option("--url <string>", "URL du site")
    .option("--html <string>", "Fichier HTML local")
    .option("--output <string>", "Dossier de sortie", "./ux-analysis")
    .option("--screenshot", "Capturer des screenshots")
    .option("--performance", "Analyser les performances")
    .option("--deep", "Analyse approfondie (plus lent)")
    .parse();

const { url, html, output, screenshot, performance, deep } = program.opts();
if (!url && !html) {
    console.error("❌ URL ou fichier HTML requis");
    process.exit(1);
}

// Frameworks étendus avec plus de détection
const FRAMEWORKS = {
    tailwind: {
        indicators: [/tailwind\.css/, /cdn\.tailwindcss\.com/, /tw-/, /text-/, /bg-/, /flex/, /grid/, /space-/],
        versionPattern: /tailwindcss@([\d.]+)/,
        priority: 1
    },
    bootstrap: {
        indicators: [/bootstrap(?:\.min)?\.css/, /data-bs-/, /btn-/, /container/, /row/, /col-/],
        versionPattern: /bootstrap@([\d.]+)/,
        priority: 2
    },
    bulma: {
        indicators: [/bulma(?:\.min)?\.css/, /is-/, /has-/, /column/],
        versionPattern: /bulma@([\d.]+)/,
        priority: 3
    },
    materialize: {
        indicators: [/materialize/, /material-icons/, /waves-effect/],
        versionPattern: /materialize@([\d.]+)/,
        priority: 4
    },
    foundation: {
        indicators: [/foundation/, /grid-x/, /cell/],
        versionPattern: /foundation@([\d.]+)/,
        priority: 5
    }
};

// Mapping couleurs Tailwind étendu
const tailwindMap = {
    colors: {
        "text-blue-500": "#3B82F6", "text-red-500": "#EF4444", "bg-blue-500": "#3B82F6", "bg-red-500": "#EF4444",
        "text-gray-800": "#1F2937", "text-gray-900": "#111827", "bg-white": "#FFFFFF", "bg-gray-50": "#F9FAFB",
        "text-primary": "#0059FF", "bg-primary": "#0059FF", "text-secondary": "#1F2A44", "bg-secondary": "#1F2A44",
        // Ajout des couleurs Tailwind populaires
        "text-emerald-500": "#10B981", "bg-emerald-500": "#10B981",
        "text-purple-500": "#8B5CF6", "bg-purple-500": "#8B5CF6",
        "text-pink-500": "#EC4899", "bg-pink-500": "#EC4899",
        "text-yellow-500": "#F59E0B", "bg-yellow-500": "#F59E0B",
    },
    fonts: {
        "font-sans": "ui-sans-serif, system-ui, sans-serif",
        "font-serif": "ui-serif, Georgia, serif",
        "font-mono": "ui-monospace, monospace",
        "font-roboto": "Roboto, sans-serif", "font-inter": "Inter, sans-serif",
        "font-poppins": "Poppins, sans-serif", "font-nunito": "Nunito, sans-serif",
        "font-open-sans": "Open Sans, sans-serif", "font-lato": "Lato, sans-serif",
    },
};

const fetchCssWithCurl = (cssUrl, baseUrl) => {
    try {
        console.log(`📥 Récupération CSS : ${cssUrl}`);
        const cssContent = execSync(`curl -s --fail -L --max-time 10 -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -H "Referer: ${baseUrl}" "${cssUrl}"`, { encoding: "utf-8" });
        console.log(`✅ CSS récupéré (${cssContent.length} caractères)`);
        return cssContent;
    } catch (e) {
        console.warn(`⚠️ Échec récupération ${cssUrl}: ${e.message}`);
        return "";
    }
};

const detectFramework = (htmlContent, cssContent) => {
    const detectedFrameworks = [];

    for (const [name, config] of Object.entries(FRAMEWORKS)) {
        const matchCount = config.indicators.filter(regex =>
            regex.test(htmlContent) || regex.test(cssContent)
        ).length;

        if (matchCount > 0) {
            const versionMatch = htmlContent.match(config.versionPattern) || cssContent.match(config.versionPattern);
            detectedFrameworks.push({
                name,
                version: versionMatch ? versionMatch[1] : "unknown",
                confidence: matchCount,
                priority: config.priority
            });
        }
    }

    if (detectedFrameworks.length === 0) {
        return { name: "CSS Vanilla ou framework personnalisé", version: null, detected: false, confidence: 0 };
    }

    // Retourner le framework avec la meilleure confiance
    const best = detectedFrameworks.sort((a, b) => b.confidence - a.confidence || a.priority - b.priority)[0];
    return { ...best, detected: true, alternatives: detectedFrameworks.slice(1) };
};

const extractColorPalette = (cssContent, htmlContent, computedStyles) => {
    const colors = new Map(); // Utiliser Map pour compter les occurrences
    const colorRegex = /(#(?:[0-9a-fA-F]{3}){1,2}|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)|hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(?:,\s*[\d.]+\s*)?\))/gi;

    // Analyser CSS
    const cssMatches = cssContent.match(colorRegex) || [];
    cssMatches.forEach(color => {
        const normalized = color.toLowerCase();
        colors.set(normalized, (colors.get(normalized) || 0) + 1);
    });

    // Analyser HTML inline styles
    const dom = new JSDOM(htmlContent);
    dom.window.document.querySelectorAll("[style]").forEach((el) => {
        const style = el.getAttribute("style") || "";
        const styleMatches = style.match(colorRegex) || [];
        styleMatches.forEach(color => {
            const normalized = color.toLowerCase();
            colors.set(normalized, (colors.get(normalized) || 0) + 1);
        });
    });

    // Analyser classes Tailwind
    dom.window.document.querySelectorAll("[class]").forEach((el) => {
        const className = el.getAttribute("class");
        if (typeof className === "string") {
            className.split(/\s+/).forEach((cls) => {
                if (tailwindMap.colors[cls]) {
                    const color = tailwindMap.colors[cls];
                    colors.set(color.toLowerCase(), (colors.get(color.toLowerCase()) || 0) + 1);
                }
            });
        }
    });

    // Analyser styles calculés
    computedStyles?.forEach(({ color, backgroundColor }) => {
        if (color && color !== "rgba(0, 0, 0, 0)" && color !== "rgb(0, 0, 0)") {
            colors.set(color.toLowerCase(), (colors.get(color.toLowerCase()) || 0) + 1);
        }
        if (backgroundColor && backgroundColor !== "rgba(0, 0, 0, 0)" && backgroundColor !== "rgb(255, 255, 255)") {
            colors.set(backgroundColor.toLowerCase(), (colors.get(backgroundColor.toLowerCase()) || 0) + 1);
        }
    });

    // Trier par fréquence et retourner les plus populaires
    const sortedColors = Array.from(colors.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([color, count]) => `${color} (${count}x)`);

    const detectedColors = sortedColors.join(", ") || "Non détecté";
    console.log(`🎨 Palette couleurs : ${detectedColors}`);
    return { palette: detectedColors, count: colors.size };
};

const analyzeTypography = (cssContent, htmlContent, computedStyles) => {
    const fonts = new Map();
    const fontSizes = new Set();
    const fontWeights = new Set();

    try {
        const parsed = css.parse(cssContent, { silent: true });
        parsed.stylesheet.rules.forEach((rule) => {
            if (rule.declarations) {
                rule.declarations.forEach((decl) => {
                    if (decl.property === "font-family") {
                        const fontName = decl.value.replace(/['"]/g, "").split(",")[0].trim();
                        fonts.set(fontName, (fonts.get(fontName) || 0) + 1);
                    }
                    if (decl.property === "font-size") {
                        fontSizes.add(decl.value);
                    }
                    if (decl.property === "font-weight") {
                        fontWeights.add(decl.value);
                    }
                });
            }
        });
    } catch (e) {
        console.warn(`⚠️ Erreur parsing CSS pour typographie : ${e.message}`);
    }

    // Analyser classes Tailwind pour les fonts
    const dom = new JSDOM(htmlContent);
    dom.window.document.querySelectorAll("[class]").forEach((el) => {
        const className = el.getAttribute("class");
        if (typeof className === "string") {
            className.split(/\s+/).forEach((cls) => {
                if (tailwindMap.fonts[cls]) {
                    const fontName = tailwindMap.fonts[cls];
                    fonts.set(fontName, (fonts.get(fontName) || 0) + 1);
                }
                // Détecter tailles Tailwind
                if (/text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)/.test(cls)) {
                    fontSizes.add(cls);
                }
                // Détecter poids Tailwind
                if (/font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)/.test(cls)) {
                    fontWeights.add(cls);
                }
            });
        }
    });

    // Analyser styles calculés
    computedStyles?.forEach(({ fontFamily, fontSize, fontWeight }) => {
        if (fontFamily) {
            const fontName = fontFamily.split(",")[0].trim().replace(/['"]/g, "");
            fonts.set(fontName, (fonts.get(fontName) || 0) + 1);
        }
        if (fontSize) fontSizes.add(fontSize);
        if (fontWeight) fontWeights.add(fontWeight);
    });

    const sortedFonts = Array.from(fonts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([font, count]) => `${font} (${count}x)`);

    const result = {
        fonts: sortedFonts.length > 0 ? sortedFonts.join(", ") : "System fonts",
        sizes: Array.from(fontSizes).slice(0, 8).join(", ") || "Non spécifié",
        weights: Array.from(fontWeights).slice(0, 6).join(", ") || "Non spécifié"
    };

    console.log(`🔤 Typographie :`);
    console.log(`   Fonts: ${result.fonts}`);
    console.log(`   Tailles: ${result.sizes}`);
    console.log(`   Poids: ${result.weights}`);
    return result;
};

const detectGeneralStyle = (htmlContent, cssContent) => {
    const dom = new JSDOM(htmlContent);
    const imgCount = dom.window.document.querySelectorAll("img").length;
    const videoCount = dom.window.document.querySelectorAll("video").length;
    const svgCount = dom.window.document.querySelectorAll("svg").length;

    const whitespace = (cssContent.match(/padding|margin/g) || []).length;
    const animations = (cssContent.match(/animation|transition|transform/g) || []).length;
    const gradients = (cssContent.match(/gradient/g) || []).length;
    const shadows = (cssContent.match(/shadow/g) || []).length;

    const hasTailwind = /tailwind|tw-/.test(htmlContent) || /tailwind|tw-/.test(cssContent);
    const hasBootstrap = /bootstrap|btn-|container/.test(htmlContent) || /bootstrap/.test(cssContent);

    let style = "Classique";
    let confidence = "faible";

    if (animations > 10 || gradients > 5) {
        style = "Moderne (riche en animations)";
        confidence = "élevée";
    } else if (hasTailwind && (shadows > 3 || whitespace > 30)) {
        style = "Moderne (design system)";
        confidence = "élevée";
    } else if (imgCount > 10 || videoCount > 2) {
        style = "Corporate (média-riche)";
        confidence = "moyenne";
    } else if (whitespace > 20 && shadows < 2) {
        style = "Minimaliste";
        confidence = "moyenne";
    } else if (hasBootstrap) {
        style = "Traditionnel (Bootstrap)";
        confidence = "élevée";
    }

    return { style, confidence, metrics: { imgCount, animations, gradients, shadows, whitespace } };
};

const checkAccessibility = (htmlContent) => {
    const issues = [];
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;

    // Images sans alt
    const imgsWithoutAlt = doc.querySelectorAll("img:not([alt])");
    imgsWithoutAlt.forEach((img, i) => {
        if (i < 3) issues.push(`Image sans alt : ${img.src?.substring(0, 50) || "sans src"}`);
    });

    // Liens sans href ou texte
    const badLinks = doc.querySelectorAll("a:not([href]), a[href=''], a[href='#']");
    badLinks.forEach((a, i) => {
        if (i < 3) issues.push(`Lien problématique : "${a.textContent?.substring(0, 30) || "sans texte"}"`);
    });

    // Titres manquants ou mal hiérarchisés
    const h1Count = doc.querySelectorAll("h1").length;
    if (h1Count === 0) issues.push("Aucun H1 détecté");
    if (h1Count > 1) issues.push(`Plusieurs H1 détectés (${h1Count})`);

    // Formulaires sans labels
    const inputsWithoutLabels = doc.querySelectorAll("input:not([aria-label]):not([aria-labelledby])");
    let unlabeledInputs = 0;
    inputsWithoutLabels.forEach(input => {
        const id = input.id;
        if (!id || !doc.querySelector(`label[for="${id}"]`)) {
            unlabeledInputs++;
        }
    });
    if (unlabeledInputs > 0) issues.push(`${unlabeledInputs} input(s) sans label`);

    // Contraste (basique)
    const hasLowContrast = htmlContent.includes("color:#ccc") || htmlContent.includes("color:#ddd");
    if (hasLowContrast) issues.push("Possible problème de contraste détecté");

    const score = Math.max(0, 100 - (issues.length * 8));
    return {
        score,
        issues: issues.slice(0, 8),
        categories: {
            images: imgsWithoutAlt.length,
            links: badLinks.length,
            headings: h1Count !== 1 ? 1 : 0,
            forms: unlabeledInputs
        }
    };
};

const analyzePageStructure = (htmlContent) => {
    const dom = new JSDOM(htmlContent);
    const doc = dom.window.document;

    const semantic = {
        header: !!doc.querySelector("header"),
        nav: !!doc.querySelector("nav"),
        main: !!doc.querySelector("main"),
        footer: !!doc.querySelector("footer"),
        article: !!doc.querySelector("article"),
        section: !!doc.querySelector("section"),
        aside: !!doc.querySelector("aside")
    };

    const meta = {
        viewport: !!doc.querySelector('meta[name="viewport"]'),
        description: !!doc.querySelector('meta[name="description"]'),
        title: !!doc.querySelector("title"),
        favicon: !!doc.querySelector('link[rel*="icon"]'),
        canonical: !!doc.querySelector('link[rel="canonical"]')
    };

    const interactive = {
        forms: doc.querySelectorAll("form").length,
        buttons: doc.querySelectorAll("button").length,
        links: doc.querySelectorAll("a[href]").length,
        inputs: doc.querySelectorAll("input, textarea, select").length
    };

    return { semantic, meta, interactive };
};

const inferPageContext = (htmlContent, url) => {
    const dom = new JSDOM(htmlContent);
    const title = dom.window.document.querySelector("title")?.textContent || "";
    const metaDesc = dom.window.document.querySelector('meta[name="description"]')?.content || "";
    const h1Text = dom.window.document.querySelector("h1")?.textContent || "";

    const allText = `${title} ${metaDesc} ${h1Text}`.toLowerCase();

    // Patterns de détection améliorés
    const patterns = {
        saas: /saas|software|platform|dashboard|analytics|crm|marketing|automation/,
        ecommerce: /shop|store|buy|cart|product|price|checkout|commerce/,
        blog: /blog|article|post|news|read more/,
        corporate: /about|company|team|services|contact|enterprise/,
        landing: /sign up|get started|try free|demo|download/,
        portfolio: /portfolio|work|project|design|creative/,
        education: /course|learn|education|training|student/
    };

    let detectedType = "Générique";
    let confidence = "faible";

    for (const [type, pattern] of Object.entries(patterns)) {
        if (pattern.test(allText)) {
            detectedType = type.charAt(0).toUpperCase() + type.slice(1);
            confidence = "moyenne";
            break;
        }
    }

    // Analyse basée sur l'URL si disponible
    if (url) {
        const urlLower = url.toLowerCase();
        if (urlLower.includes("blog")) detectedType = "Blog";
        if (urlLower.includes("shop") || urlLower.includes("store")) detectedType = "E-commerce";
        if (urlLower.includes("app") || urlLower.includes("dashboard")) detectedType = "SaaS";
    }

    return {
        type: detectedType,
        confidence,
        audience: detectedType === "SaaS" ? "B2B, professionnels" :
            detectedType === "E-commerce" ? "B2C, consommateurs" : "Mixed",
        objective: detectedType === "SaaS" ? "Conversion, engagement" :
            detectedType === "E-commerce" ? "Vente, conversion" : "Information, engagement"
    };
};

const analyzePerformance = async (page) => {
    if (!page) return null;

    try {
        const metrics = await page.evaluate(() => {
            return new Promise((resolve) => {
                new PerformanceObserver((list) => {
                    const entries = list.getEntries();
                    const paintEntries = entries.filter(entry => entry.entryType === 'paint');
                    resolve({
                        fcp: paintEntries.find(entry => entry.name === 'first-contentful-paint')?.startTime || 0,
                        lcp: entries.find(entry => entry.entryType === 'largest-contentful-paint')?.startTime || 0,
                        loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart
                    });
                }).observe({ entryTypes: ['paint', 'largest-contentful-paint'] });

                // Fallback si pas de support
                setTimeout(() => {
                    resolve({
                        fcp: 0,
                        lcp: 0,
                        loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart
                    });
                }, 3000);
            });
        });

        return metrics;
    } catch (e) {
        console.warn(`⚠️ Erreur analyse performance : ${e.message}`);
        return null;
    }
};

// Fonction principale
(async () => {
    let htmlContent = "";
    let conciseHtml = "";
    let cssContent = "";
    let computedStyles = null;
    let performanceMetrics = null;

    try {
        await fs.ensureDir(output);

        if (url) {
            console.log(`🔍 Analyse de ${url}`);
            const browser = await puppeteer.launch({
                headless: "new",
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();

            // Configuration page
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

            await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
            await page.waitForTimeout(3000);

            // Analyse performance si demandée
            if (performance) {
                performanceMetrics = await analyzePerformance(page);
            }

            // Screenshot si demandé
            if (screenshot) {
                await page.screenshot({
                    path: path.join(output, 'screenshot-desktop.png'),
                    fullPage: true
                });
                await page.setViewport({ width: 375, height: 667 });
                await page.screenshot({
                    path: path.join(output, 'screenshot-mobile.png'),
                    fullPage: true
                });
                console.log(`📸 Screenshots sauvegardés`);
            }

            htmlContent = await page.content();

            // Extraction HTML plus intelligente
            conciseHtml = await page.evaluate(() => {
                // Supprimer scripts et styles inline pour réduire la taille
                const clone = document.cloneNode(true);
                const scripts = clone.querySelectorAll('script');
                const styles = clone.querySelectorAll('style');
                scripts.forEach(s => s.remove());
                styles.forEach(s => s.remove());

                const main = clone.querySelector("main") || clone.querySelector(".main") ||
                    clone.querySelector("#main") || clone.querySelector("body");
                return main ? main.innerHTML : "";
            });

            const maxHtmlLength = deep ? 150000 : 90000;
            conciseHtml = conciseHtml.length > maxHtmlLength ?
                conciseHtml.substring(0, maxHtmlLength) + "\n<!-- ... HTML tronqué ... -->" :
                conciseHtml;

            // Styles calculés étendus
            computedStyles = await page.evaluate(() => {
                const selectors = [
                    "h1, h2, h3", "p", "a", "button", ".btn",
                    "header", "nav", "main", "footer", "section",
                    ".card", ".container", ".wrapper"
                ];

                return Array.from(document.querySelectorAll(selectors.join(", ")))
                    .slice(0, 30)
                    .map((el) => ({
                        tag: el.tagName,
                        class: el.className,
                        color: window.getComputedStyle(el).color,
                        backgroundColor: window.getComputedStyle(el).backgroundColor,
                        fontFamily: window.getComputedStyle(el).fontFamily,
                        fontSize: window.getComputedStyle(el).fontSize,
                        fontWeight: window.getComputedStyle(el).fontWeight,
                        padding: window.getComputedStyle(el).padding,
                        margin: window.getComputedStyle(el).margin
                    }));
            });

            // CSS inline et externe
            cssContent = await page.evaluate(() => {
                let css = "";
                document.querySelectorAll("style").forEach((el) => {
                    css += `/* Inline Style */\n${el.innerHTML}\n\n`;
                });
                return css;
            });

            // Récupération stylesheets externes
            const linkedStylesheets = await page.evaluate(() =>
                Array.from(document.querySelectorAll("link[rel='stylesheet']")).map((el) => {
                    const href = el.href;
                    return href.startsWith("/") ? new URL(href, window.location.origin).href : href;
                })
            );

            console.log(`📎 ${linkedStylesheets.length} feuilles de style externes`);
            for (const stylesheetUrl of linkedStylesheets.slice(0, 5)) { // Limiter à 5 pour éviter la surcharge
                const css = fetchCssWithCurl(stylesheetUrl, url);
                if (css) {
                    cssContent += `\n/* Stylesheet: ${stylesheetUrl} */\n${css}\n`;
                }
            }

            await browser.close();

        } else {
            // Traitement fichier local (logique existante améliorée)
            console.log(`📂 Analyse fichier HTML : ${html}`);
            htmlContent = await fs.readFile(html, "utf-8");

            const dom = new JSDOM(htmlContent);
            const main = dom.window.document.querySelector("main") ||
                dom.window.document.querySelector("body");
            conciseHtml = main ? main.innerHTML : "";

            const maxHtmlLength = deep ? 150000 : 90000;
            conciseHtml = conciseHtml.length > maxHtmlLength ?
                conciseHtml.substring(0, maxHtmlLength) + "\n<!-- ... HTML tronqué ... -->" :
                conciseHtml;

            // CSS extraction pour fichier local
            cssContent = Array.from(dom.window.document.querySelectorAll("style"))
                .map((el) => el.innerHTML).join("\n\n");
        }

        // Analyses
        console.log(`\n🔍 Analyse en cours...`);
        const framework = detectFramework(htmlContent, cssContent);
        const colors = extractColorPalette(cssContent, htmlContent, computedStyles);
        const typography = analyzeTypography(cssContent, htmlContent, computedStyles);
        const generalStyle = detectGeneralStyle(htmlContent, cssContent);
        const accessibility = checkAccessibility(htmlContent);
        const structure = analyzePageStructure(htmlContent);
        const context = inferPageContext(htmlContent, url);

        // Affichage résultats
        console.log(`\n📊 Résultats d'analyse :`);
        console.log(`- Framework CSS : ${framework.name} ${framework.version || ""} (confiance: ${framework.confidence || 0})`);
        if (framework.alternatives && framework.alternatives.length > 0) {
            console.log(`- Frameworks alternatifs : ${framework.alternatives.map(f => f.name).join(", ")}`);
        }
        console.log(`- Style général : ${generalStyle.style} (${generalStyle.confidence})`);
        console.log(`- Accessibilité : Score ${accessibility.score}/100, ${accessibility.issues.length} problèmes`);
        console.log(`- Structure : ${Object.values(structure.semantic).filter(Boolean).length}/7 éléments sémantiques`);
        console.log(`- Type détecté : ${context.type} (${context.confidence})`);
        console.log(`- Palette couleurs : ${colors.count} couleurs uniques`);

        if (performanceMetrics) {
            console.log(`- Performance : FCP ${Math.round(performanceMetrics.fcp)}ms, Load ${Math.round(performanceMetrics.loadTime)}ms`);
        }

        // Génération du prompt amélioré
        const prompt = `# 🎨 Prompt de Modernisation UI/UX - Analyse Avancée

## 🎯 Contexte et Rôle
Vous êtes un **Designer UI/UX Senior** spécialisé dans la modernisation d'interfaces web. 
Votre mission : transformer cette page en une interface **moderne, accessible et performante** 
tout en préservant son identité visuelle et ses fonctionnalités essentielles.

**Source** : ${url || "Fichier local"}  
**Date d'analyse** : ${new Date().toISOString().split('T')[0]}  
**Type détecté** : ${context.type} (confiance: ${context.confidence})

## 📋 Analyse Technique Actuelle

### Framework et Architecture
- **Framework CSS principal** : ${framework.name} ${framework.version || "version inconnue"}
- **Confiance de détection** : ${framework.confidence || 0}/10
${framework.alternatives && framework.alternatives.length > 0 ?
                `- **Frameworks secondaires** : ${framework.alternatives.map(f => `${f.name} (${f.confidence})`).join(", ")}` : ""}
- **Compatibilité** : Chrome 90+, Firefox 88+, Safari 14+
- **Responsive** : ${structure.meta.viewport ? "✅ Viewport configuré" : "❌ Viewport manquant"}

### Design System Actuel
#### 🎨 Palette de Couleurs (${colors.count} couleurs détectées)
\`\`\`
${colors.palette}
\`\`\`

#### 🔤 Typographie
- **Polices** : ${typography.fonts}
- **Tailles** : ${typography.sizes}
- **Poids** : ${typography.weights}

#### 🎭 Style Général
- **Style détecté** : ${generalStyle.style}
- **Confiance** : ${generalStyle.confidence}
- **Métriques** :
  - Images: ${generalStyle.metrics.imgCount}
  - Animations/Transitions: ${generalStyle.metrics.animations}
  - Gradients: ${generalStyle.metrics.gradients}
  - Ombres: ${generalStyle.metrics.shadows}
  - Espacement (padding/margin): ${generalStyle.metrics.whitespace}

### Structure et Sémantique
#### HTML5 Sémantique (${Object.values(structure.semantic).filter(Boolean).length}/7)
- Header: ${structure.semantic.header ? "✅" : "❌"}
- Navigation: ${structure.semantic.nav ? "✅" : "❌"}
- Main: ${structure.semantic.main ? "✅" : "❌"}
- Footer: ${structure.semantic.footer ? "✅" : "❌"}
- Article: ${structure.semantic.article ? "✅" : "❌"}
- Section: ${structure.semantic.section ? "✅" : "❌"}
- Aside: ${structure.semantic.aside ? "✅" : "❌"}

#### SEO et Meta
- Title: ${structure.meta.title ? "✅" : "❌"}
- Description: ${structure.meta.description ? "✅" : "❌"}
- Favicon: ${structure.meta.favicon ? "✅" : "❌"}
- Canonical: ${structure.meta.canonical ? "✅" : "❌"}

#### Éléments Interactifs
- Formulaires: ${structure.interactive.forms}
- Boutons: ${structure.interactive.buttons}
- Liens: ${structure.interactive.links}
- Champs de saisie: ${structure.interactive.inputs}

### Accessibilité (Score: ${accessibility.score}/100)
#### Problèmes identifiés (${accessibility.issues.length})
${accessibility.issues.map(issue => `- ${issue}`).join("\n") || "- Aucun problème majeur détecté"}

#### Répartition des problèmes
- Images sans alt: ${accessibility.categories.images}
- Liens problématiques: ${accessibility.categories.links}
- Structure des titres: ${accessibility.categories.headings ? "⚠️" : "✅"}
- Formulaires sans labels: ${accessibility.categories.forms}

${performanceMetrics ? `### Performance Web
- **First Contentful Paint** : ${Math.round(performanceMetrics.fcp)}ms ${performanceMetrics.fcp < 1800 ? "✅" : "⚠️"}
- **Largest Contentful Paint** : ${Math.round(performanceMetrics.lcp)}ms ${performanceMetrics.lcp < 2500 ? "✅" : "⚠️"}
- **Temps de chargement total** : ${Math.round(performanceMetrics.loadTime)}ms ${performanceMetrics.loadTime < 3000 ? "✅" : "⚠️"}` : ""}

## 🎯 Objectifs de Modernisation

### Priorité 1 : Expérience Utilisateur
1. **Améliorer la lisibilité** et hiérarchie visuelle
2. **Renforcer la confiance** utilisateur (design professionnel)
3. **Optimiser la navigation** et les parcours utilisateur
4. **Corriger les ${accessibility.issues.length} problèmes d'accessibilité** identifiés
5. **Assurer la cohérence** responsive design

### Priorité 2 : Design Moderne 2025
1. **Tendances actuelles** : Micro-interactions, glassmorphism, dark mode
2. **Contraste et lisibilité** : Respecter WCAG 2.1 AA minimum
3. **Performance** : Optimiser CSS, images, Core Web Vitals
4. **Design tokens** : Créer un système cohérent

### Priorité 3 : Architecture Technique
1. **CSS moderne** : Flexbox, Grid, Custom Properties
2. **Mobile-first** : Breakpoints sm:640px, md:768px, lg:1024px, xl:1280px
3. **Maintenabilité** : Code modulaire, commenté, extensible

## 📝 Contexte Métier

### Description Fonctionnelle
\`\`\`
Type de site    : ${context.type}
Audience cible  : ${context.audience}
Objectif        : ${context.objective}
Contexte usage  : Interface ${structure.interactive.forms > 0 ? "interactive" : "informationnelle"} 
                  avec ${structure.interactive.buttons} boutons et ${structure.interactive.links} liens
\`\`\`

### Code Source à Moderniser
\`\`\`html
${conciseHtml}
\`\`\`
**Note** : Extrait du contenu principal. Créez navigation, footer et autres sections avec créativité.

## 🚧 Contraintes et Directives

### Contraintes Techniques
- **Framework** : Maintenir compatibilité ${framework.name}
- **Couleurs** : Préserver l'identité (${colors.palette.split(",")[0] || "couleurs principales"})
- **Fonctionnalités** : Conserver tous les éléments interactifs
- **Performance** : Améliorer les métriques actuelles

### Directives de Design
- **Approche** : Évolution progressive, pas révolution
- **Personnalité** : Professionnel, moderne, accessible
- **Éviter** : Surcharge visuelle, effets gratuits
- **Favoriser** : Clarté, utilisabilité, élégance

### Checklist Prioritaire
1. **Typographie** : Hiérarchie claire, lisibilité optimale
2. **Espacement** : Respiration visuelle, grille cohérente  
3. **Interactions** : États hover, focus, active visibles
4. **Responsive** : ${structure.meta.viewport ? "Optimiser" : "Implémenter"} la compatibilité mobile
5. **Accessibilité** : Corriger les ${accessibility.issues.length} problèmes identifiés

## 📦 Livrables Attendus

### 1. Code Modernisé
- **HTML5** : Sémantique, accessible, SEO-optimisé
- **CSS moderne** : Mobile-first, flexbox/grid, custom properties
- **JavaScript** (si nécessaire) : Interactions légères, fallbacks gracieux

### 2. Documentation
- **Guide de style** : Couleurs, typographie, composants
- **Notes d'implémentation** : Choix techniques justifiés
- **Guide d'accessibilité** : Corrections apportées

### 3. Améliorations Spécifiques
${accessibility.issues.length > 0 ? `- Corriger les problèmes d'accessibilité identifiés` : ""}
${!structure.meta.viewport ? `- Ajouter le viewport responsive` : ""}
${!structure.semantic.main ? `- Ajouter la structure sémantique manquante` : ""}
${generalStyle.metrics.animations < 3 ? `- Ajouter des micro-interactions` : ""}

## 🔧 Processus de Modernisation

### Phase 1 : Fondations
1. Analyser le code existant (${accessibility.issues.length} problèmes identifiés)
2. Établir la grille et les proportions
3. Définir les design tokens

### Phase 2 : Implémentation
1. Restructurer le HTML sémantique
2. Créer le CSS moderne et responsive
3. Ajouter les interactions JavaScript

### Phase 3 : Optimisation
1. Tester l'accessibilité (objectif: 95+ /100)
2. Optimiser les performances
3. Valider cross-browser

## ✅ Critères de Validation

### Design
- [ ] Cohérence visuelle avec l'identité (${colors.palette.split(",")[0]})
- [ ] Hiérarchie claire et moderne
- [ ] Responsive design fonctionnel
- [ ] Micro-interactions appropriées

### Technique  
- [ ] Code propre et maintenable
- [ ] Compatibilité ${framework.name}
- [ ] Performance améliorée
- [ ] Sémantique HTML5 complète

### Accessibilité
- [ ] Score minimum 90/100 (actuel: ${accessibility.score}/100)
- [ ] WCAG 2.1 AA respecté
- [ ] Navigation clavier fonctionnelle
- [ ] Lecteurs d'écran compatibles

## 💡 Recommandations Spécifiques

### Couleurs
- Conserver ${colors.palette.split(",").slice(0, 2).join(", ")} comme base
- Ajouter des variations pour les états interactifs
- Vérifier les contrastes (minimum 4.5:1)

### Typographie  
- Optimiser la hiérarchie H1-H6
- Améliorer l'espacement inter-lignes
- Assurer la lisibilité multi-device

### Layout
- Utiliser CSS Grid pour la structure principale
- Flexbox pour les composants
- Espacement cohérent (8px, 16px, 24px, 32px...)

### Interactions
- Animations de transition fluides (200-300ms)
- États hover/focus visibles
- Feedback utilisateur immédiat

**Objectif final** : Interface moderne, accessible et performante respectant l'identité ${framework.name} et la palette ${colors.palette.split(",")[0] || "existante"}.
`;

        // Sauvegarde des fichiers
        const promptFile = path.join(output, "uxui-prompt-advanced.md");
        await fs.writeFile(promptFile, prompt);
        console.log(`📄 Prompt avancé généré : ${promptFile}`);

        // Sauvegarde des données d'analyse en JSON
        const analysisData = {
            meta: {
                url: url || "local file",
                analyzedAt: new Date().toISOString(),
                version: "2.0"
            },
            framework,
            colors,
            typography,
            generalStyle,
            accessibility,
            structure,
            context,
            performanceMetrics,
            recommendations: {
                priority: accessibility.score < 80 ? "accessibility" : "modernization",
                urgentFixes: accessibility.issues.slice(0, 3),
                suggestedFramework: framework.confidence > 3 ? framework.name : "Custom CSS + Utilities"
            }
        };

        const dataFile = path.join(output, "analysis-data.json");
        await fs.writeFile(dataFile, JSON.stringify(analysisData, null, 2));
        console.log(`📊 Données d'analyse : ${dataFile}`);

        if (url) {
            const htmlFile = path.join(output, "source.html");
            await fs.writeFile(htmlFile, htmlContent);
            console.log(`💾 HTML source : ${htmlFile}`);
        }

        // Génération d'un rapport de synthèse
        const summary = `# 📋 Rapport de Synthèse UX/UI

## Scores et Métriques
- **Accessibilité** : ${accessibility.score}/100 ${accessibility.score >= 80 ? "✅" : "⚠️"}
- **Structure sémantique** : ${Object.values(structure.semantic).filter(Boolean).length}/7 ${Object.values(structure.semantic).filter(Boolean).length >= 4 ? "✅" : "⚠️"}
- **Framework détecté** : ${framework.name} (confiance: ${framework.confidence}/10)
- **Couleurs uniques** : ${colors.count}
- **Éléments interactifs** : ${structure.interactive.buttons + structure.interactive.links}

## Priorités d'action
1. **${accessibility.score < 80 ? "🚨 URGENT" : "📈 AMÉLIORATION"}** : Accessibilité (${accessibility.issues.length} problèmes)
2. **🎨 DESIGN** : Modernisation ${generalStyle.style.toLowerCase()}
3. **⚡ PERFORMANCE** : ${performanceMetrics ? `Optimiser (FCP: ${Math.round(performanceMetrics.fcp)}ms)` : "À analyser"}
4. **📱 RESPONSIVE** : ${structure.meta.viewport ? "Optimiser" : "Implémenter"}

## Actions immédiates
${accessibility.issues.slice(0, 3).map((issue, i) => `${i + 1}. ${issue}`).join("\n")}

## Recommandation framework
**${framework.confidence > 3 ? `Conserver ${framework.name}` : "Migrer vers un framework moderne"}**
`;

        const summaryFile = path.join(output, "rapport-synthese.md");
        await fs.writeFile(summaryFile, summary);
        console.log(`📋 Rapport de synthèse : ${summaryFile}`);

        console.log(`\n✅ Analyse terminée ! Fichiers générés dans : ${output}`);
        console.log(`\n🎯 Prochaine étape : Utilisez le prompt généré avec votre IA préférée pour moderniser l'interface.`);

    } catch (error) {
        console.error(`❌ Erreur lors de l'analyse : ${error.message}`);
        if (error.stack) {
            console.error(`Stack trace : ${error.stack}`);
        }
        process.exit(1);
    }
})();