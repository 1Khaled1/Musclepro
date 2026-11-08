/**
 * Builds frontend/public/models/musclepro-anatomy.glb — the 3D écorché used by
 * the muscle map — from the BodyExplorer asset pack (BodyParts3D + Z-Anatomy,
 * CC BY-SA). One-off build step; the output is committed, so the app never
 * needs these tools at runtime.
 *
 *   node scripts/build-anatomy-model.mjs <anatomy.glb> <skeleton.glb> <mesh_mapping.json> <out.glb>
 *
 * Requires (dev, not app deps): @gltf-transform/core, @gltf-transform/functions,
 * @gltf-transform/extensions, meshoptimizer.
 *
 * Pipeline: classify every muscle mesh into one of MusclePro's 14 groups (or
 * "other") → one material per group → weld → meshopt simplify (per structure,
 * so small muscles keep their shape) → join per material → quantize →
 * EXT_meshopt_compression.
 */
import { readFileSync } from 'node:fs';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, quantize, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [anatomyPath, skeletonPath, mappingPath, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error('usage: build-anatomy-model.mjs anatomy.glb skeleton.glb mesh_mapping.json out.glb');
  process.exit(1);
}

// Muscle name → MusclePro group. Order matters: first match wins.
const RULES = [
  ['biceps', /biceps brachii|\bbrachialis\b|coracobrachialis/],
  ['hamstrings', /biceps femoris|semitendinosus|semimembranosus/],
  ['chest', /pectoralis|subclavius/],
  ['shoulders', /deltoid|infraspinatus|supraspinatus|teres minor|subscapularis/],
  ['triceps', /triceps brachii|anconeus/],
  ['lats', /latissimus dorsi|teres major/],
  ['traps', /trapezius|rhomboid|levator scapulae/],
  ['abs', /rectus abdominis/],
  ['obliques', /external oblique|internal oblique|serratus anterior/],
  [
    'lower_back',
    /iliocostalis (lumborum|thoracis)|longissimus thoracis|spinalis thoracis|^spinalis$|multifidus (lumborum|thoracis)|quadratus lumborum|posterior layer of thoracolumbar fascia|serratus posterior inferior/,
  ],
  ['glutes', /gluteus|tensor fasciae latae|piriformis/],
  ['quads', /rectus femoris|vastus|sartorius/],
  ['calves', /gastrocnemius|soleus|plantaris|calcaneal tendon/],
  [
    'forearms',
    /brachioradialis|extensor carpi|extensor digitorum$|extensor digiti minimi|extensor indicis|extensor pollicis|abductor pollicis longus|flexor carpi|flexor digitorum (superficialis|profundus)|flexor pollicis longus|palmaris longus|pronator|supinator/,
  ],
];

function groupOf(name) {
  const clean = name
    .replace(/_/g, ' ')
    .replace(/\b(left|right)\b ?/g, '')
    .replace(/ \(\d+\)$/, '')
    .trim();
  for (const [group, re] of RULES) if (re.test(clean)) return group;
  return 'other';
}

const mapping = JSON.parse(readFileSync(mappingPath, 'utf8'));
const tendons = new Set(mapping.filter((m) => m.isTendon).map((m) => m.name));

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(anatomyPath);
const bonesDoc = await io.read(skeletonPath);
const root = doc.getRoot();
const scene = root.listScenes()[0];

// One material per group; the viewer styles them by name ("mp:<group>").
const materials = new Map();
const materialFor = (key) => {
  if (!materials.has(key)) {
    // Distinct default colours: also keeps dedup() from merging the groups.
    const i = materials.size;
    const tint = key === 'bone' ? [0.86, 0.82, 0.74, 1] : [0.62 + i * 0.001, 0.64, 0.68, 1];
    materials.set(key, doc.createMaterial(`mp:${key}`).setBaseColorFactor(tint).setRoughnessFactor(0.6));
  }
  return materials.get(key);
};

const counts = {};
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = node.getName().replace(/_/g, ' ');
  const group = groupOf(name);
  const key = tendons.has(name) && group === 'other' ? 'tendon' : group;
  counts[key] = (counts[key] ?? 0) + 1;
  for (const prim of mesh.listPrimitives()) prim.setMaterial(materialFor(key));
}

// Bring the skeleton in as one more material ("mp:bone").
const bone = materialFor('bone');
for (const node of bonesDoc.getRoot().listNodes()) {
  const srcMesh = node.getMesh();
  if (!srcMesh) continue;
  for (const srcPrim of srcMesh.listPrimitives()) {
    const pos = srcPrim.getAttribute('POSITION');
    const nrm = srcPrim.getAttribute('NORMAL');
    const idx = srcPrim.getIndices();
    const buffer = root.listBuffers()[0];
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos.getArray().slice()).setBuffer(buffer))
      .setMaterial(bone);
    if (nrm) prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm.getArray().slice()).setBuffer(buffer));
    if (idx) prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx.getArray().slice()).setBuffer(buffer));
    const mesh = doc.createMesh(`bone:${node.getName()}`).addPrimitive(prim);
    scene.addChild(doc.createNode(`bone:${node.getName()}`).setMesh(mesh));
  }
}
counts.bone = bonesDoc.getRoot().listMeshes().length;
console.log('classified meshes:', counts);

const triCount = () =>
  root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log('triangles before:', triCount());

// Simplify every structure on its own (small muscles keep their shape):
// muscles gently, bones harder since they mostly fill silhouettes.
const isBone = (prim) => prim.getMaterial() === bone;
await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH] }), weld());
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const opts = isBone(prim) ? { ratio: 0.08, error: 0.02 } : { ratio: 0.2, error: 0.008 };
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ...opts });
  }
}
console.log('triangles after simplify:', triCount());

await doc.transform(flatten(), join({ keepNamed: false }), prune(), quantize({ quantizePosition: 14, quantizeNormal: 10 }));
console.log('meshes after join:', root.listMeshes().length, 'materials:', root.listMaterials().map((m) => m.getName()));

doc
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(outPath, doc);
console.log('wrote', outPath);
