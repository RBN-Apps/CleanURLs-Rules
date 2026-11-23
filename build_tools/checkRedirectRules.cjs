/* ClearURLs — SPDX-License-Identifier: LGPL-3.0-or-later */
const { readFileSync } = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const { loadRedirectCompiler } = require('./loadRedirectCompiler.cjs');

function readProviders(filename) {
  const catalog = JSON.parse(readFileSync(filename, 'utf8'));
  if (!catalog?.providers || typeof catalog.providers !== 'object' || Array.isArray(catalog.providers)) {
    throw new Error(filename + ' must contain a providers object.');
  }
  return new Map(Object.entries(catalog.providers));
}

function readRedirectRules(provider, filename) {
  const rules = provider?.redirectRules;
  if (rules === undefined) return [];
  if (!Array.isArray(rules)) {
    throw new Error(filename + ' contains a non-array redirectRules field.');
  }
  return rules;
}

function checkReferences(rule, compiled) {
  const { source, flags } = compiled.expression;
  // The empty alternative matches first without evaluating the rule regex.
  // JavaScript still includes one result slot per capture in the other branch.
  const captureCount = new RegExp('|(?:' + source + ')', flags).exec('').length - 1;

  for (const [stepIndex, step] of (rule.preprocessors ?? []).entries()) {
    if (step.inputs === 'all') continue;
    for (const capture of step.inputs) {
      if (capture > captureCount) {
        throw new Error('preprocessors[' + stepIndex + '] refers to missing capture ' + capture + '.');
      }
    }
  }

  const template = rule.replacePattern ?? '§1§';
  const references = Array.from(template.matchAll(/§(\d+)§/g));
  for (const reference of references) {
    const capture = Number(reference[1]);
    if (capture > captureCount) {
      throw new Error('replacePattern refers to missing capture ' + capture + '.');
    }
  }

  // A constant template can be validated without knowing any captured text.
  if (references.length === 0 && compiled.resolve(Array(captureCount).fill(undefined)) === null) {
    throw new Error('replacePattern does not produce a valid HTTP(S) target.');
  }
}

function checkRules(provider, rules, compile, errors) {
  const ids = new Set();
  for (const [index, rule] of rules.entries()) {
    const name = typeof rule?.id === 'string' ? JSON.stringify(rule.id) : 'redirectRules[' + index + ']';
    try {
      const compiled = compile(rule);
      if (!compiled) throw new Error('does not compile with the add-on redirect compiler.');
      if (ids.has(compiled.id)) throw new Error('duplicate rule ID.');
      ids.add(compiled.id);
      checkReferences(rule, compiled);
    } catch (error) {
      errors.push('Provider ' + JSON.stringify(provider) + ', rule ' + name + ': ' + error.message);
    }
  }
}

function checkCatalog(sourceFile, minifiedFile) {
  const authored = readProviders(sourceFile);
  const minified = readProviders(minifiedFile);
  const compile = loadRedirectCompiler();
  const errors = [];
  let count = 0;

  for (const provider of new Set([...authored.keys(), ...minified.keys()])) {
    try {
      const sourceRules = readRedirectRules(authored.get(provider), sourceFile);
      const minifiedRules = readRedirectRules(minified.get(provider), minifiedFile);
      if (!isDeepStrictEqual(sourceRules, minifiedRules)) {
        throw new Error('redirectRules changed during minification.');
      }
      checkRules(provider, minifiedRules, compile, errors);
      count += minifiedRules.length;
    } catch (error) {
      errors.push('Provider ' + JSON.stringify(provider) + ': ' + error.message);
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log('Validated ' + count + ' explicit redirect rules in ' + minifiedFile + '.');
}

try {
  const [sourceFile, minifiedFile, ...extra] = process.argv.slice(2);
  if (!sourceFile || !minifiedFile || extra.length > 0) {
    throw new Error('Usage: node build_tools/checkRedirectRules.cjs <source.json> <minified.json>');
  }
  checkCatalog(sourceFile, minifiedFile);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
