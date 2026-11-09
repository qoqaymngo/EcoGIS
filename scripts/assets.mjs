import {readdir, readFile} from 'node:fs/promises';

const types = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  geojson: 'application/geo+json; charset=utf-8',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  woff2: 'font/woff2',
};

const root = new URL('../public/', import.meta.url);
export async function loadAssets() {
  const names = (await readdir(root, {withFileTypes: true}))
    .filter(entry => entry.isFile() && Object.hasOwn(types, entry.name.split('.').at(-1)))
    .map(entry => entry.name).sort();
  return new Map(await Promise.all(names.map(async name => {
    const extension = name.split('.').at(-1);
    const body = await readFile(new URL(name, root), extension === 'woff2' ? undefined : 'utf8');
    return ['/' + name, {type: types[extension], body}];
  })));
}
