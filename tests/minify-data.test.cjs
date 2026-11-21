const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('the published minifier retains explicit and legacy redirect rules', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clearurls-rules-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'data.min.json');
  const output = path.join(directory, 'data.minify.json');
  const defaults = { rules: [], rawRules: [], referralMarketing: [], exceptions: [] };
  const redirections = ['[?&]old=([^&]+)'];
  const redirectRules = [
    { id: 'plain', match: { regex: '[?&]plain=([^&]+)' } },
    {
      id: 'wrapped',
      match: { regex: '[?&]wrapped=([^&]+)', caseSensitive: false },
      preprocessors: [
        { type: 'urlDecode', inputs: 'all' },
        { type: 'base64UrlDecode', inputs: [1] },
      ],
      replacePattern: '§1§',
      defaultScheme: 'https',
    },
  ];
  fs.writeFileSync(input, JSON.stringify({ providers: {
    mixed: { ...defaults, urlPattern: '^https://legacy\\.test/', redirections, redirectRules },
    explicit: { ...defaults, urlPattern: '^https://new\\.test/', redirectRules },
    legacy: { ...defaults, urlPattern: '^https://old\\.test/', redirections, redirectRules: [] },
  } }, null, 2));

  execFileSync(process.execPath, [path.resolve(__dirname, '../build_tools/minifyDataJSON.js'), input, output]);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), { providers: {
    mixed: { urlPattern: '^https://legacy\\.test/', redirections, redirectRules },
    explicit: { urlPattern: '^https://new\\.test/', redirectRules },
    legacy: { urlPattern: '^https://old\\.test/', redirections },
  } });
});
