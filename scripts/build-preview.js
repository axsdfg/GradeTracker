#!/usr/bin/env node
/**
 * 生成单文件预览版：把 ECharts 内联进 HTML，方便双击打开 / 发给别人。
 * 输出: dist/preview.html
 * 用法: node scripts/build-preview.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'app', 'index.html');
const vendorPath = path.join(root, 'app', 'echarts.min.js');
const outDir = path.join(root, 'dist');
const outPath = path.join(outDir, 'preview.html');

if (!fs.existsSync(htmlPath)) {
  console.error('找不到 app/index.html');
  process.exit(1);
}

let html = fs.readFileSync(htmlPath, 'utf8');
const tag = '<script src="echarts.min.js"></script>';

if (fs.existsSync(vendorPath)) {
  const vendor = fs.readFileSync(vendorPath, 'utf8');
  if (vendor.includes('</script')) {
    console.error('echarts.min.js 内含 </script 字符串，无法安全内联，已中止。');
    process.exit(1);
  }
  if (!html.includes(tag)) {
    console.error(`app/index.html 中找不到 ${tag}，结构可能已变化。`);
    process.exit(1);
  }
  html = html.replace(tag, `<script>/* ECharts 5.x (Apache-2.0) 内联 */\n${vendor}\n</script>`);
  console.log(`已内联 ECharts（${(vendor.length / 1024).toFixed(0)} KB）`);
} else {
  console.warn('未找到 app/echarts.min.js，预览版将缺失图表。先运行 node scripts/fetch-vendor.js');
}

html = html.replace(
  '<head>',
  '<head>\n<!-- 单文件预览版：由 scripts/build-preview.js 生成，请勿手工编辑 -->'
);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
console.log(`输出：${path.relative(process.cwd(), outPath)}（${(html.length / 1024).toFixed(0)} KB）`);
