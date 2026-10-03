import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LivingEnvironment } from './environment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const FRONT = new THREE.Vector3(0, 0, 1);
const v3 = (v, fallback = [0, 0, 0]) => {
  if (v?.isVector3) return v.clone();
  if (Array.isArray(v)) return new THREE.Vector3(...v);
  if (v && typeof v === 'object') return new THREE.Vector3(v.x || 0, v.y || 0, v.z || 0);
  return new THREE.Vector3(...fallback);
};
const facePosition = (cell, normal, offset = .81) => v3(cell).addScaledVector(v3(normal, [0, 1, 0]), offset);
const clamp = THREE.MathUtils.clamp;
const smooth = (t) => t * t * (3 - 2 * t);
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, ...extra });

function stoneTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ece5d6'; ctx.fillRect(0, 0, 256, 256);
  let seed = 9182;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 24000; i++) {
    const p = rand();
    ctx.fillStyle = p > .5 ? `rgba(255,255,249,${rand() * .17})` : `rgba(90,77,57,${rand() * .09})`;
    ctx.fillRect(rand() * 256, rand() * 256, rand() * 1.8 + .2, rand() * 1.8 + .2);
  }
  ctx.strokeStyle = 'rgba(108,95,72,.10)'; ctx.lineWidth = 1;
  ctx.strokeRect(13.5, 13.5, 229, 229);
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.strokeRect(15.5, 15.5, 225, 225);
  for (const [x, y] of [[22, 22], [234, 22], [22, 234], [234, 234]]) {
    ctx.fillStyle = 'rgba(130,114,87,.20)'; ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.12, 'rgba(255,255,255,.7)');
  g.addColorStop(.45, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function beachTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ['#eeb43c', '#fff4db', '#e36a43', '#fff4db', '#408d9c', '#fff4db'].forEach((color, i) => {
    ctx.fillStyle = color; ctx.fillRect(i * 128, 0, 128, 384);
    ctx.fillStyle = 'rgba(65,55,40,.12)'; ctx.fillRect(i * 128, 0, 1, 384);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(i * 128 + 1, 0, 1, 384);
  });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

const SKINS = {
  glacier: { color: 0xf0ffff, metalness: 0, roughness: .025, transmission: 1, thickness: .38, ior: 1.46, iridescence: .04, accent: 0x64cddd },
  sunset: { color: 0xffb06c, metalness: .08, roughness: .055, transmission: .96, thickness: .8, ior: 1.47, iridescence: .4, accent: 0xff9c4b },
  obsidian: { color: 0x182736, metalness: .91, roughness: .14, transmission: .04, thickness: .7, ior: 1.52, iridescence: .75, accent: 0x7181fb },
  pearl: { color: 0xfff3e3, metalness: .24, roughness: .13, transmission: .12, thickness: .4, ior: 1.45, iridescence: .9, accent: 0xeeb7c5 },
  aurora: { color: 0x77edc8, metalness: .14, roughness: .07, transmission: .88, thickness: .9, ior: 1.52, iridescence: 1, accent: 0x9066fa },
  classic: { color: 0xf8ba40, metalness: .1, roughness: .23, transmission: 0, thickness: .5, ior: 1.45, iridescence: 0, accent: 0xe36438 },
};

export const HERO_LEVEL = {
  name: 'A world beyond gravity',
  cubes: [[-2,0,1],[-1,0,1],[0,0,1],[1,0,1],[1,1,1],[2,1,1],[3,1,1],[3,1,0],[3,1,-1],[3,1,-2],[2,1,-2],[1,1,-2],[0,1,-2],[0,0,-2],[0,-1,-2],[-1,-1,-2],[-2,-1,-2]],
  start: { cell: [1,1,1], normal: [0,1,0], forward: [1,0,0] },
  items: [
    { type: 'coin', cell: [2,1,1], normal: [0,1,0] },
    { type: 'coin', cell: [3,1,0], normal: [0,1,0] },
    { type: 'coin', cell: [3,1,-1], normal: [0,1,0] },
    { type: 'key', cell: [1,1,-2], normal: [0,1,0] },
    { type: 'exit', cell: [-2,0,1], normal: [0,1,0] },
  ],
};

export class WorldView {
  constructor(canvas, { onReady } = {}) {
    this.canvas = canvas;
    this.mode = 'menu';
    this.quality = 'high';
    this.items = [];
    this.itemTemplates = new Map();
    this.sharedGeometry = new Set();
    this.sharedMaterial = new Set();
    this.scratch = {
      old: new THREE.Vector3(), movement: new THREE.Vector3(), axis: new THREE.Vector3(),
      position: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(),
      direction: new THREE.Vector3(), right: new THREE.Vector3(), offset: new THREE.Vector3(),
      matrix: new THREE.Matrix4(), quaternion: new THREE.Quaternion(),
    };
    this.skinId = 'glacier';
    this.collected = new Set();
    this.elapsed = 0;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.info.autoReset = false;
    this.renderer.transmissionResolutionScale = .75;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .88;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#eadfce');
    this.scene.fog = new THREE.FogExp2('#e8ddce', .023);
    this.camera = new THREE.PerspectiveCamera(39, 1, .1, 160);
    this.camera.position.set(9, 9, 12);
    this.camera.lookAt(0, 0, 0);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = new RoomEnvironment();
    this.environment = pmrem.fromScene(env, .04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .5;
    env.dispose(); pmrem.dispose();

    this.hemisphere = new THREE.HemisphereLight(0xe3f5ff, 0x776558, .75);
    this.scene.add(this.hemisphere);
    this.sun = new THREE.DirectionalLight(0xffedcc, 2.5);
    this.sun.position.set(-7, 13, 8); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1536, 1536);
    Object.assign(this.sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 65 });
    this.sun.shadow.normalBias = .025; this.sun.shadow.bias = -.00015;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight(0xc5efff, .85); rim.position.set(7, 5, -9); this.scene.add(rim);
    this.stoneMap = stoneTexture();
    this.glowMap = glowTexture();
    this.classicMap = beachTexture();
    this.blockGeometry = new RoundedBoxGeometry(.986, .986, .986, 3, .039);
    this.blockMaterials = [
      material(0xf5eee1, { map: this.stoneMap, bumpMap: this.stoneMap, bumpScale: .022 }),
      material(0xe3d5bf, { map: this.stoneMap, bumpMap: this.stoneMap, bumpScale: .026 }),
      material(0xe9b69a, { map: this.stoneMap, bumpMap: this.stoneMap, bumpScale: .02 }),
    ];
    this.levelGroup = new THREE.Group(); this.scene.add(this.levelGroup);
    this.itemGroup = new THREE.Group(); this.scene.add(this.itemGroup);
    this.decorGroup = new THREE.Group(); this.scene.add(this.decorGroup);
    this._makeAtmosphere();
    this.livingEnvironment = new LivingEnvironment(this.scene);
    this.floor.visible = false;
    this._makeBall();
    this.playerPosition = new THREE.Vector3(0, .82, 0);
    this.fromPosition = this.playerPosition.clone(); this.targetPosition = this.playerPosition.clone();
    this.playerNormal = UP.clone(); this.targetNormal = UP.clone();
    this.playerForward = new THREE.Vector3(0, 0, -1);
    this.cameraFrame = new THREE.Quaternion();
    this.cameraFrameFrom = new THREE.Quaternion();
    this.cameraFrameTarget = new THREE.Quaternion();
    this.cameraAnchor = new THREE.Vector3();
    this.cameraTurnProgress = 1;
    this.transition = 1; this.jump = false;
    this.fromNormal = UP.clone();
    this.playerCell = new THREE.Vector3();
    this.cornerCell = new THREE.Vector3();
    this.levelCenter = new THREE.Vector3();
    this.levelRadius = 3;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .14, .55, 1.32);
    this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.resize();
    onReady?.();
  }

  _makeBall() {
    this.ball = new THREE.Group(); this.scene.add(this.ball);
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(.315, 72, 48), new THREE.MeshPhysicalMaterial({
      clearcoat: .15, clearcoatRoughness: .025, envMapIntensity: .8,
      attenuationColor: new THREE.Color(0xc6f3ff), attenuationDistance: 1.3,
    }));
    this.shell.castShadow = true; this.ball.add(this.shell);
    this.interior = new THREE.Group(); this.ball.add(this.interior);
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(.195, .018, 12, 72, Math.PI * 1.56),
      new THREE.MeshPhysicalMaterial({ color: 0x77d8eb, roughness: .15, metalness: .7, clearcoat: 1, envMapIntensity: 1.5 }));
    ribbon.rotation.set(.7, .85, -.4); this.interior.add(ribbon);
    const ribbon2 = ribbon.clone(); ribbon2.scale.setScalar(.82); ribbon2.rotation.set(-.8, -.3, 1.9); this.interior.add(ribbon2);
    this.core = new THREE.Mesh(new THREE.SphereGeometry(.071, 24, 16), new THREE.MeshStandardMaterial({ color: 0xe7fcff, metalness: .4, roughness: .12, emissive: 0x88ddee, emissiveIntensity: .12 }));
    this.core.visible = false;
    this.interior.add(this.core);
    this.classicBand = new THREE.Mesh(new THREE.SphereGeometry(.317, 48, 24, 0, Math.PI * 2, Math.PI * .39, Math.PI * .22), material(0xffffff, { roughness: .25 }));
    this.ball.add(this.classicBand);
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({
      map: this.glowMap, color: 0x394652, transparent: true, opacity: .24, depthWrite: false,
    }));
    this.scene.add(this.contact);
    this.setSkin('glacier');
  }

  _makeAtmosphere() {
    // Distant architectural circles give scale without obscuring the playable route.
    this.orbits = new THREE.Group(); this.scene.add(this.orbits);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xc6aa8a, transparent: true, opacity: .21, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(12 + i * 5, .014, 4, 192), ringMaterial);
      ring.rotation.set(Math.PI / 2 + i * .24, i * .31, i * .15);
      ring.position.set(0, -6 - i * 3, -5);
      this.orbits.add(ring);
    }
    const points = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i++) {
      points[i * 3] = Math.sin(i * 127.1) * 20;
      points[i * 3 + 1] = Math.cos(i * 311.7) * 10;
      points[i * 3 + 2] = Math.sin(i * 74.7) * 20;
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(points, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff9df, map: this.glowMap, transparent: true, opacity: .65, size: .07, depthWrite: false }));
    this.scene.add(this.dust);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(250, 250), material(0xe3d8c7, { roughness: 1 }));
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -15;
    this.scene.add(this.floor);
  }

  _clearGroup(group) {
    for (const child of [...group.children]) {
      group.remove(child);
      child.traverse(o => {
        if (o.isInstancedMesh) o.dispose();
        if (o.geometry && !this.sharedGeometry.has(o.geometry) && o.geometry !== this.blockGeometry) o.geometry.dispose();
        if (o.material && !this.blockMaterials.includes(o.material)) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!this.sharedMaterial.has(m)) m.dispose();
        }
      });
    }
  }

  setLevel(level) {
    this.level = level;
    const palettes = [
      { sky: 0xf4e6d2, blocks: [0xf5eee1, 0xe3d5bf, 0xe9b69a], ground: 0xe9dbc7, sun: 0xffedcc },
      { sky: 0xcadfe0, blocks: [0xe5f0e9, 0xb7d6ce, 0x83b9b5], ground: 0xb2cbd0, sun: 0xf5f3df },
      { sky: 0x9b9bb2, blocks: [0x6a687a, 0x55536b, 0xb8887b], ground: 0x85859b, sun: 0xffd3b9 },
      { sky: 0xdedceb, blocks: [0xf1eef9, 0xd2cadf, 0xc5b0d8], ground: 0xc7c4da, sun: 0xfff1e7 },
    ];
    const palette = palettes[level.worldIndex || 0];
    this.scene.background.setHex(palette.sky); this.scene.fog.color.setHex(palette.sky);
    this.floor.material.color.setHex(palette.ground); this.sun.color.setHex(palette.sun);
    this.blockMaterials.forEach((m, i) => m.color.setHex(palette.blocks[i]));
    this._clearGroup(this.levelGroup); this._clearGroup(this.itemGroup); this._clearGroup(this.decorGroup);
    this.items = []; this.collected = new Set();
    const cubes = level.cubes || level.blocks || [];
    const box = new THREE.Box3();
    const batches = [[], [], []];
    cubes.forEach((cell, i) => {
      const p = v3(cell.position || cell);
      batches[((i * 13) % 17 === 0) ? 2 : ((i * 7) % 11 === 0 ? 1 : 0)].push(p);
      box.expandByPoint(p);
    });
    const matrix = new THREE.Matrix4();
    batches.forEach((positions, index) => {
      if (!positions.length) return;
      const batch = new THREE.InstancedMesh(this.blockGeometry, this.blockMaterials[index], positions.length);
      positions.forEach((p, i) => batch.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z)));
      batch.instanceMatrix.needsUpdate = true;
      batch.castShadow = batch.receiveShadow = true;
      batch.computeBoundingSphere();
      this.levelGroup.add(batch);
    });
    if (cubes.length) {
      box.getCenter(this.levelCenter);
      this.levelRadius = Math.max(2.5, box.getSize(new THREE.Vector3()).length() * .48);
    }
    this.sun.position.copy(this.levelCenter).add(new THREE.Vector3(-7, 13, 8));
    this.sun.target.position.copy(this.levelCenter);
    (level.items || []).forEach((item, index) => this._makeItem(item, index));
    // Suspended mineral fragments reinforce the floating-world silhouette.
    for (let i = 0; i < Math.min(9, cubes.length); i++) {
      const p = v3(cubes[(i * 7) % cubes.length]);
      const fragment = new THREE.Mesh(new THREE.OctahedronGeometry(.11 + (i % 3) * .065), material(i % 2 ? 0xdfc4a5 : 0xe9ddd0));
      fragment.position.copy(p).add(new THREE.Vector3(Math.sin(i * 3) * 1.2, -2.1 - (i % 4) * .6, Math.cos(i * 5) * .8));
      fragment.rotation.set(i * .5, i * .7, i); this.decorGroup.add(fragment);
    }
    const start = level.start || { cell: cubes[0] || [0, 0, 0], normal: [0, 1, 0], forward: [0, 0, -1] };
    this.setPlayer(start.cell, start.normal, start.forward, { instant: true });
    this.livingEnvironment.setLevel(level);
    this._updatePortal();
  }

  _makeItem(item, index) {
    const cached = this.itemTemplates.get(item.type);
    if (cached) {
      const root = cached.clone(true);
      root.position.copy(facePosition(item.cell, item.normal, .51));
      root.quaternion.setFromUnitVectors(UP, v3(item.normal, [0, 1, 0]));
      const animated = root.children[0];
      this.itemGroup.add(root);
      this.items.push({ item, index, root, animated, baseY: animated.position.y, collectedAt: null });
      return;
    }
    const root = new THREE.Group();
    const n = v3(item.normal, [0, 1, 0]);
    root.position.copy(facePosition(item.cell, n, .51));
    root.quaternion.setFromUnitVectors(UP, n);
    const animated = new THREE.Group(); root.add(animated);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc45b, metalness: .83, roughness: .19, envMapIntensity: 1.35 });
    const type = item.type;
    if (type === 'coin') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.138, .138, .038, 40), gold);
      body.rotation.x = Math.PI / 2; animated.add(body);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(.117, .008, 6, 40), material(0xffe7a0, { metalness: .9, roughness: .15 }));
      rim.position.z = .023; animated.add(rim);
      const inset = new THREE.Mesh(new THREE.BoxGeometry(.025, .113, .008), gold); inset.position.z = .026; animated.add(inset);
      animated.position.y = .29;
    } else if (type === 'key') {
      const head = new THREE.Mesh(new THREE.TorusGeometry(.12, .035, 12, 32), gold); head.position.y = .17; animated.add(head);
      const stem = new THREE.Mesh(new RoundedBoxGeometry(.055, .27, .055, 2, .01), gold); stem.position.y = -.015; animated.add(stem);
      for (let i = 0; i < 2; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(.11, .047, .055), gold); tooth.position.set(.04, -.095 + i * .085, 0); animated.add(tooth);
      }
      animated.position.y = .42;
    } else if (type === 'exit') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.34, .4, .06, 48), material(0x75958f, { metalness: .7, roughness: .23 })); base.position.y = .03; root.add(base);
      const portal = new THREE.Mesh(new THREE.TorusGeometry(.29, .035, 14, 64), new THREE.MeshStandardMaterial({ color: 0x8affed, emissive: 0x39d8bb, emissiveIntensity: 1.7, metalness: .3, roughness: .2 }));
      portal.position.y = .4; animated.add(portal);
      const inside = new THREE.Mesh(new THREE.CircleGeometry(.255, 48), new THREE.MeshBasicMaterial({ color: 0x7ce9da, transparent: true, opacity: .13, side: THREE.DoubleSide, depthWrite: false })); inside.position.y = .4; animated.add(inside);
      for (let i = 0; i < 7; i++) {
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(.025), material(0xb8ffee, { emissive: 0x59c4ae, emissiveIntensity: 1.3 }));
        const a = i / 7 * Math.PI * 2; shard.position.set(Math.cos(a) * .38, .4 + Math.sin(a) * .38, 0); animated.add(shard);
      }
    } else if (type === 'lava') {
      const plate = new THREE.Mesh(new RoundedBoxGeometry(.94, .07, .94, 2, .02), material(0x251c1c, {metalness:.6,roughness:.45}));
      plate.position.y=.025;root.add(plate);
      const lava = new THREE.Mesh(new THREE.PlaneGeometry(.81,.81), new THREE.ShaderMaterial({
        uniforms:{uTime:{value:0}},
        vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
        fragmentShader:`varying vec2 vUv; uniform float uTime;
          void main(){vec2 p=vUv*9.; float flow=sin(p.x*1.9+sin(p.y*2.+uTime)*1.4)+cos(p.y*2.3-uTime*.8)+sin((p.x+p.y)*3.+uTime*.4)*.4;
          float vein=pow(1.-abs(sin(flow*2.)),5.); vec3 c=mix(vec3(.33,.014,.003),vec3(2.9,.48,.018),vein);
          c+=vec3(.5,.065,.002)*(sin(flow+uTime)*.5+.5);gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`,side:THREE.DoubleSide
      }));
      lava.rotation.x=-Math.PI/2;lava.position.y=.067;animated.add(lava);
      for(let i=0;i<6;i++){
        const stripe=new THREE.Mesh(new THREE.BoxGeometry(.08,.008,.04),material(i%2?0xffb332:0x32201a));
        stripe.position.set(-.3+i*.12,.065,.44);root.add(stripe);
        const flame=new THREE.Mesh(new THREE.ConeGeometry(.04,.28,5),new THREE.MeshBasicMaterial({color:i%2?0xffb629:0xf15b16,transparent:true,opacity:.65,depthWrite:false}));
        flame.position.set(Math.sin(i*7)*.32,.19,Math.cos(i*9)*.3);flame.userData.flame=true;animated.add(flame);
      }
    } else if (type === 'spike') {
      const plate = new THREE.Mesh(new RoundedBoxGeometry(.77, .05, .77, 2, .025), material(0x615d5c, { metalness: .55, roughness: .32 })); plate.position.y = .025; root.add(plate);
      const spikeMaterial = material(0x8b7370, { metalness: .8, roughness: .24 });
      const spikeGeometry = new THREE.ConeGeometry(.082, .26, 5);
      for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) {
        const spike = new THREE.Mesh(spikeGeometry, spikeMaterial); spike.position.set(x * .23, .16, z * .23); root.add(spike);
      }
    } else if (type === 'fruit') {
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(.15, 24, 20), new THREE.MeshPhysicalMaterial({ color: 0xf17b43, roughness: .24, clearcoat: .8 })); fruit.scale.set(1, 1.08, 1); animated.add(fruit);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(.065, 12, 8), material(0x6c9771)); leaf.position.set(.035, .155, 0); leaf.scale.set(1, .25, .5); leaf.rotation.z = .5; animated.add(leaf); animated.position.y = .3;
    } else if (type === 'time') {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(.15, .027, 12, 32), material(0x93b9d8, { metalness: .7, roughness: .22 })); animated.add(frame);
      const hand = new THREE.Mesh(new THREE.BoxGeometry(.017, .11, .027), material(0x5381a8)); hand.position.y = .042; animated.add(hand);
      const hand2 = hand.clone(); hand2.rotation.z = Math.PI / 2; hand2.scale.y = .7; hand2.position.set(.035, 0, 0); animated.add(hand2); animated.position.y = .3;
    }
    // Bake rigid repeated details once, then reuse their GPU resources across levels.
    if (type === 'spike' || type === 'coin' || type === 'key') {
      for (const group of [root, animated]) {
        const byMaterial = new Map();
        for (const mesh of group.children) if (mesh.isMesh) {
          const batch = byMaterial.get(mesh.material) || [];
          batch.push(mesh); byMaterial.set(mesh.material, batch);
        }
        for (const [mat, meshes] of byMaterial) if (meshes.length > 1) {
          const parts = meshes.map(mesh => {
            mesh.updateMatrix();
            const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
            return geometry.applyMatrix4(mesh.matrix);
          });
          const merged = mergeGeometries(parts);
          parts.forEach(part => part.dispose());
          if (merged) {
            const originals = new Set(meshes.map(mesh => mesh.geometry));
            meshes.forEach(mesh => group.remove(mesh));
            originals.forEach(geometry => geometry.dispose());
            group.add(new THREE.Mesh(merged, mat));
          }
        }
      }
    }
    root.traverse(o => {
      if (o.isMesh) o.castShadow = false;
      if (o.geometry) this.sharedGeometry.add(o.geometry);
      if (o.material) this.sharedMaterial.add(o.material);
    });
    this.itemTemplates.set(type, root.clone(true));
    if (type !== 'coin' && type !== 'key') gold.dispose();
    this.itemGroup.add(root);
    this.items.push({ item, index, root, animated, baseY: animated.position.y, collectedAt: null });
  }

  setCollected(collected) {
    this.collected = collected instanceof Set ? collected : new Set(collected || []);
    for (const entry of this.items) {
      const { item, index } = entry;
      const key = `${Array.isArray(item.cell) ? item.cell.join(',') : ''}|${Array.isArray(item.normal) ? item.normal.join(',') : ''}`;
      const found = this.collected.has(item.id) || this.collected.has(index) || this.collected.has(key);
      if (found && entry.collectedAt === null) entry.collectedAt = this.elapsed;
      if (!found) { entry.collectedAt = null; entry.root.visible = true; entry.root.scale.setScalar(1); }
    }
    this._updatePortal();
  }

  _updatePortal() {
    const unlocked = this.mode === 'menu' || this.items.filter(e => e.item.type === 'key').every(e => e.collectedAt !== null);
    for (const entry of this.items.filter(e => e.item.type === 'exit')) {
      const ring = entry.animated.children[0];
      ring.material.color.setHex(unlocked ? 0x8affed : 0xb5a186);
      ring.material.emissive.setHex(unlocked ? 0x39d8bb : 0x856b43);
      ring.material.emissiveIntensity = unlocked ? 1.7 : .12;
      entry.animated.children[1].material.opacity = unlocked ? .13 : .03;
    }
  }

  setSkin(id) {
    const aliases = { glass: 'glacier', crystal: 'glacier', gold: 'sunset', marble: 'pearl', chrome: 'obsidian', beach: 'classic' };
    this.skinId = SKINS[id] ? id : aliases[id] || 'glacier';
    const skin = SKINS[this.skinId];
    const { accent, color, ...props } = skin;
    Object.assign(this.shell.material, props);
    this.shell.material.color.setHex(color);
    this.shell.material.map = this.skinId === 'classic' ? this.classicMap : null;
    if (this.skinId === 'classic') this.shell.material.color.setHex(0xffffff);
    this.shell.material.attenuationColor.setHex(color);
    this.shell.material.needsUpdate = true;
    this.interior.visible = skin.transmission > .4;
    this.interior.children.slice(0, 2).forEach(o => o.material.color.setHex(accent));
    this.classicBand.visible = false;
  }

  setPlayer(cell, normal, forward, { jump = false, instant = false, duration, fall = false } = {}) {
    this.fromPosition.copy(this.playerPosition);
    this.fromNormal.copy(this.targetNormal);
    this.targetNormal.copy(v3(normal, [0, 1, 0])).normalize();
    const nextCell = v3(cell);
    this.cornerMove = !jump && !instant && this.playerCell.distanceToSquared(nextCell) < .001 && Math.abs(this.fromNormal.dot(this.targetNormal)) < .01;
    this.cornerCell.copy(nextCell);
    this.playerCell.copy(nextCell);
    this.playerForward.copy(v3(forward, [0, 0, -1])).normalize();
    // Follow heading in third person; smooth yaw and gravity as a single frame.
    const right = new THREE.Vector3().crossVectors(this.playerForward, this.targetNormal).normalize();
    const desiredFrame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, this.targetNormal, this.playerForward.clone().negate()));
    if (instant) {
      this.cameraFrameTarget.copy(desiredFrame);
      this.cameraFrame.copy(this.cameraFrameTarget);
      this.cameraTurnProgress = 1;
    } else if (this.cameraFrameTarget.angleTo(desiredFrame) > .001) {
      this.cameraFrameFrom.copy(this.cameraFrame);
      this.cameraFrameTarget.copy(desiredFrame);
      this.cameraTurnProgress = 0;
      this.cameraTurnDuration = Math.max(duration || .24, this.fromNormal.dot(this.targetNormal) < .99 ? .55 : .38);
    }
    this.targetPosition.copy(facePosition(cell, this.targetNormal));
    this.transition = instant ? 1 : 0;
    this.moveDuration = duration || (jump ? .48 : .24);
    this.fall = fall;
    this.jump = jump;
    if (instant) {
      this.playerPosition.copy(this.targetPosition);
      this.playerNormal.copy(this.targetNormal);
      this.ball.position.copy(this.playerPosition);
      this.cameraAnchor.copy(this.playerPosition);
      this.snapCamera = true;
    }
  }

  setMode(mode) {
    if (this.mode !== mode) this.snapCamera = true;
    this.mode = mode;
    this.decorGroup.visible = mode === 'menu';
    this.livingEnvironment.group.visible = mode !== 'menu';
    this._updatePortal();
  }

  setQuality(quality) {
    this.quality = quality;
    this.resolutionCeiling = Math.min(window.devicePixelRatio || 1, quality === 'balanced' ? 1.15 : 1.75);
    this.renderer.setPixelRatio(this.resolutionCeiling);
    this.renderer.transmissionResolutionScale = quality === 'balanced' ? .5 : .75;
    const shadowSize = quality === 'balanced' ? 1024 : 1536;
    if (this.sun.shadow.mapSize.x !== shadowSize) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    }
    this.adaptiveFrames = 0; this.adaptiveTotal = 0; this.adaptiveWarmup = 120;
    this.bloom.enabled = quality !== 'balanced';
    this.livingEnvironment.setQuality(quality);
    this.resize();
  }

  async prepare(onProgress = () => {}) {
    const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
    onProgress(.1, 'Preparing scene');
    await nextFrame();
    onProgress(.3, 'Compiling materials');
    await this.renderer.compileAsync(this.scene, this.camera);
    onProgress(.7, 'Warming lighting and effects');
    await nextFrame();
    this.update(0, this.elapsed);
    await nextFrame();
    this.update(0, this.elapsed);
    this.adaptiveWarmup = 120;
    onProgress(1, 'Ready');
  }

  getPerformanceStats() {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      programs: this.renderer.info.programs?.length || 0,
      pixelRatio: this.renderer.getPixelRatio(),
    };
  }

  sampleFrame(ms) {
    if (!Number.isFinite(ms) || ms <= 0 || ms > 150 || document.hidden) return;
    if ((this.adaptiveWarmup || 0) > 0) { this.adaptiveWarmup--; return; }
    this.adaptiveTotal = (this.adaptiveTotal || 0) + ms;
    this.adaptiveFrames = (this.adaptiveFrames || 0) + 1;
    if (this.adaptiveFrames < 120) return;
    const average = this.adaptiveTotal / this.adaptiveFrames;
    this.adaptiveTotal = 0; this.adaptiveFrames = 0;
    const ceiling = this.resolutionCeiling || Math.min(window.devicePixelRatio || 1, 1.75);
    const current = this.renderer.getPixelRatio();
    const next = clamp(current + (average > 23 ? -.15 : average < 17.5 ? .05 : 0), Math.min(.8, ceiling), ceiling);
    if (Math.abs(next - current) < .01) return;
    this.renderer.setPixelRatio(next);
    this.resize();
    this.adaptiveWarmup = 180;
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.width = width; this.height = height;
    this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false); this.composer?.setSize(width, height);
  }

  update(dt, elapsed) {
    dt = clamp(dt || 0, 0, .07); this.elapsed = elapsed ?? this.elapsed + dt;
    const oldPosition = this.scratch.old.copy(this.playerPosition);
    this.transition = Math.min(1, this.transition + dt / (this.moveDuration || .24));
    const t = smooth(this.transition);
    this.playerPosition.lerpVectors(this.fromPosition, this.targetPosition, t);
    if (this.cornerMove && this.transition < 1) {
      const r = .31, arcLength = Math.PI * r / 2, distance = t * (1 + arcLength);
      if (distance < .5) this.playerPosition.copy(this.fromPosition).addScaledVector(this.targetNormal, distance);
      else if (distance < .5 + arcLength) {
        const angle = (distance - .5) / arcLength * Math.PI / 2;
        this.playerPosition.copy(this.cornerCell).addScaledVector(this.fromNormal, .5 + Math.cos(angle) * r).addScaledVector(this.targetNormal, .5 + Math.sin(angle) * r);
      } else this.playerPosition.copy(this.targetPosition).addScaledVector(this.fromNormal, 1 + arcLength - distance);
    }
    if (this.jump) this.playerPosition.addScaledVector(this.targetNormal, Math.sin(this.transition * Math.PI) * .75);
    if (this.fall) this.playerPosition.addScaledVector(this.targetNormal, -Math.pow(this.transition, 3) * 2.5);
    this.playerNormal.lerp(this.targetNormal, 1 - Math.exp(-dt * 13)).normalize();
    const movement = this.scratch.movement.copy(this.playerPosition).sub(oldPosition);
    if (movement.lengthSq() > .000001) {
      const axis = this.scratch.axis.crossVectors(this.playerNormal, movement).normalize();
      this.ball.quaternion.premultiply(this.scratch.quaternion.setFromAxisAngle(axis, movement.length() / .315));
    }
    this.ball.position.copy(this.playerPosition);
    this.ball.scale.setScalar(this.mode === 'menu' ? 1.5 : 1);
    if (this.mode === 'menu') {
      this.ball.position.addScaledVector(this.targetNormal, Math.sin(this.elapsed * 1.5) * .025 + .17);
      this.ball.rotateY(dt * .17);
    }
    this.contact.position.copy(this.targetPosition).addScaledVector(this.targetNormal, -.303);
    this.contact.quaternion.setFromUnitVectors(FRONT, this.targetNormal);
    this.contact.material.opacity = this.jump && this.transition < 1 ? .10 : .24;
    for (const entry of this.items) {
      const { item, animated, root, index, baseY, collectedAt } = entry;
      if (collectedAt !== null) {
        const life = (this.elapsed - collectedAt) / .28;
        root.visible = life < 1;
        root.scale.setScalar(Math.max(.001, 1 - life * .8));
        animated.position.y = baseY + life * .7;
        continue;
      }
      if (item.type === 'lava') {
        animated.children[0].material.uniforms.uTime.value=this.elapsed;
        for (let i = 1; i < animated.children.length; i++) animated.children[i].scale.y = .55 + (Math.sin(this.elapsed * 7 + (i - 1) * 3) * .5 + .5) * .95;
      } else if (item.type !== 'spike') {
        animated.position.y = baseY + Math.sin(this.elapsed * 2 + index * .7) * .035;
        animated.rotation.y = this.elapsed * (item.type === 'exit' ? .4 : 1.2) + index;
      }
    }
    this.decorGroup.children.forEach((o, i) => { o.rotation.y += dt * .045 * (i % 2 ? 1 : -1); });
    this.dust.rotation.y = this.elapsed * .004;
    this.livingEnvironment.update(dt,this.elapsed);
    const desiredPosition = this.scratch.position; const target = this.scratch.target; const cameraUp = this.scratch.up;
    if (this.mode === 'menu') {
      const distance = Math.max(15.4, this.levelRadius * 4.7) * (this.width < 800 ? Math.max(1.2, .72 / this.camera.aspect) : 1);
      const direction = this.scratch.direction.set(1, 1.12, 1.35).normalize();
      const right = this.scratch.right.crossVectors(direction, UP).negate().normalize();
      target.copy(this.levelCenter).addScaledVector(right, this.width > 800 ? -distance * .18 : 0);
      if (this.width < 800) target.addScaledVector(this.scratch.offset.crossVectors(direction, right).normalize(), distance * .16);
      desiredPosition.copy(target).addScaledVector(direction, distance);
      cameraUp.copy(UP);
    } else {
      this.cameraTurnProgress = Math.min(1, this.cameraTurnProgress + dt / (this.cameraTurnDuration || .55));
      this.cameraFrame.slerpQuaternions(this.cameraFrameFrom, this.cameraFrameTarget, smooth(this.cameraTurnProgress));
      this.cameraAnchor.lerp(this.playerPosition, this.snapCamera ? 1 : 1 - Math.exp(-dt * 5));
      target.copy(this.cameraAnchor);
      desiredPosition.copy(target).add(this.scratch.offset.set(.8, 4.8, 6.5).applyQuaternion(this.cameraFrame));
      cameraUp.copy(UP).applyQuaternion(this.cameraFrame);
    }
    const blend = this.snapCamera ? 1 : 1 - Math.exp(-dt * (this.mode === 'menu' ? 2.5 : 5));
    if (this.mode === 'menu') this.camera.position.lerp(desiredPosition, blend);
    else this.camera.position.copy(desiredPosition);
    const m = this.scratch.matrix.lookAt(this.camera.position, target, cameraUp);
    const desiredQuaternion = this.scratch.quaternion.setFromRotationMatrix(m);
    if (this.mode === 'menu') this.camera.quaternion.slerp(desiredQuaternion, blend);
    else this.camera.quaternion.copy(desiredQuaternion);
    this.snapCamera = false;
    this.renderer.info.reset();
    this.composer.render();
  }

  dispose() {
    this.livingEnvironment.dispose();
    this._clearGroup(this.levelGroup); this._clearGroup(this.itemGroup); this._clearGroup(this.decorGroup);
    this.scene.traverse(o => { o.geometry?.dispose(); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); });
    this.sharedGeometry.forEach(geometry => geometry.dispose());
    this.sharedMaterial.forEach(mat => mat.dispose());
    this.itemTemplates.clear();
    this.stoneMap.dispose(); this.glowMap.dispose(); this.classicMap.dispose(); this.environment.dispose();
    this.composer.dispose(); this.renderer.dispose();
  }
}
