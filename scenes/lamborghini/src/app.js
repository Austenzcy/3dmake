import * as THREE from '../vendor/build/three.module.js';
import {OrbitControls} from '../vendor/examples/jsm/controls/OrbitControls.js';
import {GLTFLoader} from '../vendor/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from '../vendor/examples/jsm/environments/RoomEnvironment.js';

const $=s=>document.querySelector(s);
const canvas=$('#viewport'), stage=$('#stage');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0x030405);
renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x030405);
const camera=new THREE.PerspectiveCamera(38,1,.015,100);
camera.position.set(4.7,2.3,5.5);
const orbit=new OrbitControls(camera,canvas);orbit.target.set(0,.56,0);
orbit.enableDamping=true;orbit.dampingFactor=.08;orbit.minDistance=.12;orbit.maxDistance=15;
orbit.maxPolarAngle=Math.PI*.485;orbit.screenSpacePanning=true;
const pmrem=new THREE.PMREMGenerator(renderer);
const room=new RoomEnvironment();
room.traverse(o=>{if(o.isMesh&&o.material.isMeshStandardMaterial)o.material.color.setRGB(.012,.012,.012);});
const environment=pmrem.fromScene(room,.035);scene.environment=environment.texture;scene.environmentIntensity=.65;
room.dispose();pmrem.dispose();
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshBasicMaterial({color:0x050607,toneMapped:false}));
floor.rotation.x=-Math.PI/2;floor.position.y=-.008;floor.receiveShadow=true;scene.add(floor);
const shadowFloor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.7}));shadowFloor.rotation.x=-Math.PI/2;shadowFloor.position.y=-.007;shadowFloor.receiveShadow=true;scene.add(shadowFloor);
const key=new THREE.DirectionalLight(0xf2f5ff,2.2);key.position.set(2.5,6,4);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=4;key.shadow.camera.bottom=-4;
key.shadow.camera.near=.5;key.shadow.camera.far=15;key.shadow.bias=-.00015;key.shadow.normalBias=.015;key.shadow.radius=3;scene.add(key);
const rim=new THREE.DirectionalLight(0xb9ccff,1.5);rim.position.set(-4,3,-3);scene.add(rim);
const front=new THREE.DirectionalLight(0xffffff,1.1);front.position.set(4,2,-4);scene.add(front);

const names={door_left:'CTRL_Door_L',door_right:'CTRL_Door_R',window_left:'CTRL_Window_L',window_right:'CTRL_Window_R',frunk_open:'CTRL_Frunk'};
const target={door_left:0,door_right:0,window_left:0,window_right:0,frunk_open:0};
const pose={...target};let rig={},windows={},wheels=[],loaded=false,speed=0,playing=false;
let cameraTween=null;
const cameras={
 front:{position:[4.7,2.3,5.5],target:[0,.56,0],fov:38,label:'前侧外观'},
 side:{position:[6.4,1.4,.2],target:[0,.61,0],fov:38,label:'侧面轮廓'},
 rear:{position:[4.6,2.1,-5.5],target:[0,.65,0],fov:38,label:'后侧外观'},
 cockpit:{position:[.39,1.035,-.25],target:[.27,.72,.82],fov:76,label:'驾驶舱'},
 cabin:{position:[2.1,1.5,-.08],target:[0,.64,.22],fov:48,label:'座舱细节'}
};
function chooseCamera(name){
 const view=cameras[name];if(!view)return;
 cameraTween={start:performance.now(),from:camera.position.clone(),to:new THREE.Vector3(...view.position),fromTarget:orbit.target.clone(),toTarget:new THREE.Vector3(...view.target),fromFov:camera.fov,toFov:view.fov};
 document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===name));
 $('#view-name').textContent=view.label;
 if(name==='cabin')setControl('door_left',1);
}
orbit.addEventListener('start',()=>{cameraTween=null;document.querySelectorAll('[data-camera]').forEach(b=>b.classList.remove('active'));$('#view-name').textContent='自由视角';});
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>chooseCamera(b.dataset.camera)));
function setControl(name,value){
 target[name]=Number(value);const input=$(`[data-control="${name}"]`);input.value=String(Math.round(value*100));
 $(`#value-${name}`).textContent=Math.round(value*100)+'%';
}
document.querySelectorAll('[data-control]').forEach(input=>input.addEventListener('input',()=>setControl(input.dataset.control,Number(input.value)/100)));
$('#open-all').addEventListener('click',()=>{setControl('door_left',1);setControl('door_right',1);setControl('frunk_open',1);chooseCamera('front');});
$('#close-all').addEventListener('click',()=>Object.keys(target).forEach(k=>setControl(k,0)));
function syncSpeed(){
 $('#speed-value').textContent=String(speed);$('#speed').value=String(speed);
 $('#wheel-toggle').textContent=playing?'暂停转动':'转动车轮';$('#wheel-toggle').setAttribute('aria-pressed',String(playing));
 $('#wheel-state').textContent=playing&&speed>0?'车轮转动中':'车轮已停止';
}
$('#speed').addEventListener('input',e=>{speed=Number(e.target.value);playing=speed>0;syncSpeed();});
$('#wheel-toggle').addEventListener('click',()=>{playing=!playing;if(playing&&speed===0)speed=20;syncSpeed();});
$('#reset').addEventListener('click',()=>{Object.keys(target).forEach(k=>setControl(k,0));speed=0;playing=false;syncSpeed();wheels.forEach(w=>w.node.rotation.x=0);chooseCamera('front');});
$('#info-open').addEventListener('click',()=>$('#info').showModal());
$('#info-close').addEventListener('click',()=>$('#info').close());
$('#info').addEventListener('click',e=>{if(e.target===$('#info'))$('#info').close();});
$('#controls-toggle').addEventListener('click',()=>{const open=document.body.classList.toggle('controls-hidden');$('#controls-toggle').setAttribute('aria-expanded',String(!open));$('#controls-toggle').textContent=open?'显示控制':'收起控制';setTimeout(resize,310);});
$('#snapshot').addEventListener('click',()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='Aventador-SVJ.png';a.href=canvas.toDataURL('image/png');a.click();});
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(stage);resize();

