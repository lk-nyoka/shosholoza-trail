import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('every shipped depth map matches its actual model-generation provenance and source photo', async () => {
  const manifest = JSON.parse(await readFile('scripts/depth/depth-assets.json', 'utf8'));
  assert.equal(manifest.model, 'depth-anything/Depth-Anything-V2-Small-hf');
  assert.equal(manifest.license, 'Apache-2.0');
  assert.equal(manifest.assets.length, 9);
  for (const asset of manifest.assets) {
    const [photo, depth] = await Promise.all([readFile(`public/assets/photos/${asset.photo}`), readFile(`public/assets/photos/${asset.depth}`)]);
    assert.equal(createHash('sha256').update(photo).digest('hex'), asset.photo_sha256, `${asset.photo} changed; regenerate its depth`);
    assert.equal(createHash('sha256').update(depth).digest('hex'), asset.depth_sha256);
    assert.equal(depth.length, asset.bytes);
    assert.ok(asset.raw_range[1] > asset.raw_range[0]);
  }
});
