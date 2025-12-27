/**
 * CSS Splitter Script - 4 parts version
 * Splits styles.css into modular files
 */

const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, '..', 'public', 'styles');

// Read all current CSS files and combine them
const files = [
    'variables-and-base.css',
    'layout-and-components.css',
    'pages-part1.css',
    'pages-part2.css',
    'pages-part3.css'
];

let fullContent = '';
files.forEach(f => {
    const filePath = path.join(outputDir, f);
    if (fs.existsSync(filePath)) {
        fullContent += fs.readFileSync(filePath, 'utf8');
    }
});

const lines = fullContent.split('\n');
console.log(`Total lines: ${lines.length}`);

// New split configuration - 6 files with 4 page parts
const splits = [
    { name: 'variables-and-base', startLine: 1, endLine: 400 },
    { name: 'layout-and-components', startLine: 401, endLine: 1500 },
    { name: 'pages-part1', startLine: 1501, endLine: 5000 },      // ~3500 lines
    { name: 'pages-part2', startLine: 5001, endLine: 8500 },      // ~3500 lines
    { name: 'pages-part3', startLine: 8501, endLine: 12500 },     // ~4000 lines
    { name: 'pages-part4', startLine: 12501, endLine: lines.length } // ~4530 lines
];

// Clear existing files
const existingFiles = fs.readdirSync(outputDir);
existingFiles.forEach(file => {
    if (file.endsWith('.css')) {
        fs.unlinkSync(path.join(outputDir, file));
    }
});

let totalLines = 0;

splits.forEach((split, index) => {
    const startIdx = split.startLine - 1;
    const endIdx = split.endLine;
    const sectionLines = lines.slice(startIdx, endIdx);

    let fileContent = sectionLines.join('\n');
    if (index < splits.length - 1) {
        fileContent += '\n';
    }

    const fileName = path.join(outputDir, `${split.name}.css`);
    fs.writeFileSync(fileName, fileContent, { encoding: 'utf8' });

    console.log(`Created ${split.name}.css: ${sectionLines.length} lines`);
    totalLines += sectionLines.length;
});

console.log(`\nTotal lines: ${totalLines}`);

// Verification
console.log('\n=== VERIFICATION ===');
const filesToConcat = splits.map(s => path.join(outputDir, `${s.name}.css`));
let combined = '';
filesToConcat.forEach(file => {
    combined += fs.readFileSync(file, 'utf8');
});

const originalBuffer = Buffer.from(fullContent, 'utf8');
const combinedBuffer = Buffer.from(combined, 'utf8');

console.log(`Original: ${originalBuffer.length} bytes`);
console.log(`Combined: ${combinedBuffer.length} bytes`);

if (Buffer.compare(originalBuffer, combinedBuffer) === 0) {
    console.log('\n✓ SUCCESS: Files are BYTE-FOR-BYTE IDENTICAL!');
} else {
    console.log('\n✗ FAILED: Files do not match!');
}
