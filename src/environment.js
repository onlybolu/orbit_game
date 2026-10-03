import * as THREE from 'three';

// All scenery is generated locally. A level seed keeps its landscape recognizable.
const PALETTES = [
  { sky: 0xe7decc, rock: 0x9e8467, top: 0x698c62, accent: 0xb8d08b, cloud: 0xfff1d6 },
  { sky: 0x96bec8, rock: 0x567f89, top: 0x8bc1ba, accent: 0x60e3d6, cloud: 0xe1f6ed },
  { sky: 0x655966, rock: 0x3b3541, top: 0x605062, accent: 0xff7544, cloud: 0x8c7780 },
  { sky: 0x373d61, rock: 0x645d86, top: 0xb2a0d5, accent: 0x87f0d0, cloud: 0x9589b1 },
];
const randomFrom = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

export class LivingEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Living landscapes';
    scene.add(this.group);
    this.quality = 'high';
    this.animated = [];
    this.uniforms = [];
    this.resources = new Set();
    this.islands = [];
    this.islandBatches = [];
  }

  own(resource) { this.resources.add(resource); return resource; }

  material(color, options = {}) {
    return this.own(new THREE.MeshStandardMaterial({ color, roughness: .9, flatShading: true, ...options }));
  }

  mesh(geometry, material, parent = this.group) {
    const mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);
    return mesh;
  }

  batchIslands() {
    const batches = new Map();
    // Flatten all islands together, including the legs nested under stone arches.
    // Matrices are relative to the scenery group, so it remains freely movable.
    for (let index = 0; index < this.islands.length; index++) {
      const island = this.islands[index].object;
      island.updateMatrixWorld(true);
      island.traverse(child => {
        if (!child.isMesh) return;
        const key = `${child.geometry.uuid}:${child.material.uuid}`;
        if (!batches.has(key)) batches.set(key, []);
        batches.get(key).push({ mesh: child, island: index });
      });
    }
    const inverse = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const matrix = new THREE.Matrix4();
    for (const entries of batches.values()) {
      const instances = this.own(new THREE.InstancedMesh(entries[0].mesh.geometry, entries[0].mesh.material, entries.length));
      instances.name = 'Island scenery batch';
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const baseY = new Float32Array(entries.length);
      const islandIndices = new Uint8Array(entries.length);
      entries.forEach(({ mesh, island }, i) => {
        matrix.multiplyMatrices(inverse, mesh.matrixWorld);
        instances.setMatrixAt(i, matrix);
        baseY[i] = matrix.elements[13];
        islandIndices[i] = island;
      });
      instances.computeBoundingSphere();
      // Bobbing never moves beyond this margin; no per-frame bounds rebuild.
      instances.boundingSphere.radius += .4;
      this.islandBatches.push({ instances, baseY, islandIndices });
      this.group.add(instances);
    }
    for (const island of this.islands) {
      this.group.remove(island.object);
      delete island.object;
    }
    this.islandOffsets = new Float32Array(this.islands.length);
  }

  clear() {
    this.group.clear();
    for (const resource of this.resources) resource.dispose();
    this.resources.clear();
    this.animated = [];
    this.uniforms = [];
    this.islands = [];
    this.islandBatches = [];
    this.islandOffsets = null;
    this.clouds = null;
  }

  setLevel(level) {
    this.clear();
    const world = Math.max(0, Math.min(3, level.worldIndex || 0));
    this.world = world;
    const p = PALETTES[world];
    const rand = randomFrom((Number(level.id) || 1) * 17093 + world * 982451653);
    const box = new THREE.Box3();
    for (const cell of level.cubes || []) {
      const v = cell.position || cell;
      box.expandByPoint(Array.isArray(v) ? new THREE.Vector3(...v) : new THREE.Vector3(v.x, v.y, v.z));
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-3, -1, -3), new THREE.Vector3(3, 2, 3));
    const center = box.getCenter(new THREE.Vector3());
    const extent = box.getSize(new THREE.Vector3());
    const radius = Math.max(19, Math.hypot(extent.x, extent.z) * .5 + 13);
    const baseY = box.min.y - 8;
    this.scene.background = new THREE.Color(p.sky);
    this.scene.fog = new THREE.FogExp2(p.sky, world === 3 ? .009 : .014);

    const rock = this.material(p.rock);
    const top = this.material(p.top);
    const foliage = this.material(world === 0 ? 0x47755b : p.accent, world === 1 || world === 3 ? { metalness: .25, roughness: .18, emissive: p.accent, emissiveIntensity: .12 } : {});
    const trunk = this.material(world === 0 ? 0x77604d : p.rock);
    const islandGeo = this.own(new THREE.ConeGeometry(1, 1, 7, 2));
    const topGeo = this.own(new THREE.CylinderGeometry(1, .92, 1, 7));
    const leafGeo = this.own(new THREE.IcosahedronGeometry(1, 1));
    const crystalGeo = this.own(new THREE.ConeGeometry(.4, 2.8, 5));
    const trunkGeo = this.own(new THREE.CylinderGeometry(.07, .13, 1.5, 5));
    const archGeo = this.own(new THREE.TorusGeometry(1.65, .29, 5, 18, Math.PI));
    const legGeo = this.own(new THREE.BoxGeometry(.57, 1.1, .58));
    const stone = this.material(0xc6b58f);
    // Farther and lower than all playable surfaces, with a clear central corridor.
    for (let i = 0; i < 17; i++) {
      const angle = i / 17 * Math.PI * 2 + rand() * .25;
      const distance = radius + rand() * 27;
      const scale = 2.2 + rand() * 4.2;
      const island = new THREE.Group();
      island.position.set(center.x + Math.cos(angle) * distance, baseY - 2 - rand() * 13, center.z + Math.sin(angle) * distance);
      island.rotation.y = rand() * Math.PI;
      this.group.add(island);
      const bottom = this.mesh(islandGeo, rock, island);
      bottom.rotation.z = Math.PI;
      bottom.scale.set(scale, scale * (1.8 + rand()), scale);
      bottom.position.y = -bottom.scale.y * .5;
      const terrace = this.mesh(topGeo, top, island);
      terrace.scale.set(scale, .38 + rand() * .5, scale);
      terrace.position.y = -.05;
      if (world === 0 && i % 3 === 0) {
        const arch = this.mesh(archGeo, stone, island);
        arch.position.y = .7;
        arch.rotation.y = rand() * Math.PI;
        for (const side of [-1, 1]) {
          const leg = this.mesh(legGeo, stone, arch);
          leg.position.set(side * 1.65, -.55, 0);
        }
      }
      const count = world === 2 ? 4 : 5 + Math.floor(rand() * 6);
      for (let j = 0; j < count; j++) {
        const a = rand() * Math.PI * 2, r = rand() * scale * .7;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (world === 0) {
          const stem = this.mesh(trunkGeo, trunk, island); stem.position.set(x, .9, z);
          const crown = this.mesh(leafGeo, foliage, island); crown.position.set(x, 1.7, z);
          crown.scale.set(.6 + rand() * .7, .9 + rand() * .5, .7 + rand() * .5);
        } else {
          const crystal = this.mesh(crystalGeo, world === 2 ? rock : foliage, island);
          crystal.position.set(x, .4 + rand(), z);
          crystal.scale.setScalar(.6 + rand() * 1.4);
          crystal.rotation.set((rand() - .5) * .5, rand() * 6, (rand() - .5) * .5);
        }
      }
      this.islands.push({ object: island, phase: rand() * 7, speed: .15 + rand() * .15 });
    }
    this.group.updateWorldMatrix(true, true);
    this.batchIslands();

    // Shared instanced wisps avoid hundreds of cloud draw calls.
    const cloudGeo = this.own(new THREE.IcosahedronGeometry(1, 2));
    const cloudMat = this.material(p.cloud, { transparent: true, opacity: world === 2 ? .23 : .31, depthWrite: false });
    const clouds = this.own(new THREE.InstancedMesh(cloudGeo, cloudMat, 72));
    this.group.add(clouds);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 72; i++) {
      const a = rand() * Math.PI * 2, d = radius + 8 + rand() * 35;
      dummy.position.set(center.x + Math.cos(a) * d, baseY - 3 - rand() * 14, center.z + Math.sin(a) * d);
      dummy.scale.set(3 + rand() * 6, .5 + rand() * .8, 1.6 + rand() * 3);
      dummy.rotation.y = rand() * 6;
      dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix);
    }
    this.animated.push({ object: clouds, type: 'cloud', speed: .008 });
    this.clouds = clouds;

    if (world === 1 || world === 2) this.addSurface(center, baseY - 16, p, world);
    if (world === 3) this.addCosmos(center, radius, rand);
    this.addMotes(center, radius, baseY, rand, p, world);
    this.setQuality(this.quality);
  }

  addSurface(center, y, palette, world) {
    const uniforms = { time: { value: 0 }, hot: { value: world === 2 ? 1 : 0 }, tint: { value: new THREE.Color(world === 2 ? 0xff6834 : 0x2da9b1) } };
    this.uniforms.push(uniforms);
    const material = this.own(new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; uniform float time; uniform float hot;
        void main(){ vUv=uv; vec3 p=position; p.z+=sin(p.x*.23+time*.5)*cos(p.y*.19+time*.3)*.32*(1.-hot); gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `varying vec2 vUv; uniform float time; uniform float hot; uniform vec3 tint;
        void main(){vec2 q=vUv*65.; float wave=sin(q.x+sin(q.y*.7+time*.23)*2.+time*.3)*sin(q.y*1.3+time*.21); float glint=pow(max(0.,wave),8.); float fade=1.-smoothstep(.2,.5,length(vUv-.5)); vec3 c=mix(tint*.65,tint, .5+wave*.18)+vec3(glint)*mix(.25,.7,hot); gl_FragColor=vec4(c,fade*.8);}`,
    }));
    const plane = this.mesh(this.own(new THREE.PlaneGeometry(160, 160, 48, 48)), material);
    plane.position.set(center.x, y, center.z); plane.rotation.x = -Math.PI / 2;
  }

  addCosmos(center, radius, rand) {
    const planet = this.mesh(this.own(new THREE.SphereGeometry(7, 40, 24)), this.material(0x9895bc, { roughness: 1, emissive: 0x353255, emissiveIntensity: .3 }));
    planet.position.set(center.x - radius - 22, center.y + 9, center.z - radius - 18);
    const rings = this.mesh(this.own(new THREE.RingGeometry(10, 15, 100)), this.own(new THREE.MeshBasicMaterial({ color: 0xafa5db, transparent: true, opacity: .24, side: THREE.DoubleSide, depthWrite: false })), planet);
    rings.rotation.x = 1.14; rings.rotation.y = .35;
    for (let r = 0; r < 3; r++) {
      const vertices = [], uvs = [], indices = [];
      for (let i = 0; i <= 96; i++) {
        const a = i / 96 * Math.PI * 1.6 + r * .6;
        const d = radius + 27 + r * 6;
        for (let j = 0; j < 2; j++) {
          vertices.push(center.x + Math.cos(a) * d, center.y + 14 + Math.sin(a * 3 + r) * 3 + j * 7, center.z + Math.sin(a) * d);
          uvs.push(i / 96, j);
        }
        if (i < 96) { const b = i * 2; indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      }
      const geometry = this.own(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
      const uniforms = { time: { value: 0 }, hue: { value: r } }; this.uniforms.push(uniforms);
      this.mesh(geometry, this.own(new THREE.ShaderMaterial({ uniforms, side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vUv; uniform float time; void main(){ vUv=uv; vec3 p=position; p.y+=sin(uv.x*18.+time*.3)*1.3; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
        fragmentShader: `varying vec2 vUv; uniform float time; uniform float hue; void main(){ float fade=sin(vUv.y*3.14159)*sin(vUv.x*3.14159); float streak=.55+.45*sin(vUv.x*180.+time*.25); vec3 c=mix(vec3(.17,.75,.55),vec3(.45,.24,.8),vUv.y+hue*.16); gl_FragColor=vec4(c,fade*streak*.24); }`,
      })));
    }
  }

  addMotes(center, radius, baseY, rand, palette, world) {
    const count = world === 3 ? 420 : 150;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2, d = radius + rand() * 48;
      positions.set([center.x + Math.cos(a) * d, world === 3 ? center.y + (rand() - .45) * 90 : baseY - rand() * 16, center.z + Math.sin(a) * d], i * 3);
    }
    const geo = this.own(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = this.own(new THREE.PointsMaterial({ color: world === 3 ? 0xdde5ff : palette.accent, size: world === 2 ? .16 : .11, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
    const points = new THREE.Points(geo, mat); this.group.add(points);
    this.animated.push({ object: points, type: world === 2 ? 'ember' : 'stars', speed: .009 });
  }

  update(dt, elapsed) {
    if (!this.group.visible) return;
    for (const u of this.uniforms) u.time.value = elapsed;
    for (let i = 0; i < this.islands.length; i++) {
      const island = this.islands[i];
      this.islandOffsets[i] = Math.sin(elapsed * island.speed + island.phase) * .38;
    }
    for (const { instances, baseY, islandIndices } of this.islandBatches) {
      const matrices = instances.instanceMatrix.array;
      for (let i = 0; i < baseY.length; i++) matrices[i * 16 + 13] = baseY[i] + this.islandOffsets[islandIndices[i]];
      instances.instanceMatrix.needsUpdate = true;
    }
    for (const a of this.animated) {
      if (a.type === 'ember') { a.object.position.y = Math.sin(elapsed * .14) * 2; a.object.rotation.y = elapsed * .006; }
      else a.object.rotation.y = elapsed * a.speed;
    }
  }

  setQuality(quality) {
    this.quality = quality;
    if (this.clouds) this.clouds.count = quality === 'low' ? 30 : quality === 'balanced' || quality === 'medium' ? 48 : 72;
  }

  dispose() { this.clear(); this.scene.remove(this.group); }
}
