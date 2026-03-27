const fs = require('fs');
const path = require('path');

function findHtmlFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(findHtmlFiles(file));
        } else if (file.endsWith('.html')) {
            results.push(file);
        }
    });
    return results;
}

const htmlFiles = findHtmlFiles('local-plugins');
let brokenLinks = [];
let absoluteInternalLinks = [];

const hrefRegex = /<a[^>]+href=["']([^"']+)["']/gi;

htmlFiles.forEach(file => {
    try {
        const content = fs.readFileSync(file, 'utf8');
        let match;
        while ((match = hrefRegex.exec(content)) !== null) {
            let href = match[1];
            
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) {
                continue;
            }
            
            if (href.startsWith('/')) {
                absoluteInternalLinks.push({ file, href });
                continue;
            }
            
            let urlPath = href.split('?')[0].split('#')[0];
            if (!urlPath) continue;
            
            let targetPath = path.resolve(path.dirname(file), urlPath);
            
            if (!fs.existsSync(targetPath)) {
                brokenLinks.push({ file, href, targetPath });
            }
        }
    } catch (e) {
        console.error(`Could not read ${file}: ${e}`);
    }
});

if (brokenLinks.length > 0) {
    console.log('Broken links:');
    brokenLinks.forEach(b => console.log(`  ${b.file}: ${b.href}`));
} else {
    console.log('No broken links found.');
}

if (absoluteInternalLinks.length > 0) {
    console.log('\nAbsolute internal links:');
    absoluteInternalLinks.forEach(a => console.log(`  ${a.file}: ${a.href}`));
} else {
    console.log('\nNo absolute internal links found.');
}