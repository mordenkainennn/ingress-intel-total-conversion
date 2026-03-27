import os
import re
from pathlib import Path

local_plugins_dir = Path('local-plugins')
html_files = list(local_plugins_dir.rglob('*.html'))

broken_links = []
absolute_internal_links = []

href_regex = re.compile(r'<a[^>]+href=[\x22\x27](.*?)[\x22\x27]', re.IGNORECASE)

for html_file in html_files:
    try:
        content = html_file.read_text(encoding='utf-8')
    except Exception as e:
        print("Could not read " + str(html_file) + ": " + str(e))
        continue
    matches = href_regex.findall(content)
    
    for href in matches:
        if href.startswith(('http://', 'https://', 'mailto:', 'tel:', '#')):
            continue
        
        if href.startswith('/'):
            absolute_internal_links.append((html_file, href))
            continue
            
        path = href.split('?')[0].split('#')[0]
        
        if not path:
            continue
            
        target_path = (html_file.parent / path).resolve()
        
        if not target_path.exists():
            broken_links.append((html_file, href, target_path))

if broken_links:
    print('Broken links:')
    for f, href, target in broken_links:
        print('  {}: {} -> {}'.format(f, href, target))
else:
    print('No broken links found.')

if absolute_internal_links:
    print('\nAbsolute internal links:')
    for f, href in absolute_internal_links:
        print('  {}: {}'.format(f, href))
else:
    print('\nNo absolute internal links found.')
