const { createHash } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');

const artifactName = 'decodeRedirectTarget.js';
const vendor = path.join(__dirname, 'vendor');
const artifactPath = path.join(vendor, artifactName);
const digestPath = path.join(vendor, 'decodeRedirectTarget.sha256');

function verifyDigest(artifact, expected, file) {
  const digest = createHash('sha256').update(artifact).digest('hex');
  if (digest !== expected) throw new Error(`Unexpected redirect compiler checksum for ${file}`);
}

function evaluateCompiler(artifact, filename) {
  const compiler = runInNewContext(
    artifact.toString('utf8') + '\n;typeof compileDeclaredRedirect === "function" ? compileDeclaredRedirect : null',
    { URL, atob, btoa, TextEncoder, TextDecoder },
    { filename },
  );
  if (!compiler) throw new Error(`Redirect compiler export missing in ${filename}`);
  return compiler;
}

function loadRedirectCompiler() {
  const artifact = readFileSync(artifactPath);
  verifyDigest(artifact, readFileSync(digestPath, 'utf8').trim(), artifactPath);
  return evaluateCompiler(artifact, artifactPath);
}

function syncRedirectCompiler(addon) {
  const sourcePath = path.join(addon, 'core_js', 'utils', artifactName);
  const metadataPath = path.join(addon, 'build_tools', 'core-utils-source.json');
  const artifact = readFileSync(sourcePath);
  const expected = JSON.parse(readFileSync(metadataPath, 'utf8')).files?.[artifactName];
  verifyDigest(artifact, expected, sourcePath);
  evaluateCompiler(artifact, sourcePath);

  // The Rules build must run the exact bytes shipped by the add-on.
  mkdirSync(vendor, { recursive: true });
  writeFileSync(artifactPath, artifact);
  writeFileSync(digestPath, expected + '\n');
}

if (require.main === module) {
  const [, , command, checkout = path.join(__dirname, '../../ClearUrls'), ...rest] = process.argv;
  if (command !== '--sync' || rest.length) {
    throw new Error('Usage: node build_tools/loadRedirectCompiler.cjs --sync [addon-checkout]');
  }
  syncRedirectCompiler(path.resolve(checkout));
}

module.exports = { loadRedirectCompiler };
