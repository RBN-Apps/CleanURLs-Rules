const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const minifier = path.resolve(__dirname, '../build_tools/minifyDataJSON.js');
const validator = path.resolve(__dirname, '../build_tools/checkRedirectRules.cjs');
const legacyPattern = '[?&]old=([^&]+)';
const sharedPattern = '^https://wrapper\\.test/\\?(?=target=)(?:target=)(?<host>[^&]+)(?:&tag=([^&]+))?$';
const constantPattern = '^https://wrapper\\.test/constant$';
const primary = {
  id: 'primary',
  match: { regex: sharedPattern, caseSensitive: false },
  preprocessors: [
    { type: 'urlDecode', inputs: [1] },
    { type: 'urlEncode', inputs: [2] },
  ],
  replacePattern: '§1§?tag=§2§',
  defaultScheme: 'https',
};
const alternate = {
  id: 'alternate',
  match: { regex: sharedPattern },
  replacePattern: 'https://example.test/§2§',
};
const constant = {
  id: 'constant',
  match: { regex: constantPattern },
  replacePattern: 'https://example.test/constant',
};

function minify(t, redirectRules) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clearurls-rule-validation-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const source = path.join(directory, 'data.min.json');
  const minified = path.join(directory, 'data.minify.json');
  fs.writeFileSync(source, JSON.stringify({ providers: {
    sample: {
      urlPattern: '^https://wrapper\\.test/', forceRedirection: true, methods: ['GET'],
      redirections: [legacyPattern], redirectRules,
    },
  } }, null, 2));
  execFileSync(process.execPath, [minifier, source, minified]);
  return { source, minified };
}

function runValidator({ source, minified }) {
  const result = spawnSync(process.execPath, [validator, source, minified], { encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

function assertRejected(feed, id) {
  const { status, stderr, stdout } = runValidator(feed);
  const diagnostic = stderr + stdout;
  assert.ok(status > 0, diagnostic);
  assert.match(diagnostic, /\bsample\b/, 'diagnostic names the provider');
  if (id !== undefined) assert.ok(diagnostic.includes(id), `diagnostic must name rule ${id}: ${diagnostic}`);
}

test('validates the published projection of declared and legacy redirects', t => {
  const redirectRules = [primary, alternate, constant];
  const feed = minify(t, redirectRules);
  const minified = JSON.parse(fs.readFileSync(feed.minified, 'utf8'));
  assert.deepEqual(minified.providers.sample, {
    urlPattern: '^https://wrapper\\.test/', forceRedirection: true, methods: ['GET'],
    redirections: [legacyPattern], redirectRules,
  });

  const result = runValidator(feed);
  assert.equal(result.status, 0, result.stderr + result.stdout);
});

test('accepts legacy-only providers with omitted or empty declared rules', t => {
  for (const redirectRules of [undefined, []]) {
    const feed = minify(t, redirectRules);
    const minified = JSON.parse(fs.readFileSync(feed.minified, 'utf8'));
    assert.equal(minified.providers.sample.redirectRules, undefined);
    assert.deepEqual(minified.providers.sample.redirections, [legacyPattern]);

    const result = runValidator(feed);
    assert.equal(result.status, 0, result.stderr + result.stdout);
  }
});

test('rejects invalid declared redirect configurations before publishing', async t => {
  const invalidRules = [
    { ...primary, id: 'bad-codec', preprocessors: [{ type: 'unsupported', inputs: [1] }] },
    { ...primary, id: 'unknown-field', decode: ['percent'] },
    { ...primary, id: 'bad-input-reference', preprocessors: [{ type: 'urlDecode', inputs: [3] }] },
    { ...primary, id: 'bad-template-reference', replacePattern: 'https://example.test/§3§' },
    { id: 'missing-default-capture', match: { regex: constantPattern } },
    { ...constant, id: 'bad-constant-target', replacePattern: 'ftp://example.test/constant' },
  ];
  for (const rule of invalidRules) {
    await t.test(rule.id, t => assertRejected(minify(t, [rule]), rule.id));
  }

  await t.test('duplicate rule IDs', t => {
    assertRejected(minify(t, [primary, { ...constant, id: primary.id }]), primary.id);
  });

  await t.test('a malformed rule list omitted by the minifier', t => {
    const feed = minify(t, null);
    const minified = JSON.parse(fs.readFileSync(feed.minified, 'utf8'));
    assert.equal(minified.providers.sample.redirectRules, undefined);
    assertRejected(feed);
  });
});

test('rejects changed declared redirects in the minified feed', async t => {
  for (const [label, edit] of [
    ['a dropped rule', rules => rules.pop()],
    ['reordered rules', rules => rules.reverse()],
    ['an edited rule', rules => { rules[0].preprocessors[0].type = 'formDecode'; }],
  ]) {
    await t.test(label, t => {
      const feed = minify(t, [primary, alternate]);
      const minified = JSON.parse(fs.readFileSync(feed.minified, 'utf8'));
      edit(minified.providers.sample.redirectRules);
      fs.writeFileSync(feed.minified, JSON.stringify(minified));
      assertRejected(feed);
    });
  }
});