async function load(){
 const loader=new GLTFLoader();let data;
 const embedded=$('#model-data');
 if(embedded){const bin=atob(embedded.textContent.trim()),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);data=bytes.buffer;}
 else{const response=await fetch('./assets/aventador_svj_v1.glb');if(!response.ok)throw new Error('模型文件未能读取');data=await response.arrayBuffer();}
 const gltf=await loader.parseAsync(data,'');const model=gltf.scene;scene.add(model);
 let triangles=0;
 model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])if(m[key])m[key].anisotropy=renderer.capabilities.getMaxAnisotropy();if(m.name==='GlassGoogle'){o.castShadow=false;m.depthWrite=false;m.side=THREE.DoubleSide;m.envMapIntensity=1.8;}if(m.name==='Light'){m.emissiveIntensity=0;}}}});
 for(const [control,name] of Object.entries(names)){rig[control]=model.getObjectByName(name);if(!rig[control])throw new Error('未找到开合部件 '+name);}
 for(const side of ['left','right'])windows[side]={rest:rig['window_'+side].position.clone(),sign:side==='left'?1:-1};
 for(const corner of ['FL','FR','RL','RR']){const node=model.getObjectByName('CTRL_Wheel_'+corner);if(!node)throw new Error('车轮部件未找到');wheels.push({node,radius:node.userData.radius_m||.34});}
 loaded=true;$('#loading').classList.add('done');$('#loading').setAttribute('aria-hidden','true');$('#model-status').textContent='模型已就绪';
 $('#triangle-count').textContent=Math.round(triangles).toLocaleString('zh-CN');document.body.dataset.ready='true';
 $('#controls').inert=false;$('#model-status').dataset.triangles=Math.round(triangles);renderer.compileAsync(scene,camera).catch(()=>{});
}
load().catch(error=>{$('#loading-title').textContent='模型未能加载';$('#loading-subtitle').textContent=error.message+'。请检查网络连接并刷新页面重试。';console.error(error);document.body.dataset.ready='error';});
let previous=performance.now();
function frame(now){
 requestAnimationFrame(frame);const dt=Math.min((now-previous)/1000,.05);previous=now;
 if(loaded){
  const smooth=1-Math.exp(-dt*14);for(const k in pose)pose[k]=THREE.MathUtils.lerp(pose[k],target[k],smooth);
  rig.door_left.rotation.x=pose.door_left*THREE.MathUtils.degToRad(70);rig.door_right.rotation.x=pose.door_right*THREE.MathUtils.degToRad(70);
  rig.frunk_open.rotation.x=-pose.frunk_open*THREE.MathUtils.degToRad(60);
  for(const side of ['left','right']){const {rest,sign}=windows[side],node=rig['window_'+side],v=pose['window_'+side];node.position.copy(rest);node.position.x+=v*.020*sign;node.position.y-=v*.430;node.rotation.z=-v*sign*THREE.MathUtils.degToRad(38);}
  if(playing&&speed>0)for(const w of wheels)w.node.rotation.x=(w.node.rotation.x+dt*speed/3.6/w.radius)%(Math.PI*2);
 }
 if(cameraTween){const p=Math.min((now-cameraTween.start)/900,1),t=p*p*(3-2*p);camera.position.lerpVectors(cameraTween.from,cameraTween.to,t);orbit.target.lerpVectors(cameraTween.fromTarget,cameraTween.toTarget,t);camera.fov=THREE.MathUtils.lerp(cameraTween.fromFov,cameraTween.toFov,t);camera.updateProjectionMatrix();if(p===1)cameraTween=null;}
 orbit.update();renderer.render(scene,camera);
}
requestAnimationFrame(frame);
