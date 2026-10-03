import { LEVELS } from './levels.js';

const add=(a,b)=>a.map((v,i)=>v+b[i]);
const neg=a=>a.map(v=>-v);
const eq=(a,b)=>a.every((v,i)=>v===b[i]);
const key=a=>a.join(',');
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

/**
 * Renderer-independent surface puzzle simulation. update(dt) takes seconds.
 * Events: start, move, turn, collect, damage, won, lost, pause, blocked.
 * move: {from:{cell,normal,forward},to:{cell,normal,forward},jump,duration}.
 * collect: {item,index,coins,score}. won: {levelIndex,coins,score,timeBonus}.
 * onChange receives getSnapshot(). Coins and score are per level attempt;
 * the application should persist awarded currency when a level is won.
 */
export class Game {
  constructor({onChange=()=>{},onEvent=()=>{}}={}) {
    this.onChange=onChange;this.onEvent=onEvent;
    this.state='menu';this.levelIndex=0;this.cell=[0,0,0];this.normal=[0,1,0];this.forward=[0,0,-1];
    this.time=0;this.lives=3;this.coins=0;this.keys=0;this.totalKeys=0;this.score=0;this.collected=new Set();this.cooldown=0;
  }
  pose(){return {cell:[...this.cell],normal:[...this.normal],forward:[...this.forward]};}
  emit(type,detail={}){this.onEvent({type,...detail});}
  changed(){this.onChange(this.getSnapshot());}
  start(index=0){
    this.levelIndex=Math.max(0,Math.min(LEVELS.length-1,index));this.level=LEVELS[this.levelIndex];
    this.occupied=new Set(this.level.cubes.map(key));
    this.cell=[...this.level.start.cell];this.normal=[...this.level.start.normal];this.forward=[...this.level.start.forward];
    this.state='playing';this.time=this.level.time;this.lives=3;this.coins=0;this.keys=0;this.score=0;
    this.totalKeys=this.level.items.filter(i=>i.type==='key').length;this.collected=new Set();this.cooldown=0;this.lastSecond=Math.ceil(this.time);
    this.emit('start',{levelIndex:this.levelIndex});this.changed();
  }
  retry(){this.start(this.levelIndex);}
  pause(value=true){if(value&&this.state==='playing'){this.state='paused';this.emit('pause',{paused:true});this.changed();}else if(!value&&this.state==='paused'){this.state='playing';this.emit('pause',{paused:false});this.changed();}}
  move(direction){
    if(this.state!=='playing'||this.cooldown>0)return false;
    if(direction==='left'||direction==='right') {
      const from=this.pose();this.forward=direction==='left'?cross(this.normal,this.forward):cross(this.forward,this.normal);
      this.cooldown=.12;this.emit('turn',{from,to:this.pose(),duration:.12});this.changed();return true;
    }
    if(direction!=='forward'&&direction!=='back')return false;
    const backwards=direction==='back',d=backwards?neg(this.forward):this.forward,from=this.pose();
    const outer=add(add(this.cell,this.normal),d),across=add(this.cell,d);
    let transported=d;
    if(this.occupied.has(key(outer))) {transported=[...this.normal];this.cell=outer;this.normal=neg(d);}
    else if(this.occupied.has(key(across)))this.cell=across;
    else {transported=neg(this.normal);this.normal=[...d];}
    this.forward=backwards?neg(transported):[...transported];
    this.cooldown=eq(from.normal,this.normal)?.24:.55;
    this.emit('move',{from,to:this.pose(),jump:false,duration:this.cooldown});this.touch();this.changed();return true;
  }
  jump(){
    if(this.state!=='playing'||this.cooldown>0)return false;
    const from=this.pose(),landing=add(add(this.cell,this.forward),this.forward),above=add(landing,this.normal);
    if(this.occupied.has(key(add(add(this.cell,this.normal),this.forward)))) {this.emit('blocked',{reason:'wall'});return false;}
    if(!this.occupied.has(key(landing))||this.occupied.has(key(above))){
      this.cooldown=.55;this.emit('move',{from,to:{cell:landing,normal:[...this.normal],forward:[...this.forward]},jump:true,fall:true,duration:.5});
      this.damage('fall');return true;
    }
    this.cell=landing;this.cooldown=.48;this.emit('move',{from,to:this.pose(),jump:true,duration:.48});this.touch();this.changed();return true;
  }
  touch(){
    for(let index=0;index<this.level.items.length;index++){
      const item=this.level.items[index];if(this.collected.has(index)||!eq(item.cell,this.cell)||!eq(item.normal,this.normal))continue;
      if(item.type==='spike'||item.type==='lava'){this.damage(item.type==='lava'?'burn':'spike');return;}
      if(item.type==='exit'){
        if(this.keys<this.totalKeys){this.emit('blocked',{reason:'keys',remaining:this.totalKeys-this.keys});continue;}
        const timeBonus=Math.floor(this.time)*5;this.score+=timeBonus;this.state='won';
        this.emit('won',{levelIndex:this.levelIndex,coins:this.coins,score:this.score,timeBonus});return;
      }
      this.collected.add(index);
      if(item.type==='coin'){this.coins++;this.score+=100;}
      if(item.type==='key'){this.keys++;this.score+=250;}
      if(item.type==='fruit'){this.coins+=5;this.score+=500;}
      if(item.type==='time'){this.time+=30;this.score+=50;}
      this.emit('collect',{item,index,coins:this.coins,score:this.score});
    }
  }
  damage(reason){
    this.lives--;this.emit('damage',{reason,lives:this.lives});
    if(this.lives<=0){this.state='lost';this.emit('lost',{reason});}
    else {
      this.cell=[...this.level.start.cell];this.normal=[...this.level.start.normal];this.forward=[...this.level.start.forward];
      if(reason==='timeout')this.time=Math.max(45,Math.floor(this.level.time*.5));
      this.cooldown=.65;this.emit('respawn',{to:this.pose(),duration:.65});
    }
    this.changed();
  }
  update(dt){
    if(this.state!=='playing')return;
    dt=Math.max(0,Math.min(dt,.25));this.cooldown=Math.max(0,this.cooldown-dt);this.time=Math.max(0,this.time-dt);
    if(this.time<=0){this.damage('timeout');return;}
    const second=Math.ceil(this.time);if(second!==this.lastSecond){this.lastSecond=second;this.changed();}
  }
  getSnapshot(){return {state:this.state,levelIndex:this.levelIndex,cell:[...this.cell],normal:[...this.normal],forward:[...this.forward],time:this.time,lives:this.lives,coins:this.coins,keys:this.keys,totalKeys:this.totalKeys,score:this.score,collected:[...this.collected],cooldown:this.cooldown};}
}
