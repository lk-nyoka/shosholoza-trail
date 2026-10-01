import { defineConfig } from 'vite';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
let outputDirectory = '';
export default defineConfig({
  root: 'app', publicDir: false,
  // Serve only explicitly allowed local models. public/johannesburg.html is a production
  // artifact and must never shadow app/johannesburg.html during development.
  plugins: [{ name: 'local-train-assets', configResolved(config) { outputDirectory = resolve(config.root, config.build.outDir); }, async closeBundle() {
    if (!outputDirectory) return;
    await cp(fileURLToPath(new URL('./public/audio/train', import.meta.url)), resolve(outputDirectory, 'audio/train'), { recursive: true });
    const destination = resolve(outputDirectory, 'assets/models/train');
    await mkdir(destination, { recursive: true });
    for (const name of ['quaternius-electric.glb', 'quaternius-passenger.glb', 'LICENSE.md']) await cp(fileURLToPath(new URL(`./public/assets/models/train/${name}`, import.meta.url)), resolve(destination, name));
    const people = resolve(outputDirectory, 'assets/models/people'); await mkdir(people, { recursive: true });
    await cp(fileURLToPath(new URL('./public/assets/models/people/boxman.glb', import.meta.url)), resolve(people, 'boxman.glb'));
    const licences = resolve(outputDirectory, 'licenses'); await mkdir(licences, { recursive: true });
    await cp(fileURLToPath(new URL('./public/licenses/sketchbook-boxman.txt', import.meta.url)), resolve(licences, 'sketchbook-boxman.txt'));
  }, configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const name = req.url?.split('?')[0];
      if (!name || (!/^\/audio\/train\/(idle_hum|rail_joint|brake_hiss|brake_squeal|horn|bridge_rumble|metal_clank|crossing_bell)\.wav$/.test(name) && !['/assets/models/train/quaternius-electric.glb', '/assets/models/train/quaternius-passenger.glb', '/assets/models/people/boxman.glb'].includes(name))) return next();
      res.setHeader('Content-Type', name.endsWith('.wav') ? 'audio/wav' : 'model/gltf-binary');
      const stream = createReadStream(fileURLToPath(new URL(`./public${name}`, import.meta.url)));
      stream.on('error', () => { res.statusCode = 404; res.end(); }); stream.pipe(res);
    });
  } }],
  server: { host: '127.0.0.1', port: 8790, strictPort: true },
  build: { outDir: '../dist-johannesburg', emptyOutDir: true, rollupOptions: { input: 'app/johannesburg.html' } },
});
