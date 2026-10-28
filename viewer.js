'use strict';
const scenes={harbor:{title:'樱港',src:'scenes/harbor/'},courtyard:{title:'记忆小院',src:'scenes/courtyard/'},apartment:{title:'暖夜公寓',src:'scenes/apartment/'}};
const select=document.getElementById('scene'),frame=document.getElementById('sceneFrame'),direct=document.getElementById('direct');
function showScene(id,update=false){if(!Object.hasOwn(scenes,id))id='harbor';const scene=scenes[id];select.value=id;frame.title=scene.title+' · 交互三维场景';frame.src=scene.src;direct.href=scene.src;document.title=scene.title+' · 3DMAKE';if(update){const url=new URL(location.href);url.searchParams.set('scene',id);history.pushState({},'',url);}}
select.addEventListener('change',()=>showScene(select.value,true));
addEventListener('popstate',()=>showScene(new URLSearchParams(location.search).get('scene')));
document.getElementById('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{document.querySelector('.viewer-note').textContent='浏览器暂不支持全屏，可使用“独立打开”查看场景。';}});
showScene(new URLSearchParams(location.search).get('scene'));
