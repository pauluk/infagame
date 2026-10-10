// npm run assets:render  ->  rebuild the Blender scene, render every sprite, pack atlases + asset-manifest.json
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [process.env.BLENDER, 'blender', '/opt/blender-dl/blender-4.5.9-linux-x64/blender',
  '/Applications/Blender.app/Contents/MacOS/Blender', 'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe'].filter(Boolean);
const probe = (c) => spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0;
const blender = candidates.find(probe);
if (!blender) {
  console.error('Blender not found. Install Blender 4.x (tested with 4.5 LTS) or set BLENDER=/path/to/blender.\n' +
    'The game still runs: the rendered atlases are already committed under public/assets/.');
  process.exit(1);
}
const run = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' }); if (r.status !== 0) process.exit(r.status ?? 1); };
const only = process.argv.slice(2);
console.log('Using', blender);
run(blender, ['-b', '-P', 'blender/scripts/build_facility.py']);
run(blender, ['-b', 'blender/source/ledgerlock_facility.blend', '-P', 'blender/scripts/render_sprites.py', '--', '--force', ...only]);
run(process.env.PYTHON || 'python3', ['blender/scripts/pack_atlas.py']);
run(process.env.PYTHON || 'python3', ['blender/scripts/make_attribution.py']);
console.log('Done. Atlases are in public/assets/*/atlas.(png|json); manifest in asset-manifest.json');
