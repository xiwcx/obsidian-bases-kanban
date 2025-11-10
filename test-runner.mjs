import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';

function findTestFiles(dir, fileList = []) {
	const files = readdirSync(dir);
	
	files.forEach(file => {
		const filePath = join(dir, file);
		const stat = statSync(filePath);
		
		if (stat.isDirectory()) {
			findTestFiles(filePath, fileList);
		} else if (file.endsWith('.test.ts')) {
			fileList.push(filePath);
		}
	});
	
	return fileList;
}

const testFiles = findTestFiles('./tests');

if (testFiles.length === 0) {
	console.error('No test files found');
	process.exit(1);
}

// Setup obsidian mock
const nodeModulesPath = join(process.cwd(), 'node_modules');
const obsidianPath = join(nodeModulesPath, 'obsidian');
const mockObsidianPath = resolve(process.cwd(), 'tests', 'mocks', 'obsidian.js');

// Create obsidian directory if it doesn't exist
if (!existsSync(obsidianPath)) {
	mkdirSync(obsidianPath, { recursive: true });
}

// Create index.js that exports from our mock
const obsidianIndexPath = join(obsidianPath, 'index.js');
const obsidianIndexContent = `module.exports = require('${mockObsidianPath.replace(/\\/g, '/')}');\n`;
writeFileSync(obsidianIndexPath, obsidianIndexContent);

// Setup sortablejs mock
const sortablejsPath = join(nodeModulesPath, 'sortablejs');
const mockSortablejsPath = resolve(process.cwd(), 'tests', 'mocks', 'sortablejs.js');

// Create sortablejs directory if it doesn't exist
if (!existsSync(sortablejsPath)) {
	mkdirSync(sortablejsPath, { recursive: true });
}

// Create index.js that exports from our mock
const sortablejsIndexPath = join(sortablejsPath, 'index.js');
const sortablejsIndexContent = `module.exports = require('${mockSortablejsPath.replace(/\\/g, '/')}');\n`;
writeFileSync(sortablejsIndexPath, sortablejsIndexContent);

// Run tsx with all test files
const args = ['--test', ...testFiles];
const proc = spawn('tsx', args, {
	stdio: 'inherit',
	shell: process.platform === 'win32'
});

proc.on('error', (err) => {
	console.error('Failed to start test runner:', err);
	process.exit(1);
});

proc.on('exit', (code) => {
	process.exit(code || 0);
});

