// ORBIT's original campaign. Every collectible is attached to a cube face.
const AXES = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const add = (a,b) => a.map((v,i)=>v+b[i]);
const id = a => a.join(',');
const faceId = (c,n) => `${id(c)}|${id(n)}`;
const dot = (a,b) => a.reduce((s,v,i)=>s+v*b[i],0);

const WORLDS = ['AURELIA','TIDAL','OBSIDIAN','ZENITH'];
const NAMES = [
  'First contact','Around the bend','The other side','Ribbon dance','Stepping stones','Golden hour',
  'Blue current','Undertow','Coral staircase','Tidal loop','Deep passage','Pearl horizon',
  'Night shift','Ember bridge','Fault line','The crucible','Dark matter','Event horizon',
  'Skyward','Cloud atlas','Helix','The observatory','Infinity garden','Home among stars'
];
const SUBTITLES = [
  'Collect the key. Find your way home.', 'A missing block. Press Space to leap across.', 'Glowing tiles burn. Jump over them with Space.',
  'Jump over danger. Follow the gold around every fold.', 'Press Space to jump between islands.', 'One last turn in the golden light.',
  'Let the blue horizon guide you.', 'Some treasures hide underneath.', 'Climb without ever leaving the surface.',
  'A loop is a matter of perspective.', 'Jump between islands. Every second counts.', 'Bring every key to the portal.',
  'Follow the embers through the dark.', 'A narrow path. An open universe.', 'Find your balance on fractured ground.',
  'Keep rolling. Stay focused.', 'Two gaps to cross. Take your time.', 'There is always another side.',
  'The final ascent begins here.', 'Read the islands in the sky.', 'Turn the universe around you.',
  'Look beyond the obvious path.', 'Cross the void. Every island holds a secret.', 'One last journey. Every world within you.'
];

function makeShape(index) {
  const cells = new Map();
  const put = (x,y,z) => cells.set(`${x},${y},${z}`,[x,y,z]);
  const line = (a,b) => {
    let c = [...a]; put(...c);
    for(let k=0;k<3;k++) while(c[k]!==b[k]) { c[k]+=Math.sign(b[k]-c[k]); put(...c); }
  };
  const tier=Math.floor(index/6), variant=index%6, length=5+tier;
  if(variant===0) {
    line([0,0,0],[0,0,-length]);
    if(tier) { line([0,0,-length],[tier+2,0,-length]); line([tier+2,0,-length],[tier+2,tier,-length]); }
  } else if(variant===1) {
    line([0,0,0],[0,0,-length]); line([0,0,-length],[4+tier,0,-length]);
    line([4+tier,0,-length],[4+tier,0,-2]);
    // Introduce an unavoidable island crossing in the second level.
    cells.delete('0,0,-3');
  } else if(variant===2) {
    const height=z=>Math.floor(Math.max(0,z-1)/2);
    // Three flat opening blocks provide a clear jump over the first hot tile.
    for(let z=0;z<length;z++) for(let x=0;x<2;x++) put(x,height(z),-z);
    // Connect each stair's vertical riser, keeping the entire solid connected.
    for(let z=1;z<length;z++) if(height(z)>height(z-1)) for(let x=0;x<2;x++) put(x,height(z)-1,-z);
  } else if(variant===3) {
    line([0,0,0],[0,0,-length]); line([0,0,-length],[4+tier,0,-length]);
    line([4+tier,0,-length],[4+tier,0,0]); line([4+tier,0,0],[1,0,0]);
    if(tier>0) line([2,0,-length],[2,tier+1,-length]);
  } else if(variant===4) {
    line([0,0,0],[0,0,-length-2]);
    for(let z=2;z<length+2;z+=2) {line([0,0,-z],[3,0,-z]); if(tier>0)line([3,0,-z],[3,tier,-z]);}
    // These missing cubes split the solid into islands. Space bridges each gap.
    cells.delete('0,0,-3');
    if(tier>=2)cells.delete('0,0,-5');
  } else {
    line([0,0,0],[0,0,-length]); line([0,0,-length],[3+tier,0,-length]);
    line([3+tier,0,-length],[3+tier,2,-length]); line([3+tier,2,-length],[3+tier,2,-1]);
    line([3+tier,2,-1],[1,2,-1]);
    if(tier>1)line([1,2,-1],[1,4,-1]);
  }
  return [...cells.values()];
}

