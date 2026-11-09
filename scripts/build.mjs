import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {loadAssets} from './assets.mjs';
import {CHAT_TOOLS} from '../public/chat-tools.js';

const dist = new URL('../dist/', import.meta.url);
const assets = await loadAssets();
const entries = Array.from(assets, ([name, {body, type}]) => [
  name, typeof body === 'string' ? {body, type} : {binary: body.toString('base64'), type},
]);
const handler = await readFile(new URL('../server/handler.js', import.meta.url), 'utf8');
const entry = handler + '\nconst bundledAssets = new Map(' + JSON.stringify(entries) + ');\n' + `
export default {
  fetch: createHandler(path => {
    const asset = bundledAssets.get(path);
    if (!asset) return null;
    const body = asset.binary ? Uint8Array.from(atob(asset.binary), byte => byte.charCodeAt(0)) : asset.body;
    return {type: asset.type, body};
  }, {chatTools: ${JSON.stringify(CHAT_TOOLS)}}),
};
`;
await Promise.all([mkdir(new URL('server/', dist), {recursive: true}), mkdir(new URL('.openai/', dist), {recursive: true})]);
await Promise.all([
  writeFile(new URL('server/index.js', dist), entry),
  copyFile(new URL('../.openai/hosting.json', import.meta.url), new URL('.openai/hosting.json', dist)),
]);
