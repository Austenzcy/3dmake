import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { fishPose, individualFishPose, FISH_COUNTS, FISH_IDENTITIES, gullPose, gullQuaternion, GULL_COUNT } from './wildlife.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const stage=$('#stage'), loading=$('#loading');
const scene=new THREE.Scene();scene.background=new THREE.Color('#eeece2');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.98;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label','三维港口：拖动旋转，滚轮缩放，轻触海面泛起涟漪');
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();toast('画面暂时中断，请刷新页面重新加载。',12000)});
const camera=new THREE.OrthographicCamera(-20,20,15,-15,.1,250);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=true;controls.minZoom=.45;controls.maxZoom=4;controls.maxPolarAngle=Math.PI*.47;controls.minPolarAngle=.12;controls.autoRotateSpeed=.35;controls.target.set(0,2.3,0);
scene.add(new THREE.HemisphereLight('#f5f4e7','#648c80',1.3));scene.add(new THREE.AmbientLight('#c4d5cd',.20));
const sun=new THREE.DirectionalLight('#fff5df',2.25);sun.position.set(-14,26,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-20;sun.shadow.camera.right=20;sun.shadow.camera.top=20;sun.shadow.camera.bottom=-20;sun.shadow.camera.near=.5;sun.shadow.camera.far=65;sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;sun.shadow.radius=3;scene.add(sun);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:'#4d6259',opacity:.19}));ground.rotation.x=-Math.PI/2;ground.position.y=-1.5;ground.receiveShadow=true;scene.add(ground);
const views=[
 {name:'小小港口',title:'我用 AI<br>造了一座小港口',subtitle:'一段想象，慢慢长成一个世界。',caption:'货轮靠岸，樱花落下。海面之下，也藏着一个世界。',target:[0,2.6,0],offset:[28,27,35],span:27.5,ref:'overview',time:'00:04',refText:'方形海水剖面、后侧港口、右侧防波堤，保留原视频的微缩构图。'},
 {name:'港口作业',title:'货轮会靠岸<br>吊机会认真上班',subtitle:'一红一蓝，两座吊机缓缓协作。',caption:'钢架、缆绳、波纹箱壁。每一个部件，都有自己的位置。',target:[-5,4.25,-5.0],offset:[15,14,22],span:15.0,ref:'cargo',time:'00:12',refText:'复刻红蓝双吊机的桁架、斜拉索、操作舱、吊具，以及沿岸的货轮和多层集装箱。'},
 {name:'樱花街区',title:'沿着樱花<br>走进港口日常',subtitle:'瓦片、木窗、灯笼，都慢慢打磨。',caption:'鱼市场旁的小摊，街角的鸟居，还有一树一树的春天。',target:[4.7,3.65,-7.1],offset:[9,9,17],span:11.4,ref:'village',time:'00:20',refText:'青绿色瓦屋顶、木格窗、鱼市场、红色鸟居、粉白樱花。街上保留小摊、木桶、路灯与行人。'},
 {name:'海边散步',title:'灯塔、木栈道<br>还有飞过的海鸥',subtitle:'给每个角落，留一点生活。',caption:'红白灯塔守着防波堤，小渔船在木码头旁轻轻摇晃。',target:[6.8,2.8,-.1],offset:[13,11,19],span:12.1,ref:'lighthouse',time:'00:28',refText:'红白条纹灯塔、环形栏杆和灯室，沿着石砌防波堤走向岸边的木栈道与渔船。'},
 {name:'水下世界',title:'海面之下<br>也藏着一个世界',subtitle:'鱼群 · 海草 · 珊瑚 · 旧船锚',caption:'透过薄荷色海水，看鱼群穿过水草，光影轻轻掠过沙地。',target:[-2,.4,4.8],offset:[9,15,16],span:12.8,ref:'underwater',time:'00:40',refText:'透视海水下的鱼群、弯曲海草、珊瑚、旧船锚与链条、捕笼和沉木，并保留帆船和黄色浮标。'}
];
let current=0,model=null,waterMeshes=[],pause=matchMedia('(prefers-reduced-motion: reduce)').matches,wire=false,waterVisible=true,tour=false,tourNext=0,simTime=0,transition=null,shipSailing=false,shipStart=0,toastTimer;
let movers=[],gulls=[],fishes=[],cranes=[];const fishInstances=[];let lastWildlifeReadout=-1;
const base=new Map(),materials=new Map();
const waterTime={value:0};
const waterMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:waterTime,waterColor:{value:new THREE.Color('#59b4aa')}},vertexShader:`varying vec3 pos;void main(){vec4 wp=modelMatrix*vec4(position,1.);pos=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,fragmentShader:`uniform float time;uniform vec3 waterColor;varying vec3 pos;void main(){float wave=sin(pos.x*3.+pos.z*2.2+time*.6)*sin(pos.z*4.-time*.5);float glint=pow(max(0.,sin(pos.x*3.4+pos.z*3.1+time*.35)),28.)*.035;gl_FragColor=vec4(waterColor+glint,.065+wave*.012);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),seaPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-1.81),hit=new THREE.Vector3();
let pointerDown={x:0,y:0},ripples=[];
function toast(text,duration=2600){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),duration)}
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h);const aspect=w/h;let span=views[current].span;if(w<600)span=Math.max(span,views[current].span*(h<600?1.48:1.22)/aspect);else if(w<900)span*=1.08;camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix()}
function setView(i,instant=false){current=i;$('#experience').classList.toggle('detail',i>0);const v=views[i];controls.autoRotate=false;$('#rotateBtn').setAttribute('aria-pressed','false');$('#sceneTitle').innerHTML=v.title;$('#sceneSubtitle').textContent=v.subtitle;$('#sceneNumber').textContent=`0${i+1} / ${v.name}`;$('#sceneCaption').textContent=v.caption;$$('[data-view]').forEach(b=>{const yes=+b.dataset.view===i;b.classList.toggle('active',yes);if(yes)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current')});const target=new THREE.Vector3(...v.target);if(stage.clientWidth<600)target.y+=stage.clientHeight<600?3.3:1.0;const pos=target.clone().add(new THREE.Vector3(...v.offset));if(instant){camera.position.copy(pos);controls.target.copy(target);camera.zoom=1;resize();controls.update()}else{transition={start:performance.now(),from:camera.position.clone(),to:pos,fromTarget:controls.target.clone(),target,fromZoom:camera.zoom,fromSpan:camera.top*2};}}
function stopTour(){tour=false;$('#tourBtn').classList.remove('active');$('#tourBtn').innerHTML='<span>▷</span> 跟着镜头逛一圈'}
controls.addEventListener('start',()=>{transition=null;stopTour()});
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>{stopTour();setView(+b.dataset.view)}));$('.wordmark').addEventListener('click',e=>{e.preventDefault();stopTour();setView(0)});
$('#resetBtn').onclick=()=>{stopTour();setView(current);toast('已回到当前场景的初始视角')};
$('#rotateBtn').onclick=()=>{stopTour();controls.autoRotate=!controls.autoRotate;$('#rotateBtn').setAttribute('aria-pressed',controls.autoRotate);toast(controls.autoRotate?'镜头开始慢慢环绕':'已停止环绕')};
function updatePause(){const b=$('#pauseBtn');b.setAttribute('aria-pressed',pause);b.setAttribute('aria-label',pause?'播放动画':'暂停动画');b.title=pause?'播放场景动画':'暂停场景动画';b.innerHTML=`<span>${pause?'▷':'Ⅱ'}</span><small>${pause?'播放':'暂停'}</small>`;}
$('#pauseBtn').onclick=()=>{pause=!pause;updatePause();toast(pause?'港口时间暂停了':'小港口又动起来了')};updatePause();
$('#waterBtn').onclick=()=>{waterVisible=!waterVisible;waterMeshes.forEach(o=>o.visible=waterVisible);$('#waterBtn').setAttribute('aria-pressed',!waterVisible);toast(waterVisible?'海水已恢复':'海水已隐藏，可以清楚查看海底结构')};
$('#wireBtn').onclick=()=>{wire=!wire;model?.traverse(o=>{if(o.isMesh&&o.material&&!waterMeshes.includes(o)){for(const m of Array.isArray(o.material)?o.material:[o.material])m.wireframe=wire}});$('#wireBtn').setAttribute('aria-pressed',wire);toast(wire?'线框模式：查看真实模型网格':'已恢复材质显示')};
$('#tourBtn').onclick=()=>{tour=!tour;$('#tourBtn').classList.toggle('active',tour);$('#tourBtn').innerHTML=tour?'<span>Ⅱ</span> 停止镜头导览':'<span>▷</span> 跟着镜头逛一圈';if(tour){setView(0);tourNext=performance.now()+8000;toast('五个观景角度，每处停留约 8 秒')}};
$('#sailBtn').onclick=()=>{if(!model)return;if(shipSailing){toast('货轮正在绕行，将自动回到泊位');return}document.body.dataset.sailing='true';shipSailing=true;shipStart=simTime;pause=false;updatePause();$('#sailBtn').textContent='货轮正在出航…';toast('货轮出航，沿港内航线绕行后返回泊位',3500)};
const dialog=$('#referenceDialog');function chooseRef(i){stopTour();const v=views[i];$('#referenceImage').src='../../assets/harbor.jpg';$('#referenceImage').alt='港口模型渲染预览';$('#referenceTime').textContent='模型预览';$('#referenceHeading').textContent=v.name;$('#referenceText').textContent=v.refText;$$('[data-ref]').forEach(b=>b.classList.toggle('active',+b.dataset.ref===i));setView(i)}
$('#referenceBtn').onclick=()=>{chooseRef(current);dialog.showModal()};$('#closeReference').onclick=()=>dialog.close();$('#backToModel').onclick=()=>dialog.close();$$('[data-ref]').forEach(b=>b.onclick=()=>chooseRef(+b.dataset.ref));dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
renderer.domElement.addEventListener('pointerdown',e=>{pointerDown={x:e.clientX,y:e.clientY}});
renderer.domElement.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>7||!model||!waterVisible)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);if(raycaster.ray.intersectPlane(seaPlane,hit)&&Math.abs(hit.x)<9.95&&hit.z>-4.8&&hit.z<9.95){for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.RingGeometry(.97,1,72),new THREE.MeshBasicMaterial({color:'#f3ffe9',transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.copy(hit);ring.position.y=1.82+i*.002;ring.scale.setScalar(.01);scene.add(ring);ripples.push({mesh:ring,born:simTime+i*.25})}}});
// Body and tail each use one instanced draw per school, while every fish has
// its own position, heading, reaction delay and tail phase.
const fishMatrix=new THREE.Matrix4(),tailMatrix=new THREE.Matrix4();
const fishPosition=new THREE.Vector3(),fishScale=new THREE.Vector3(),fishQuaternion=new THREE.Quaternion();
const fishUp=new THREE.Vector3(0,1,0),tailPivot=new THREE.Matrix4().makeTranslation(-.055,0,0),tailRotation=new THREE.Matrix4();
function createIndependentFish(){
 for(const school of fishes){
  const index=school.userData.motionIndex,count=FISH_COUNTS[index];
  const body=model.getObjectByName(`FishBody_${index}_0`),tail=model.getObjectByName(`FishTailMesh_${index}_0`);
  if(!body?.isMesh||!tail?.isMesh)throw new Error(`Missing independent fish geometry in school ${index}`);
  const bodyInstances=new THREE.InstancedMesh(body.geometry,body.material,count);
  const tailInstances=new THREE.InstancedMesh(tail.geometry,tail.material,count);
  for(const [part,mesh] of [['Body',bodyInstances],['Tail',tailInstances]]){
   mesh.name=`SwimmingFish${part}_${index}`;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
   mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);model.add(mesh);
  }
  school.visible=false;
  fishInstances.push({school:index,body:bodyInstances,tail:tailInstances,identities:FISH_IDENTITIES.filter(f=>f.school===index)});
 }
}
function animateIndependentFish(time){
 for(const school of fishInstances){
  for(const fish of school.identities){
   const p=individualFishPose(fish.school,fish.index,time);
   fishPosition.fromArray(p.position);fishScale.setScalar(fish.size);fishQuaternion.setFromAxisAngle(fishUp,p.yaw);
   fishMatrix.compose(fishPosition,fishQuaternion,fishScale);school.body.setMatrixAt(fish.index,fishMatrix);
   tailRotation.makeRotationY(p.tail);tailMatrix.copy(fishMatrix).multiply(tailPivot).multiply(tailRotation);
   school.tail.setMatrixAt(fish.index,tailMatrix);
  }
  school.body.instanceMatrix.needsUpdate=true;school.tail.instanceMatrix.needsUpdate=true;
 }
}
const loader=new GLTFLoader();
loader.load('assets/sakura_harbor.glb?v=0c1c0c9c9593',gltf=>{model=gltf.scene;model.name='SakuraHarbor';scene.add(model);
 model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){materials.set(m.name,m);if(/water/.test(m.name)){o.castShadow=false;o.receiveShadow=false;o.material=m.name==='water_top'?waterMat:m;if(m.name!=='water_top'){m.transparent=true;m.opacity=.15;m.depthWrite=false;m.side=THREE.DoubleSide}o.renderOrder=m.name==='water_top'?3:2;waterMeshes.push(o)}if(/grass|coral|fish/.test(m.name))m.side=THREE.DoubleSide;if(/blossom/.test(m.name))m.roughness=.95;}}
 if(/^(CargoShip|TugBoat|FishingBoat|Sailboat_\d|Buoy_\d)$/.test(o.name)){movers.push(o);base.set(o.name,{p:o.position.clone(),r:o.rotation.clone()})}
 if(/^Gull_\d+$/.test(o.name)){const index=Number(o.name.split('_')[1]);if(index<GULL_COUNT){o.userData.motionIndex=index;o.userData.wings=[];o.traverse(c=>{if(/^GullWing_\d+_[LR]$/.test(c.name))o.userData.wings.push(c)});gulls.push(o)}else o.visible=false;}
 if(/^FishSchool_\d+$/.test(o.name)){o.userData.motionIndex=Number(o.name.split('_')[1]);fishes.push(o);}
 if(/^CraneLoad_/.test(o.name)){cranes.push(o);base.set(o.name,{p:o.position.clone(),r:o.rotation.clone()})}
 });
 createIndependentFish();animateIndependentFish(simTime);
 $('#loadPercent').textContent='100%';$('.loader-line i').style.width='100%';setTimeout(()=>{loading.classList.add('hide');loading.setAttribute('aria-hidden','true')},300);document.body.dataset.loaded='true';window.harborLoaded=true;window.harborInfo={meshCount:0,modelSource:'Blender 4.5',controls:'OrbitControls',views:5};model.traverse(o=>{if(o.isMesh)window.harborInfo.meshCount++});
},p=>{const percent=p.total?Math.round(p.loaded/p.total*100):Math.min(95,Math.round(p.loaded/180000));$('#loadPercent').textContent=percent+'%';$('.loader-line i').style.width=percent+'%'},e=>{console.error(e);loading.innerHTML='<div>港口还没有加载成功</div><small>请检查网络与浏览器 WebGL 支持，然后刷新重试。</small><a href="../../assets/harbor.jpg" style="margin-top:20px;font-size:12px;text-decoration:underline">先查看 Blender 全景渲染 ↗</a>';window.harborLoadError=String(e)});

