// Shared deterministic motion used by the viewer and the Blender keyframe bake.
const TAU = Math.PI * 2;
const mod = (a, b) => ((a % b) + b) % b;
const smooth = t => t * t * (3 - 2 * t);
export const FISH_COLORS = ['#234a4b', '#263f50', '#2a473c', '#234750'];
export const GULL_COUNT = 4;
export const LOOP_SECONDS = 48;
const runTimes = [1.65, 2.05, 1.85, 2.05];
const holdTimes = [2.1, 2.8, 1.8, 1.7];
const cycle = 16;
const schoolSpecs = [
  {height:.68, phase:0, points:[[-5,0],[-3.5,1.2],[-4,3],[-5.6,2.3],[-5.8,.4],[-4.7,-.4]]},
  {height:.58, phase:3.6, points:[[2.5,5.5],[3.9,4.5],[3,3],[.8,3.8],[.7,6.4],[2.6,6.6]]},
  {height:.42, phase:7.2, points:[[-5.8,5.9],[-5,4.9],[-3.3,5.4],[-3.5,6.7],[-5.3,6.8],[-6.1,5.6]]},
  {height:.88, phase:11.6, points:[[1.8,0],[3.8,-.7],[4,1],[2.7,2.5],[.7,1.8],[.7,0]]}
];
function catmull(points, u) {
  const n=points.length, s=mod(u,1)*n, k=Math.floor(s), t=s-k;
  const a=points[mod(k-1,n)], b=points[k], c=points[(k+1)%n], d=points[(k+2)%n];
  return [0,1].map(j=>.5*((2*b[j])+(-a[j]+c[j])*t+(2*a[j]-5*b[j]+4*c[j]-d[j])*t*t+(-a[j]+3*b[j]-3*c[j]+d[j])*t*t*t));
}
function makePath(points) {
  const samples=480, distances=[0];let prev=catmull(points,0), total=0;
  for(let i=1;i<=samples;i++){const p=catmull(points,i/samples);total+=Math.hypot(p[0]-prev[0],p[1]-prev[1]);distances.push(total);prev=p;}
  return {total, at(u){
    const distance=mod(u,1)*total;let low=0,high=samples;
    while(high-low>1){const mid=(low+high)>>1;if(distances[mid]<distance)low=mid;else high=mid;}
    const f=(distance-distances[low])/(distances[high]-distances[low]);
    const t=(low+f)/samples, p=catmull(points,t), a=catmull(points,t-.0001), b=catmull(points,t+.0001);
    return {p, yaw:-Math.atan2(b[1]-a[1],b[0]-a[0])};
  }};
}
const paths=schoolSpecs.map(s=>makePath(s.points));
export const FISH_COUNTS = [50, 65, 36, 35];
function schoolProgress(index,time) {
  const spec=schoolSpecs[index],path=paths[index];
  const elapsed=time+spec.phase,loops=Math.floor(elapsed/cycle);
  let t=mod(elapsed,cycle),leg=0;
  while(leg<3&&t>=runTimes[leg]+holdTimes[leg]){t-=runTimes[leg]+holdTimes[leg];leg++;}
  const moving=t<runTimes[leg],u=moving?t/runTimes[leg]:1;
  return {progress:loops+(leg+smooth(u))/4,
    state:moving?'swimming':'holding',speed:moving?path.total/4*(6*u*(1-u))/runTimes[leg]:0};
}
export function fishPose(index,time) {
  const motion=schoolProgress(index,time),point=paths[index].at(motion.progress);
  return {position:[point.p[0],schoolSpecs[index].height+.012*Math.sin(time*TAU/4+index),point.p[1]],yaw:point.yaw,...motion};
}
const fraction=x=>x-Math.floor(x);
const noise=(school,fish,salt)=>fraction(Math.sin((school+1)*91.17+(fish+1)*37.71+salt*19.19)*43758.5453);
export const FISH_IDENTITIES=FISH_COUNTS.flatMap((count,school)=>Array.from({length:count},(_,index)=>{
  const rank=(index+.35*noise(school,index,1))/count;
  return {name:`Fish_${school}_${index}`,school,index,rank,
    // Fish toward the back react later, while occupying their own point along the curved route.
    delay:.08+.78*rank+.14*noise(school,index,2),
    along:.76-1.70*rank+.12*(noise(school,index,3)-.5),
    lane:(fraction(index*.61803398875+school*.217)-.5)*1.30,
    depth:(noise(school,index,4)-.5)*.26,
    size:.78+.40*noise(school,index,5),
    phase:TAU*noise(school,index,6),
    restFrequency:(45+index%22)/48,
    strokesPerLap:9+index%5,
    turnMemory:.08+.12*noise(school,index,7)};
}));
const identities=FISH_COUNTS.map((_,s)=>FISH_IDENTITIES.filter(f=>f.school===s));
function routeForFish(f,time) {
  const motion=schoolProgress(f.school,time-f.delay),path=paths[f.school];
  const frontBack=.045*Math.sin(time*TAU/4+f.phase);
  const u=motion.progress+(f.along+frontBack)/path.total;
  return {motion,point:path.at(u),u};
}
export function individualFishPose(school,index,time) {
  const f=identities[school][index],path=paths[school];
  const now=routeForFish(f,time),past=routeForFish(f,time-f.turnMemory),older=routeForFish(f,time-f.turnMemory*2);
  const sine=.52*Math.sin(now.point.yaw)+.33*Math.sin(past.point.yaw)+.15*Math.sin(older.point.yaw);
  const cosine=.52*Math.cos(now.point.yaw)+.33*Math.cos(past.point.yaw)+.15*Math.cos(older.point.yaw);
  const lane=f.lane+.045*Math.sin(time*TAU/3+f.phase*1.7);
  const strokePhase=TAU*(time*f.restFrequency+now.motion.progress*f.strokesPerLap)+f.phase;
  const amplitude=.070+.145*Math.min(1,now.motion.speed/1.65);
  const bodySway=.012*Math.sin(strokePhase-.7);
  return {position:[now.point.p[0]+Math.sin(now.point.yaw)*lane,
      schoolSpecs[school].height+f.depth+.014*Math.sin(time*TAU/4+f.phase),
      now.point.p[1]+Math.cos(now.point.yaw)*lane],
    yaw:Math.atan2(sine,cosine)+bodySway,tail:amplitude*Math.sin(strokePhase),
    tailPhase:strokePhase,tailAmplitude:amplitude,state:now.motion.state,speed:now.motion.speed,delay:f.delay};
}
const gullSpecs=[
  {center:[-3,6.4,1.2],radii:[3.7,2.6],period:12,phase:0,direction:1},
  {center:[2.1,7.2,1.5],radii:[4.5,3.2],period:16,phase:1.8,direction:-1},
  {center:[-2,5.7,3.4],radii:[2.8,4.1],period:12,phase:3.5,direction:1},
  {center:[4,6.1,.1],radii:[3.1,2.4],period:12,phase:5.2,direction:-1}
];
export function gullPose(index,time) {
  const s=gullSpecs[index],omega=s.direction*TAU/s.period,a=s.phase+time*omega;
  const vx=-s.radii[0]*Math.sin(a)*omega,vz=s.radii[1]*Math.cos(a)*omega;
  const vy=.48*Math.cos(2*a+.5)*omega;
  // Mostly gliding, with short, visible wing beats rather than constant flutter.
  const beatPhase=mod(time+index*1.3,8),envelope=beatPhase<2.2?Math.sin(Math.PI*beatPhase/2.2):0;
  return {position:[s.center[0]+s.radii[0]*Math.cos(a),s.center[1]+.24*Math.sin(2*a+.5),s.center[2]+s.radii[1]*Math.sin(a)],
    yaw:-Math.atan2(vz,vx),bank:s.direction*(.17+.06*Math.sin(a)),pitch:Math.atan2(vy,Math.hypot(vx,vz)),
    flap:.04+.26*envelope*Math.sin(time*TAU*2+index)};
}
export function gullQuaternion(p) {
  const multiply=(a,b)=>[
    a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],
    a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],
    a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
  return multiply(multiply([0,Math.sin(p.yaw/2),0,Math.cos(p.yaw/2)],[Math.sin(p.bank/2),0,0,Math.cos(p.bank/2)]),[0,0,Math.sin(p.pitch/2),Math.cos(p.pitch/2)]);
}
