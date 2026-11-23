import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const dist = new URL('./dist/', import.meta.url);
// The sole cleanup target is this project's generated dist directory.
await rm(dist,{recursive:true,force:true});
await mkdir(dist,{recursive:true});
for(const file of ['index.html','favicon.svg'])await copyFile(new URL(file,import.meta.url),new URL(file,dist));
await cp(new URL('./src/',import.meta.url),new URL('./src/',dist),{recursive:true});
console.log(`Built static site: ${fileURLToPath(dist)}`);
