import * as THREE from 'three';
import {GLTFLoader} from './vendor/addons/loaders/GLTFLoader.js';
import {HDRLoader} from './vendor/addons/loaders/HDRLoader.js';
import {EffectComposer} from './vendor/addons/postprocessing/EffectComposer.js';
import {RenderPass} from './vendor/addons/postprocessing/RenderPass.js';
import {SSAOPass} from './vendor/addons/postprocessing/SSAOPass.js';
import {OutputPass} from './vendor/addons/postprocessing/OutputPass.js';
import {stepPosition,heightAt,blocked} from './navigation.js';

const $=id=>document.getElementById(id),canvas=$('scene');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch(error){$('loadText').textContent='浏览器未能启动三维画面，请用最新版 Chrome、Edge 或 Safari 打开。';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color('#f6e3c3');scene.fog=new THREE.Fog('#f6e3c3',38,85);
const camera=new THREE.PerspectiveCamera(65,innerWidth/innerHeight,.045,100);
const composer=new EffectComposer(renderer);
composer.renderTarget1.samples=4;composer.renderTarget2.samples=4;
composer.addPass(new RenderPass(scene,camera));
const ao=new SSAOPass(scene,camera,innerWidth,innerHeight,16);ao.kernelRadius=.38;ao.minDistance=.001;ao.maxDistance=.12;composer.addPass(ao);composer.addPass(new OutputPass());
// Paper and leaves are double-sided in the beauty pass. Their back faces must
// also write the AO depth, otherwise furniture behind them ghosts onto the paper.
ao.normalMaterial.side=THREE.DoubleSide;
const hemi=new THREE.HemisphereLight('#eaf4ff','#b2aa85',.50);scene.add(hemi);
scene.add(new THREE.AmbientLight('#fff6e3',.10));
const sun=new THREE.DirectionalLight('#fff0d4',1.65);sun.position.set(-9,18,8);sun.castShadow=true;
sun.shadow.mapSize.set(4096,4096);sun.shadow.camera.left=-15;sun.shadow.camera.right=15;sun.shadow.camera.top=15;sun.shadow.camera.bottom=-15;sun.shadow.camera.near=.5;sun.shadow.camera.far=50;sun.shadow.bias=-.00020;sun.shadow.normalBias=.018;sun.shadow.radius=3;scene.add(sun);
// Broad, shadow-free fill keeps detailed indoor props legible under the deep roofs.
for(const [x,y] of [[-6,6],[0,6],[6,6],[-6,-1]]){const l=new THREE.PointLight('#fff3dc',5.5,7,2);l.position.set(x,2.75,-y);scene.add(l);}
const front=new THREE.DirectionalLight('#edf6ff',.22);front.position.set(0,8,15);scene.add(front);
const clock=new THREE.Clock(),keys=new Set();
let meta,model,loaded=false,mode='walk',yaw=0,pitch=0,dragging=false,moved=false,quality=true,nearest=null,held=null,seated=false,seatReturn=null;
let frameCount=0,fps=0,measureTime=0,lastStep=0,transition=null,roofsVisible=true,activeView='garden';
const dynamic=[],pickups=new Map(),objects=new Map(),initialTransforms=new Map(),roofs=[];
const waterTime={value:0},waterMeshes=[],waterMaterials=[];
function pondMaterial(normalMap){
 const material=new THREE.MeshPhysicalMaterial({color:'#457c70',roughness:.16,metalness:.10,ior:1.333,normalMap,normalScale:new THREE.Vector2(1.0,1.0),transparent:true,opacity:.52,side:THREE.DoubleSide,depthWrite:false,envMapIntensity:1.05});
 material.onBeforeCompile=shader=>{
  shader.uniforms.waterTime=waterTime;
  shader.fragmentShader='uniform float waterTime;\n'+shader.fragmentShader;
  const sample='mix(texture2D(normalMap, vNormalMapUv * .55 + vec2(waterTime * .008, waterTime * .006)), texture2D(normalMap, vNormalMapUv * .83 + vec2(-waterTime * .007, waterTime * .009)), .48)';
  const normals=THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv )',sample).replace('mapN.xy *= normalScale;',`float a = dot(vNormalMapUv, vec2(18.0, 11.0)) - waterTime * .55;
   float b = dot(vNormalMapUv, vec2(27.0, -17.0)) + waterTime * .37;
   mapN.xy = mapN.xy * .35 + vec2(.12 * cos(a) + .055 * cos(b), .075 * cos(a) - .045 * cos(b));
   mapN.xy *= normalScale;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',normals).replace('#include <opaque_fragment>','diffuseColor.a = mix(.43, .88, pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.6));\n#include <opaque_fragment>');
 };
 material.customProgramCacheKey=()=> 'pond-flow-v2';waterMaterials.push(material);return material;
}
function addCaustics(material){
 const m=material.clone();
 m.onBeforeCompile=shader=>{
  shader.uniforms.waterTime=waterTime;shader.fragmentShader='uniform float waterTime;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   vec2 q = vMapUv * 12.0;
   float waveA = sin(q.x * 2.1 + q.y * 1.8 + waterTime * .24 + sin(q.y * 2.2 - waterTime * .18));
   float waveB = sin(q.y * 2.3 - q.x * 1.2 - waterTime * .21 + sin(q.x * 1.7 + waterTime * .13));
   float caustic = pow(abs(waveA * waveB), 9.0);
   diffuseColor.rgb += vec3(.16, .19, .11) * caustic;
  `);
 };
 m.customProgramCacheKey=()=> 'pond-bed-caustics-v2';return m;
}
const notes={garden:['庭院','沿着小桥，走进那些值得留下的时光。'],childhood:['童年与小学','窗边的练习册，地毯上的玩偶。'],tea:['客厅茶区','把老同学的故事，留在一杯茶的时间里。'],university:['大学记忆房','留一方空白，安放下一段经历。'],future:['未来的房间','不急着填满，为后来留下位置。'],overview:['俯瞰全院','三间房、公共客厅，与一座可以绕行的庭院。']};
notes.desk=['窗边书桌','翻开一本练习册，看看当年的自己。'];
const bvec=p=>new THREE.Vector3(p[0],p[2],-p[1]);
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').classList.remove('show'),3600);}
function updateLook(){camera.rotation.set(pitch,yaw,0,'YXZ');}
function syncLook(){const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=e.y;pitch=e.x;}
function selectNote(id){const [title,txt]=notes[id];$('placeTitle').textContent=title;$('placeText').textContent=txt;document.querySelectorAll('#views button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.view===id)));activeView=id;}
function setRoofs(visible){roofsVisible=visible;roofs.forEach(o=>o.visible=visible);$('roof').textContent=visible?'隐藏屋顶':'显示屋顶';}
function restoreHeld(){if(!held)return;const original=initialTransforms.get(held.name);scene.attach(held);held.position.copy(original.position);held.quaternion.copy(original.quaternion);held.scale.copy(original.scale);held=null;}
function goTo(id,instant=false){if(!loaded)return;restoreHeld();seated=false;const v=meta.viewpoints.find(v=>v.id===id);if(!v)return;document.exitPointerLock?.();mode=id==='overview'?'overview':'walk';$('walk').textContent=mode==='overview'?'回到院门 ↗':'进入漫游 ↗';$('roof').hidden=mode!=='overview';setRoofs(mode!=='overview');selectNote(id);const dest=bvec(v.pos),target=bvec(v.target);const dummy=new THREE.PerspectiveCamera();dummy.position.copy(dest);dummy.lookAt(target);if(instant){camera.position.copy(dest);camera.quaternion.copy(dummy.quaternion);syncLook();}else transition={t:0,start:camera.position.clone(),end:dest,qa:camera.quaternion.clone(),qb:dummy.quaternion.clone()};playTone('tap');}

let audioCtx,audioEnabled=false,waterGain,waterPanner;
function createAudio(){if(audioCtx){audioCtx.resume();return;}audioCtx=new (window.AudioContext||window.webkitAudioContext)();const buffer=audioCtx.createBuffer(1,audioCtx.sampleRate*3,audioCtx.sampleRate);const data=buffer.getChannelData(0);let old=0;for(let i=0;i<data.length;i++){old=(old+Math.random()*.10-.05)/1.018;data[i]=old*.9;}const source=audioCtx.createBufferSource();source.buffer=buffer;source.loop=true;const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1700;waterGain=audioCtx.createGain();waterGain.gain.value=0;waterPanner=audioCtx.createPanner();waterPanner.panningModel='HRTF';waterPanner.distanceModel='inverse';waterPanner.refDistance=2;waterPanner.maxDistance=25;waterPanner.rolloffFactor=.7;waterPanner.positionX.value=7.6;waterPanner.positionY.value=.6;waterPanner.positionZ.value=-.1;source.connect(filter).connect(waterGain).connect(waterPanner).connect(audioCtx.destination);source.start();}
function soundOn(value){createAudio();audioEnabled=value;waterGain.gain.setTargetAtTime(value?.10:0,audioCtx.currentTime,.2);$('sound').textContent=value?'声音已开启':'开启声音';$('sound').setAttribute('aria-pressed',String(value));if(value)playTone('bell');}
function playTone(kind='tap'){if(!audioEnabled||!audioCtx)return;const t=audioCtx.currentTime;const notes=kind==='bell'?[880,1320,1760]:kind==='paper'?[270,390]:kind==='step'?[95]:[420];notes.forEach((hz,i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=kind==='step'?'triangle':'sine';o.frequency.setValueAtTime(hz,t);if(kind==='step')o.frequency.exponentialRampToValueAtTime(45,t+.12);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(kind==='step'?.045:.045/(i+1),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+(kind==='bell'?1.5:.20));o.connect(g).connect(audioCtx.destination);o.start(t+i*.025);o.stop(t+1.6);});}
function updateListener(){if(!audioCtx||!audioEnabled)return;const l=audioCtx.listener,p=camera.position,f=camera.getWorldDirection(new THREE.Vector3());if(l.positionX){l.positionX.value=p.x;l.positionY.value=p.y;l.positionZ.value=p.z;l.forwardX.value=f.x;l.forwardY.value=f.y;l.forwardZ.value=f.z;l.upX.value=0;l.upY.value=1;l.upZ.value=0;}}

function details(title,text,image){document.exitPointerLock?.();$('detailTitle').textContent=title;$('detailText').textContent=text;$('detailImage').hidden=!image;if(image){$('detailImage').src='./assets/'+image;$('detailImage').alt=title;}$('memoryDialog').showModal();keys.clear();}
function interact(){if(held){restoreHeld();playTone('tap');toast('木积木已放回原处。');return;}if(seated){camera.position.copy(seatReturn);seated=false;toast('已起身。');playTone();return;}if(!nearest)return;createAudio();if(!audioEnabled)soundOn(true);const h=nearest,o=objects.get(h.node);playTone(h.type==='book'?'paper':h.type==='window'?'bell':'tap');
 if(h.type==='window'&&o){o.userData.motion={property:'rotationY',start:o.rotation.y,end:Math.abs(o.rotation.y)>.2?0:.85,t:0};toast(Math.abs(o.rotation.y)>.2?'纸窗正在合上。':'纸窗正在打开。');}
 else if(h.type==='slide'&&o){const original=initialTransforms.get(o.name);const end=Math.abs(o.position.z-original.position.z)<.2?original.position.z+.95:original.position.z;o.userData.motion={property:'positionZ',start:o.position.z,end,t:0};toast('移门轻轻滑动。');}
 else if(h.type==='pickup'&&o){held=o;camera.attach(o);o.position.set(.34,-.33,-.65);o.rotation.set(.15,.3,.1);toast('已拿起木积木，按 E 放回原处。');}
 else if(h.type==='tea'){seatReturn=camera.position.clone();camera.position.set(-7.35,1.18,.85);camera.lookAt(-6,.82,.6);syncLook();seated=true;toast('坐下来歇一会儿。按 E 起身。');}
 else if(h.type==='book')details('窗边的数学练习册','这是小学记忆的物件入口。现在可以检查书本和书桌的呈现，个人照片与故事将在后续加入。','math-open.png');
 else if(h.type==='toy')details('童年的玩具角','玩偶、木头小火车和积木，先为童年留出一个熟悉的角落。绿色木积木可以拿起、放回。');
 else if(h.type==='university')details('大学记忆，留待慢慢填入','这里预留了书桌、相框和书架，暂时保持留白。');
 else if(h.type==='future')details('给未来留一间房','这个房间还没有指定主题，可以在之后的生活里慢慢丰富。');
}
function nearestHotspot(){if(mode==='overview'||transition||!loaded)return null;let best=null,score=Infinity;const forward=camera.getWorldDirection(new THREE.Vector3());for(const h of meta.hotspots){const p=bvec([h.x,h.y,h.z]),delta=p.sub(camera.position),length=delta.length();const horizontal=Math.hypot(delta.x,delta.z),aim=forward.dot(delta.normalize()),s=length*(1.6-aim);if(horizontal<h.radius&&aim>.30&&s<score){best=h;score=s;}}return best;}
function beginWalk(){if(mode==='overview'){goTo('garden');return;}soundOn(true);canvas.focus();try{const p=canvas.requestPointerLock();p?.catch(()=>toast('可以按住画面拖动环顾，并使用 W A S D 行走。'));}catch{toast('可以按住画面拖动环顾，并使用 W A S D 行走。');}}
$('walk').onclick=beginWalk;$('sound').onclick=()=>soundOn(!audioEnabled);$('interact').onclick=interact;
$('help').onclick=()=>{document.exitPointerLock?.();keys.clear();$('helpDialog').showModal();};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',()=>canvas.focus()));
$('quality').onclick=()=>{quality=!quality;renderer.setPixelRatio(quality?Math.min(devicePixelRatio,1.65):1);renderer.shadowMap.enabled=quality;scene.traverse(o=>{if(o.isMesh){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.needsUpdate=true);}});$('quality').textContent='画质：'+(quality?'精细':'流畅');$('quality').setAttribute('aria-pressed',String(quality));};
$('roof').onclick=()=>setRoofs(!roofsVisible);
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;document.body.classList.toggle('locked',locked);$('walk').textContent=locked?'正在漫游 · Esc 退出':'进入漫游 ↗';});
canvas.addEventListener('pointerdown',e=>{if(document.pointerLockElement!==canvas){dragging=true;moved=false;canvas.setPointerCapture(e.pointerId);}canvas.focus();});
canvas.addEventListener('pointerup',()=>dragging=false);
canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('pointermove',e=>{if(document.pointerLockElement===canvas||dragging){if(transition)transition=null;yaw-=e.movementX*.0024;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0024,-1.35,1.35);updateLook();moved=true;}});
window.addEventListener('keydown',e=>{if($('helpDialog').open||$('memoryDialog').open)return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){keys.add(e.code);e.preventDefault();}if(e.code==='KeyE'&&!e.repeat){interact();e.preventDefault();}if(e.code==='F3'){e.preventDefault();$('debug').hidden=!$('debug').hidden;}});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();dragging=false;});
document.addEventListener('visibilitychange',()=>{keys.clear();clock.getDelta();});
document.querySelectorAll('[data-move]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(b.dataset.move);b.setPointerCapture(e.pointerId);});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>keys.delete(b.dataset.move));});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();toast('三维画面暂时中断，请刷新页面重新进入。');});

async function init(){
 const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
 const [environment,waterNormal]=await Promise.all([new HDRLoader().loadAsync('./assets/environment.hdr'),new THREE.TextureLoader().loadAsync('./assets/textures/water-normal.jpg')]);
 environment.mapping=THREE.EquirectangularReflectionMapping;scene.environment=pmrem.fromEquirectangular(environment).texture;scene.environmentIntensity=.45;environment.dispose();
 waterNormal.wrapS=waterNormal.wrapT=THREE.RepeatWrapping;waterNormal.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
 meta=await fetch('./assets/scene.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('场景描述读取失败');return r.json();});
 if(meta.palette){scene.background.set(meta.palette.background);scene.fog.color.set(meta.palette.background);}
 const gltf=await new GLTFLoader().loadAsync('./assets/memory-courtyard.glb?v='+encodeURIComponent(meta.version),e=>{const n=e.total?Math.min(95,Math.round(e.loaded/e.total*95)):45;$('progress').style.width=n+'%';$('loadText').textContent='正在载入房屋、庭院与物件 · '+n+'%';});model=gltf.scene;scene.add(model);scene.add(camera);
 model.traverse(o=>{objects.set(o.name,o);if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{for(const t of [m.map,m.normalMap,m.roughnessMap])if(t)t.anisotropy=Math.min(12,renderer.capabilities.getMaxAnisotropy());if(m.name.startsWith('Leaf')){m.side=THREE.DoubleSide;m.color.setRGB(.91+(Number(m.name.slice(-1))||0)*.025,.98,.86);}if(m.name==='Paper'){m.side=THREE.DoubleSide;m.transparent=true;m.opacity=.96;m.depthWrite=false;o.castShadow=false;}if(m.name==='Lamp glow'){m.emissiveIntensity=.65;}});if(o.name==='Pond_bed'||o.name==='Pond bed')o.material=addCaustics(o.material);if(o.name.includes('Pond_water')||o.name==='Pond water'||o.userData.water){o.material=pondMaterial(waterNormal);o.castShadow=false;o.renderOrder=1;waterMeshes.push(o);}}
 if(o.name.startsWith('03_Roofs')||o.name.startsWith('03 Roofs'))roofs.push(o);
 if(meta.dynamic_nodes.includes(o.name)){dynamic.push(o);initialTransforms.set(o.name,{position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()});}
 });
 // Roof visibility is derived from collection-prefixed mesh names; keep perimeter walls visible.
 roofs.length=0;model.traverse(o=>{if(o.userData.roof)roofs.push(o);});
 // Capture the fixed courtyard once; drifting surface normals move its reflections.
 waterMeshes.forEach(o=>o.visible=false);
 const reflectionTarget=new THREE.WebGLCubeRenderTarget(256,{type:THREE.HalfFloatType});
 const reflectionCamera=new THREE.CubeCamera(.06,45,reflectionTarget);reflectionCamera.position.set(4.4,.09,3.35);reflectionCamera.update(renderer,scene);
 const reflection=pmrem.fromCubemap(reflectionTarget.texture).texture;waterMaterials.forEach(m=>m.envMap=reflection);waterMeshes.forEach(o=>o.visible=true);reflectionTarget.dispose();pmrem.dispose();
 for(const v of meta.viewpoints){const b=document.createElement('button');b.textContent=v.label;b.dataset.view=v.id;b.onclick=()=>goTo(v.id);$('views').append(b);}
 loaded=true;goTo('garden',true);$('progress').style.width='100%';$('loadText').textContent='已就绪';await renderer.compileAsync(scene,camera);$('loading').classList.add('done');$('loading').setAttribute('aria-hidden','true');document.body.dataset.sceneReady='true';
 // Small expanding ripples at the stream outlet, decorative only.
 for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.RingGeometry(.12,.135,40),new THREE.MeshBasicMaterial({color:'#d3e2ca',transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(7.6,.04,.5);ring.userData.phase=i/3;scene.add(ring);dynamic.push(ring);}
}
init().catch(err=>{console.error(err);$('loadText').textContent='场景未能载入：'+err.message+'。请使用本地启动器打开，不要直接双击 HTML。';$('loading').classList.remove('done');});
let elapsed=0,lastBell=0;
function animate(){requestAnimationFrame(animate);const actualDt=clock.getDelta(),dt=Math.min(actualDt,.05);elapsed+=dt;waterTime.value=elapsed;if(loaded){
 if(transition){transition.t+=dt/1.0;const t=Math.min(1,transition.t),s=t*t*(3-2*t);camera.position.lerpVectors(transition.start,transition.end,s);camera.quaternion.slerpQuaternions(transition.qa,transition.qb,s);if(t>=1){transition=null;syncLook();}}
 else if(mode==='walk'&&!seated&&!$('helpDialog').open&&!$('memoryDialog').open){let f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),r=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);if(f||r){const norm=Math.hypot(f,r);f/=norm;r/=norm;const speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?3.1:1.8;const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*r)*dt*speed,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*r)*dt*speed;const p=stepPosition(camera.position.x,-camera.position.z,dx,-dz,meta);const moved=Math.hypot(p.x-camera.position.x,p.y+camera.position.z);camera.position.x=p.x;camera.position.z=-p.y;if(moved>.002&&elapsed-lastStep>.44){playTone('step');lastStep=elapsed;}}
 camera.position.y=THREE.MathUtils.lerp(camera.position.y,heightAt(camera.position.x,-camera.position.z,meta)+1.62,Math.min(1,dt*12));
 }
 for(const o of dynamic){if(o.name.startsWith('Goldfish')){const t=initialTransforms.get(o.name);o.position.x=t.position.x+Math.sin(elapsed*.35+o.id)*.32;o.position.z=t.position.z+Math.cos(elapsed*.28+o.id)*.25;o.rotation.y+=dt*.08;}else if(o.name==='WindChime')o.rotation.z=Math.sin(elapsed*.8)*.045;else if(o.userData.phase!==undefined){const t=(elapsed*.35+o.userData.phase)%1;o.scale.setScalar(.7+t*3);o.material.opacity=(1-t)*.22;}const m=o.userData.motion;if(m){m.t=Math.min(1,m.t+dt*1.8);const s=m.t*m.t*(3-2*m.t),v=THREE.MathUtils.lerp(m.start,m.end,s);if(m.property==='rotationY')o.rotation.y=v;else o.position.z=v;if(m.t===1)delete o.userData.motion;}}
 nearest=nearestHotspot();$('interact').hidden=!(nearest||held||seated);$('interactText').textContent=held?'放回木积木':seated?'起身':nearest?.title||'';
 if(mode==='walk'&&!transition){const x=camera.position.x,y=-camera.position.z;let id=y>3?x<-3?'childhood':x<3?'university':'future':x<-3&&y>-5?'tea':'garden';if(id==='childhood'&&Math.hypot(x+5.55,y-7.1)<1.1&&activeView==='desk')id='desk';if(id!==activeView)selectNote(id);}
 updateListener();if(audioEnabled&&elapsed-lastBell>19){playTone('bell');lastBell=elapsed;}
 }
 if(quality)composer.render();else renderer.render(scene,camera);frameCount++;measureTime+=actualDt;if(measureTime>1){fps=Math.round(frameCount/measureTime);frameCount=0;measureTime=0;$('debug').textContent=`FPS ${fps}\n位置 ${camera.position.x.toFixed(2)}, ${(-camera.position.z).toFixed(2)}\n视角 ${activeView}\n碰撞 ${loaded?blocked(camera.position.x,-camera.position.z,meta):'-'}`;document.body.dataset.fps=String(fps);document.body.dataset.view=activeView;}
}
animate();
