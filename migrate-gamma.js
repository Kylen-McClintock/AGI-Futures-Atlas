const fs = require('fs');
const path = require('path');

// Usage: node migrate-gamma.js <site-directory-path>
// Example: node migrate-gamma.js ../new-site

const sitePath = process.argv[2];

if (!sitePath) {
    console.error('Usage: node migrate-gamma.js <site-directory-path>');
    process.exit(1);
}

const fullSitePath = path.resolve(process.cwd(), sitePath);
const siteName = path.basename(fullSitePath);
const assetsDirName = 'assets';
const fullAssetsPath = path.join(fullSitePath, assetsDirName);

console.log(`Migrating site: ${siteName} at ${fullSitePath}`);

// 1. Rename assets directory
const files = fs.readdirSync(fullSitePath);
const oldAssetsDir = files.find(f => f.endsWith('_files') && fs.statSync(path.join(fullSitePath, f)).isDirectory());

if (oldAssetsDir) {
    const oldPath = path.join(fullSitePath, oldAssetsDir);
    if (fs.existsSync(fullAssetsPath)) {
        console.log(`'assets' directory already exists. Skipping rename.`);
    } else {
        fs.renameSync(oldPath, fullAssetsPath);
        console.log(`Renamed '${oldAssetsDir}' to '${assetsDirName}'`);
    }
} else if (!fs.existsSync(fullAssetsPath)) {
    console.log('Note: Could not find a *_files directory and assets directory does not exist. Assuming assets are already in place or not needed.');
}

// 2. Process index.html
const indexPath = path.join(fullSitePath, 'index.html');
if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');

    // Fix paths
    if (oldAssetsDir) {
        const regex = new RegExp(oldAssetsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        content = content.replace(regex, assetsDirName);
        console.log('Updated asset paths in index.html');
    }

    // Inject Base Tag
    const baseTag = `<base href="/sites/${siteName}/">`;
    if (!content.includes('<base href=')) {
        content = content.replace('<head>', `<head>\n  ${baseTag}`);
        console.log('Injected <base> tag');
    }

    // Inject CSS to hide branding
    const hideBrandingCss = `
  <style>
    [data-id="made-with-gamma-btn"],
    .node-buttonGroup,
    [aria-label="Report this page"] { display: none !important; }
  </style>`;

    if (!content.includes('[data-id="made-with-gamma-btn"]')) {
        content = content.replace('</head>', `${hideBrandingCss}\n</head>`);
        console.log('Injected CSS to hide branding');
    }

    // Fix CSS Syntax Error (Repeated @media)
    const badMediaRegex = /@media only screen and \(max-device-width: 812px\) and \(-webkit-min-device-pixel-ratio: 2\),\s*@media only screen/g;
    if (badMediaRegex.test(content)) {
        content = content.replace(badMediaRegex, '@media only screen and (max-device-width: 812px) and (-webkit-min-device-pixel-ratio: 2),\n    only screen');
        console.log('Fixed invalid CSS media query syntax');
    }

    fs.writeFileSync(indexPath, content);
    console.log('Saved changes to index.html');
} else {
    console.error('index.html not found!');
}

// 3. Patch Webpack and Build Manifest
if (fs.existsSync(fullAssetsPath)) {
    const assetFiles = fs.readdirSync(fullAssetsPath);

    // Patch webpack-*.js
    const webpackFile = assetFiles.find(f => f.startsWith('webpack-') && f.endsWith('.js'));
    if (webpackFile) {
        const webpackPath = path.join(fullAssetsPath, webpackFile);
        let wpContent = fs.readFileSync(webpackPath, 'utf8');

        // Replace public path
        const publicPathRegex = /a\.p="https:\/\/assets\.gammahosted\.com\/[^"]*"/g;
        if (publicPathRegex.test(wpContent)) {
            wpContent = wpContent.replace(publicPathRegex, `a.p="/sites/${siteName}/assets/"`);
            console.log(`Patched public path in ${webpackFile}`);
        }

        // Flatten chunk paths
        wpContent = wpContent.replace(/return"static\/chunks\/"/g, 'return""');
        wpContent = wpContent.replace(/return"static\/css\/"/g, 'return""');

        fs.writeFileSync(webpackPath, wpContent);
        console.log(`Saved patches to ${webpackFile}`);
    }

    // Patch _buildManifest.js
    const manifestFile = '_buildManifest.js';
    const manifestPath = path.join(fullAssetsPath, manifestFile);
    if (fs.existsSync(manifestPath)) {
        let manifestContent = fs.readFileSync(manifestPath, 'utf8');

        // Flatten paths
        manifestContent = manifestContent.replace(/return"static\/chunks\/"/g, 'return""');
        manifestContent = manifestContent.replace(/return"static\/css\/"/g, 'return""');

        fs.writeFileSync(manifestPath, manifestContent);
        console.log(`Saved patches to ${manifestFile}`);
    }
}

console.log('Migration completed successfully!');
