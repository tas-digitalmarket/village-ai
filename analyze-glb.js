// Quick GLB parser - reads the JSON chunk to extract all node names
const fs = require('fs');
const path = require('path');

const glbPath = path.join(__dirname, 'client/models/villager.glb');
const buf = fs.readFileSync(glbPath);

// GLB format: 12-byte header, then chunks
// Chunk 0: JSON
const chunkLength = buf.readUInt32LE(12);
const chunkType = buf.readUInt32LE(16); // 0x4E4F534A = JSON
const jsonStr = buf.slice(20, 20 + chunkLength).toString('utf8');
const gltf = JSON.parse(jsonStr);

console.log('\n=== GLB Structure Analysis ===\n');

// Nodes (includes bones, meshes, etc.)
if (gltf.nodes) {
  console.log(`Total nodes: ${gltf.nodes.length}`);
  console.log('\nAll node names:');
  gltf.nodes.forEach((n, i) => {
    const type = n.skin !== undefined ? '[SKIN]' : n.mesh !== undefined ? '[MESH]' : '[NODE]';
    console.log(`  ${i}: ${type} "${n.name || '(unnamed)'}"`);
  });
}

// Animations
if (gltf.animations && gltf.animations.length) {
  console.log(`\nAnimations (${gltf.animations.length}):`);
  gltf.animations.forEach((a, i) => {
    console.log(`  ${i}: "${a.name}"`);
  });
} else {
  console.log('\nNo animations found in GLB.');
}

// Skins (skeletons)
if (gltf.skins && gltf.skins.length) {
  console.log(`\nSkins (skeletons): ${gltf.skins.length}`);
  gltf.skins.forEach((s, i) => {
    console.log(`  Skin ${i}: "${s.name}", skeleton root: ${s.skeleton}, joints: [${s.joints.join(', ')}]`);
    console.log('  Joint names:');
    s.joints.forEach(j => {
      const node = gltf.nodes[j];
      console.log(`    Joint ${j}: "${node ? node.name : 'unknown'}"`);
    });
  });
} else {
  console.log('\nNo skins found — model has no skeleton!');
}