function buildLevel(index) {
  const cubes=makeShape(index), occupied=new Set(cubes.map(id));
  const start={cell:[0,0,0],normal:[0,1,0],forward:[0,0,-1]};
  // Traverse the exterior surface, including concave and convex corners.
  const queue=[{cell:start.cell,normal:start.normal,distance:0}], visited=new Set([faceId(start.cell,start.normal)]);
  for(let q=0;q<queue.length;q++) {
    const f=queue[q];
    for(const d of AXES.filter(d=>dot(d,f.normal)===0)) {
      const outer=add(add(f.cell,f.normal),d), across=add(f.cell,d);
      let cell,normal;
      if(occupied.has(id(outer))) {cell=outer; normal=d.map(v=>-v);}
      else if(occupied.has(id(across))) {cell=across;normal=f.normal;}
      else {cell=f.cell;normal=d;}
      const key=faceId(cell,normal);
      if(!visited.has(key)) {visited.add(key);queue.push({cell,normal,distance:f.distance+1});}
      const landing=add(across,d),landingKey=faceId(landing,f.normal);
      if(!occupied.has(id(outer))&&occupied.has(id(landing))&&!occupied.has(id(add(landing,f.normal)))&&!visited.has(landingKey)) {
        visited.add(landingKey);queue.push({cell:landing,normal:f.normal,distance:f.distance+1});
      }
    }
  }
  const items=[], used=new Set([faceId(start.cell,start.normal)]);
  const place=(type,face)=> {
    if(!face||used.has(faceId(face.cell,face.normal)))return false;
    used.add(faceId(face.cell,face.normal));items.push({type,cell:[...face.cell],normal:[...face.normal]});return true;
  };
  const top=queue.filter(f=>f.normal[1]===1&&f.distance>0).sort((a,b)=>a.distance-b.distance);
  const far=queue.filter(f=>f.distance>2).sort((a,b)=>b.distance-a.distance);
  place('exit',top[top.length-1]);
  if(index===0)place('key',top[Math.max(0,top.length-2)]);
  else place('key',far.find(f=>f.normal[1]===-1));
  if(index>=6)place('key',far.find(f=>!used.has(faceId(f.cell,f.normal))&&f.normal[0]!==0));
  if(index>=18)place('key',top[Math.floor(top.length/2)]);
  // Visible hazards occupy the main top route before coins are distributed.
  // The first burn is always one block ahead, with a safe two-block landing.
  if(index>=2)place('lava',top.find(f=>id(f.cell)==='0,0,-1'));
  const hazardFaces=new Set(items.filter(i=>i.type==='lava').map(i=>faceId(i.cell,i.normal)));
  const safeLanding=(cell,normal)=>occupied.has(id(cell))&&!occupied.has(id(add(cell,normal)))&&!hazardFaces.has(faceId(cell,normal));
  const topCandidates=top.filter(f=>f.distance>2&&!used.has(faceId(f.cell,f.normal)));
  let added=0;
  for(const f of topCandidates) {
    if(index<3||added>=1+Math.floor(index/6))break;
    // Keep hazards isolated and jumpable on either axis, never covering an island's only landing.
    if(![[1,0,0],[0,0,1]].some(d=>safeLanding(add(f.cell,d),f.normal)&&safeLanding(add(f.cell,d.map(v=>-v)),f.normal)))continue;
    if(AXES.some(d=>hazardFaces.has(faceId(add(f.cell,d),f.normal))))continue;
    const type=added%2===0?'spike':'lava';
    if(place(type,f)){hazardFaces.add(faceId(f.cell,f.normal));added++;}
  }
  for(const f of top) if(f.distance%2===1||index===0)place('coin',f);
  const sides=queue.filter(f=>f.normal[1]!==1&&f.distance>1);
  for(let j=0;j<sides.length;j+=Math.max(4,9-Math.floor(index/6)))place('coin',sides[j]);
  place('fruit',far.find(f=>!used.has(faceId(f.cell,f.normal))&&f.normal[1]===-1));
  if(index>=3)place('time',queue.find(f=>f.distance>=Math.floor(far[0].distance/2)&&!used.has(faceId(f.cell,f.normal))&&f.normal[1]===1));
  // Later levels also ask the player to read hazards around the side faces.
  if(index>=4) {
    const candidates=queue.filter(f=>f.distance>2&&f.normal[0]===1&&!used.has(faceId(f.cell,f.normal)));
    for(let j=0;j<Math.min(1+Math.floor(index/4),candidates.length);j++)place('spike',candidates[j*3%candidates.length]);
  }
  return {id:index+1,name:NAMES[index],world:WORLDS[Math.floor(index/6)],worldIndex:Math.floor(index/6),subtitle:SUBTITLES[index],time:150+Math.floor(index/6)*35+(index%6)*12,cubes,start,items};
}

export const LEVELS = Array.from({length:24},(_,i)=>buildLevel(i));
export const WORLD_NAMES = WORLDS;