let prev=performance.now();
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-prev)/1000,.08);prev=now;if(!pause)simTime+=dt;waterTime.value=simTime;
 if(transition){const tr=transition;const t=Math.min(1,(now-tr.start)/1550),e=t*t*(3-2*t);camera.position.lerpVectors(tr.from,tr.to,e);controls.target.lerpVectors(tr.fromTarget,tr.target,e);camera.zoom=THREE.MathUtils.lerp(tr.fromZoom,1,e);let span=views[current].span;const aspect=stage.clientWidth/stage.clientHeight;if(stage.clientWidth<600)span=Math.max(span,span*(stage.clientHeight<600?1.48:1.22)/aspect);else if(stage.clientWidth<900)span*=1.08;span=THREE.MathUtils.lerp(tr.fromSpan,span,e);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();if(t===1)transition=null}
 if(tour&&now>=tourNext){if(current===views.length-1){stopTour();setView(0)}else{setView(current+1);tourNext=now+8000}}
 movers.forEach((o,i)=>{const b=base.get(o.name);o.position.copy(b.p);o.rotation.copy(b.r);o.position.y+=Math.sin(simTime*1.2+i)*.024;o.rotation.x+=Math.sin(simTime*.8+i)*.008;o.rotation.z+=Math.cos(simTime*.9+i)*.007;if(o.name==='CargoShip'&&shipSailing){const u=Math.min(1,(simTime-shipStart)/38);let pos,angle=0;const berth=new THREE.Vector3(-5.35,1.92,-3.46),entry=new THREE.Vector3(-4,1.92,-1.6);if(u<.17){let q=u/.17;q=q*q*(3-2*q);pos=berth.clone().lerp(entry,q)}else if(u>.83){let q=(u-.83)/.17;q=q*q*(3-2*q);pos=entry.clone().lerp(berth,q)}else{const a=(u-.17)/.66*Math.PI*2;pos=new THREE.Vector3(-4+2*Math.sin(a),1.92,-.5-1.1*Math.cos(a));angle=-Math.atan2(1.1*Math.sin(a),2*Math.cos(a));}o.position.copy(pos);o.position.y+=Math.sin(simTime)*.025;o.rotation.y=angle;if(u>=1){document.body.dataset.sailing='false';shipSailing=false;o.position.copy(b.p);o.rotation.copy(b.r);$('#sailBtn').textContent='让货轮出航 ↗';toast('货轮回到泊位了')}}});
 gulls.forEach(o=>{const p=gullPose(o.userData.motionIndex,simTime);o.position.fromArray(p.position);o.quaternion.fromArray(gullQuaternion(p));o.userData.wings.forEach(w=>{w.rotation.x=Number(w.userData.side)*p.flap});});
 animateIndependentFish(simTime);
 // A compact DOM readout permits checking the rendered behavior without changing simulation state.
 const readoutTick=Math.floor(simTime*4);
 if(model&&readoutTick!==lastWildlifeReadout){lastWildlifeReadout=readoutTick;stage.dataset.wildlife=JSON.stringify({time:Number(simTime.toFixed(2)),gulls:gulls.length,individualFishCount:FISH_IDENTITIES.length,fish:fishes.map(o=>{const school=o.userData.motionIndex,p=fishPose(school,simTime);return {school,state:p.state,position:p.position.map(n=>Number(n.toFixed(3))),samples:[0,Math.floor(FISH_COUNTS[school]/2),FISH_COUNTS[school]-1].map(index=>{const q=individualFishPose(school,index,simTime);return {index,state:q.state,position:q.position.map(n=>Number(n.toFixed(3))),yaw:Number(q.yaw.toFixed(3)),tail:Number(q.tail.toFixed(3)),delay:Number(q.delay.toFixed(3))}})}}),birds:gulls.map(o=>o.position.toArray().map(n=>Number(n.toFixed(3)))),exposure:renderer.toneMappingExposure});}
 cranes.forEach((o,i)=>{const b=base.get(o.name);const lift=(1-Math.cos(simTime*.24+i*Math.PI))*.56;o.position.y=b.p.y+lift;const c=model.getObjectByName(o.name.replace('CraneLoad_','CraneCable_'));if(c)c.scale.y=(2.53-lift)/2.53});
 ripples=ripples.filter(r=>{const age=simTime-r.born;if(age<0)return true;if(age>2.8){scene.remove(r.mesh);r.mesh.geometry.dispose();r.mesh.material.dispose();return false}r.mesh.scale.setScalar(.1+age*.95);r.mesh.material.opacity=.5*(1-age/2.8);return true});
 controls.update();renderer.render(scene,camera);
}
setView(0,true);addEventListener('resize',resize);resize();requestAnimationFrame(frame);
// Public read-only diagnostics make local acceptance checks straightforward.
window.getHarborState=()=>({loaded:!!model,view:current,paused:pause,waterVisible,wireframe:wire,tour,shipSailing,time:Math.round(simTime*100)/100,ripples:ripples.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,camera:camera.position.toArray(),canvas:[stage.clientWidth,stage.clientHeight]});
