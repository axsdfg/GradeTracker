#!/usr/bin/env node
/**
 * 下载 ECharts 到 app/echarts.min.js
 * 用法: node scripts/fetch-vendor.js [版本号]
 * 需要 Node 18+（使用内置 fetch）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const VERSION = process.argv[2] || '5.6.0';
const OUT = path.join(__dirname, '..', 'app', 'echarts.min.js');
const URLS = [
  `https://cdn.jsdelivr.net/npm/echarts@${VERSION}/dist/echarts.min.js`,
  `https://unpkg.com/echarts@${VERSION}/dist/echarts.min.js`,
];

(async () => {
  if (fs.existsSync(OUT) && fs.statSync(OUT).size > 500 * 1024 && !process.argv.includes('--force')) {
    console.log(`已存在 ${path.relative(process.cwd(), OUT)}（${(fs.statSync(OUT).size / 1024).toFixed(0)} KB），跳过。加 --force 重新下载。`);
    return;
  }

  for (const url of URLS) {
    try {
      console.log(`下载 ${url} ...`);
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.length < 500 * 1024) throw new Error(`内容过小（${text.length} 字节），可能不是完整构建`);
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, text, 'utf8');
      console.log(`完成：${path.relative(process.cwd(), OUT)}（${(text.length / 1024).toFixed(0)} KB）`);
      return;
    } catch (e) {
      console.warn(`  失败：${e.message}`);
    }
  }

  console.error('\n全部源都失败。请手动下载 dist/echarts.min.js 并保存为 app/echarts.min.js：');
  console.error(`  https://cdn.jsdelivr.net/npm/echarts@${VERSION}/dist/echarts.min.js`);
  process.exit(1);
})();
