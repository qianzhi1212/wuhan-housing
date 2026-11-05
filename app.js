(() => {
'use strict';
const $=id=>document.getElementById(id), NS='http://www.w3.org/2000/svg';
const data=window.DONGHU_DATA||{records:[]}, raw=Array.isArray(data.records)?data.records:[];
const COLORS=['#48d4c3','#6baafa','#d2a0ed','#ffbf70','#849bb2'];
const finite=x=>x!==null&&x!==''&&Number.isFinite(Number(x));
const num=x=>finite(x)?Number(x):null;
const median=values=>{const a=values.filter(finite).map(Number).sort((a,b)=>a-b);return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:null;};
const fmt=(x,d=0)=>x===null||x===undefined?'—':Number(x).toLocaleString('zh-CN',{maximumFractionDigits:d});
const label=x=>typeof x==='string'&&x.trim()?x.trim():'未标注';
const room=r=>{const v=Number.isInteger(r.room_count)?r.room_count:Number((r.layout||'').match(/(\d+)室/)?.[1]);return v>0?Math.min(4,v):null;};
const roomName=n=>({'1':'一室','2':'两室','3':'三室','4':'四室及以上'})[n]||'未标注';
const communityKey=r=>String(r.community_key||r.community_id||r.community||'未标注');
function mapPosition(r){
 if(finite(r.longitude)&&finite(r.latitude))return {longitude:r.longitude,latitude:r.latitude,coordinate_system:r.coordinate_system,basis:'同编号详情坐标',source:r.coordinate_source,evidence_at:r.coordinate_evidence_at};
 const p=window.DONGHU_MAP_LOCATIONS?.[String(r.community_id)];return p&&p.community===r.community?p:null;
}
const rows=raw.map(r=>{const p=mapPosition(r);return {...r,__region:label(r.subdistrict),__room:room(r),__mapLongitude:p?.longitude??null,__mapLatitude:p?.latitude??null,__mapCoordinateSystem:p?.coordinate_system||'',__mapBasis:p?.basis||'',__mapLevel:p?(p.location_level==='project'?'项目级':'小区级'):'',__mapSource:p?.source||'',__mapEvidenceAt:p?.evidence_at||''};});
let filtered=rows, mode='price', page=0;
const selection={orientation:'',community:'',unitRange:null,mapCell:null};
let tableSort={key:'',direction:1},selectedListing='';
const node=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;return n;};
const html=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
function chart(id,w,h){const box=$(id);box.replaceChildren();const s=node('svg',{class:'chart-enter',viewBox:'0 0 '+w+' '+h,preserveAspectRatio:'xMidYMid meet'});box.append(s);return s;}
function empty(id,message='当前筛选暂无样本'){const box=$(id);box.replaceChildren(html('div','empty',message));}
function group(list,key){const groups=new Map();for(const r of list){const k=key(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}return [...groups];}
function tip(el,text){el.dataset.tip=text;return el;}
function line(s,x1,y1,x2,y2,stroke='#30465c',extra={}){s.append(node('line',{x1,y1,x2,y2,stroke,...extra}));}

const tooltip=html('div','chart-tooltip');tooltip.id='chartTooltip';tooltip.setAttribute('role','tooltip');document.body.append(tooltip);
function hideTip(){tooltip.hidden=true;}
function showTip(text,x,y){tooltip.textContent=text;tooltip.hidden=false;const r=tooltip.getBoundingClientRect();tooltip.style.left=Math.max(8,Math.min(innerWidth-r.width-8,x+15))+'px';tooltip.style.top=Math.max(8,Math.min(innerHeight-r.height-8,y+16))+'px';}
hideTip();
document.addEventListener('pointermove',e=>{const target=e.target.closest?.('[data-tip]');if(target)showTip(target.dataset.tip,e.clientX,e.clientY);else if(!e.target.closest?.('.scatter-surface, #mapChart'))hideTip();});
document.addEventListener('pointerdown',e=>{if(!e.target.closest?.('.chart'))hideTip();});
document.addEventListener('pointerout',e=>{if(!e.relatedTarget)hideTip();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTip();});
function action(el,name,callback){el.classList.add('interactive-mark');el.setAttribute('tabindex','0');el.setAttribute('role','button');el.setAttribute('aria-label',name);el.addEventListener('click',e=>{hideTip();callback(e);});el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();hideTip();callback(e);}});el.addEventListener('focus',()=>{if(el.dataset.tip){const b=el.getBoundingClientRect();showTip(el.dataset.tip,b.x+b.width/2,b.y+b.height/2);}});el.addEventListener('blur',hideTip);return el;}
function changeChartFilter(type,value){
 clearTimeout(inputTimer);
 if(type==='region')$('subdistrict').value=$('subdistrict').value===value?'':value;
 if(type==='room')$('rooms').value=$('rooms').value===String(value)?'':String(value);
 if(type==='orientation')selection.orientation=selection.orientation===value?'':value;
 if(type==='community')selection.community=selection.community===value?'':value;
 if(type==='unitRange')selection.unitRange=selection.unitRange?.[0]===value[0]&&selection.unitRange?.[1]===value[1]?null:value;
 if(type==='mapCell')selection.mapCell=selection.mapCell===value?null:value;
 render();
}
function chartSelectionMatches(r){return (!selection.orientation||label(r.orientation)===selection.orientation)&&(!selection.community||communityKey(r)===selection.community)&&(!selection.unitRange||r.unit_price_yuan>=selection.unitRange[0]&&r.unit_price_yuan<selection.unitRange[1])&&(!selection.mapCell||r.__mapCell===selection.mapCell);}
function renderSelections(){
 const box=$('activeFilters');box.replaceChildren();
 const chip=(text,clear)=>{const b=html('button','filter-chip',text+' ×');b.type='button';b.setAttribute('aria-label','移除筛选：'+text);b.addEventListener('click',()=>{clearTimeout(inputTimer);clear();render();});box.append(b);};
 if($('subdistrict').value)chip('片区：'+$('subdistrict').value,()=>$('subdistrict').value='');
 if($('rooms').value)chip('户型：'+roomName($('rooms').value),()=>$('rooms').value='');
 if(selection.orientation)chip('朝向：'+selection.orientation,()=>selection.orientation='');
 if(selection.community){const r=rows.find(r=>communityKey(r)===selection.community);chip('小区：'+label(r?.community),()=>selection.community='');}
 if(selection.unitRange){const [lo,hi]=selection.unitRange;chip('单价：'+(hi===Infinity?'≥'+fmt(lo):fmt(lo)+'–<'+fmt(hi))+'元/㎡',()=>selection.unitRange=null);}
 if(selection.mapCell)chip('地图：选中网格',()=>selection.mapCell=null);
 if(!box.childNodes.length)box.append(html('span','interaction-hint','悬停查看数值 · 点击图表联动筛选 · 点击散点查看房源'));
}
function tableRows(){if(!tableSort.key)return filtered;const key=tableSort.key;return filtered.slice().sort((a,b)=>(Number(a[key])-Number(b[key]))*tableSort.direction||String(a.listing_id).localeCompare(String(b.listing_id)));}
function showListing(r){const list=tableRows(),index=list.findIndex(x=>x.listing_id===r.listing_id);selectedListing=r.listing_id;page=Math.max(0,Math.floor(index/20));drawDetails();if(!$('details').open)$('details').showModal();$('detailBody').querySelector('.selected-listing')?.scrollIntoView({block:'nearest'});}
function regression(list){const a=list.filter(r=>finite(r.area_sqm)&&finite(r.total_price_wan));const n=a.length;if(n<2)return null;const mx=a.reduce((v,r)=>v+Number(r.area_sqm),0)/n,my=a.reduce((v,r)=>v+Number(r.total_price_wan),0)/n;const xx=a.reduce((v,r)=>v+(r.area_sqm-mx)**2,0);if(!xx)return null;const slope=a.reduce((v,r)=>v+(r.area_sqm-mx)*(r.total_price_wan-my),0)/xx,intercept=my-slope*mx;const ss=a.reduce((v,r)=>v+(r.total_price_wan-my)**2,0),se=a.reduce((v,r)=>v+(r.total_price_wan-intercept-slope*r.area_sqm)**2,0);return {n,slope,intercept,r_squared:ss?1-se/ss:null};}
function bars(id,groups,kind='count',twoColumns=false){
 if(!groups.length)return empty(id);
 const w=$(id).clientWidth,h=$(id).clientHeight,s=chart(id,w,h);
 twoColumns=twoColumns&&w>620;
 const cols=twoColumns?2:1,per=Math.ceil(groups.length/cols),gap=twoColumns?36:0,cw=(w-gap)/cols;
 const price=kind==='price',labelWidth=id==='communityChart'?Math.min(180,cw*.39):price?107:52;
 const valueWidth=price?143:52,barWidth=Math.max(20,cw-labelWidth-valueWidth),max=Math.max(...groups.map(g=>g.value),1);
 const rowHeight=Math.min(42,h/per),offset=(h-rowHeight*per)/2;
 groups.forEach((g,i)=>{
  const col=Math.floor(i/per),row=i%per,x=col*(cw+gap),y=offset+row*rowHeight+rowHeight/2;
  const maxChars=Math.floor((labelWidth-10)/13),name=g.name.length>maxChars?g.name.slice(0,maxChars-1)+'…':g.name;
  s.append(tip(node('text',{x,y:y+4},name),g.name));
  s.append(node('rect',{x:x+labelWidth,y:y-5,width:barWidth,height:10,rx:3,fill:'#1d3645'}));
  const bar=node('rect',{x:x+labelWidth,y:y-5,width:Math.max(1,g.value/max*barWidth),height:10,rx:3,fill:price?'#71b3ee':'#53cbb8'});
  tip(bar,g.name+'：'+fmt(g.value)+(price?' 元/㎡':' 条')+(g.n?'；样本 '+g.n+' 条':''));s.append(bar);
  s.append(node('text',{x:x+cw-(price?76:1),y:y+4,'text-anchor':'end',class:'chart-value'},fmt(g.value)));
  if(price)s.append(node('text',{x:x+cw-1,y:y+4,'text-anchor':'end',class:'sample-count'},'n='+g.n));
  const target=node('rect',{x,y:y-rowHeight/2,width:cw,height:rowHeight,fill:'transparent',class:'bar-hit'});
  const type=id==='regionChart'?'region':id==='directionChart'?'orientation':'community',value=g.key||g.name;
  target.dataset.filterValue=value;
  tip(target,g.name+'\n'+(price?'单价中位数 '+fmt(g.value)+' 元/㎡\n样本 '+g.n+' 条':'样本 '+fmt(g.value)+' 条')+'\n点击联动筛选，再次点击取消');
  action(target,'筛选'+g.name,()=>changeChartFilter(type,value));s.append(target);

 });
}
function drawRooms(){
 const groups=group(filtered,r=>r.__room).sort((a,b)=>(a[0]??99)-(b[0]??99));if(!groups.length)return empty('roomChart');
 const w=$('roomChart').clientWidth,h=$('roomChart').clientHeight,s=chart('roomChart',w,h),cx=w*.25,cy=h/2,r=Math.min(w*.18,h*.36),total=filtered.length,stroke=Math.max(17,r*.26);
 let start=-Math.PI/2;
 groups.forEach(([k,a],i)=>{
  const end=start+a.length/total*2*Math.PI,large=end-start>Math.PI?1:0;let part;
  if(groups.length===1)part=node('circle',{cx,cy,r,fill:'none',stroke:COLORS[i],'stroke-width':stroke});
  else{const p1=[cx+r*Math.cos(start),cy+r*Math.sin(start)],p2=[cx+r*Math.cos(end),cy+r*Math.sin(end)];part=node('path',{d:'M '+p1.join(' ')+' A '+r+' '+r+' 0 '+large+' 1 '+p2.join(' '),fill:'none',stroke:COLORS[i%COLORS.length],'stroke-width':stroke});}
  tip(part,roomName(k)+'：'+a.length+' 条（'+fmt(a.length/total*100,1)+'%）\n点击筛选该户型');action(part,'筛选'+roomName(k),()=>changeChartFilter('room',k));part.dataset.room=String(k);s.append(part);
  const y=cy-(groups.length-1)*19+i*38,lx=w*.52;
  s.append(node('rect',{x:lx,y:y-7,width:8,height:8,rx:2,fill:COLORS[i%COLORS.length]}),node('text',{x:lx+16,y},roomName(k)),node('text',{x:w-2,y,'text-anchor':'end',class:'chart-value'},fmt(a.length/total*100,1)+'%'));
  const hit=node('rect',{x:lx-6,y:y-22,width:w-lx+6,height:33,fill:'transparent'});tip(hit,roomName(k)+'：'+a.length+' 条；点击筛选');action(hit,'按'+roomName(k)+'筛选',()=>changeChartFilter('room',k));s.append(hit);
  start=end;
 });
 s.append(node('text',{x:cx,y:cy,'text-anchor':'middle',style:'font-size:28px;fill:#edf4fa'},fmt(total)),node('text',{x:cx,y:cy+25,'text-anchor':'middle'},'样本房源'));
}

function drawScatter(){
 const list=filtered.filter(r=>finite(r.area_sqm)&&finite(r.total_price_wan)),fit=regression(list);
 $('regressionLabel').textContent=fit&&fit.r_squared!==null?'样本内 R² '+fit.r_squared.toFixed(3):'';if(!list.length)return empty('scatterChart');
 const w=$('scatterChart').clientWidth,h=$('scatterChart').clientHeight,s=chart('scatterChart',w,h),left=55,right=15,top=24,bottom=44,xmax=Math.max(...list.map(r=>+r.area_sqm))*1.08,ymax=Math.max(...list.map(r=>+r.total_price_wan))*1.1;
 const x=v=>left+v/xmax*(w-left-right),y=v=>h-bottom-v/ymax*(h-top-bottom);
 for(let i=0;i<=4;i++){const xx=xmax*i/4,yy=ymax*i/4;line(s,left,y(yy),w-right,y(yy),'#263b50');s.append(node('text',{x:left-9,y:y(yy)+4,'text-anchor':'end'},fmt(yy)),node('text',{x:x(xx),y:h-bottom+19,'text-anchor':'middle'},fmt(xx)));}
 line(s,left,top,left,h-bottom);line(s,left,h-bottom,w-right,h-bottom);
 const pts=list.map(r=>({r,x:x(r.area_sqm),y:y(r.total_price_wan)}));
 for(const p of pts)s.append(node('circle',{cx:p.x,cy:p.y,r:2.4,fill:'#48d4c3',opacity:.38,'pointer-events':'none'}));
 if(fit){let lo=0,hi=xmax;if(fit.slope!==0){const a=(0-fit.intercept)/fit.slope,b=(ymax-fit.intercept)/fit.slope;lo=Math.max(0,Math.min(a,b));hi=Math.min(xmax,Math.max(a,b));}if(lo<=hi&&fit.intercept+fit.slope*lo>=-.001&&fit.intercept+fit.slope*hi<=ymax+.001)line(s,x(lo),y(fit.intercept+fit.slope*lo),x(hi),y(fit.intercept+fit.slope*hi),'#ffbf70',{'stroke-width':2});}
 const ring=node('circle',{r:6,fill:'none',stroke:'#fff','stroke-width':2,visibility:'hidden','pointer-events':'none'});s.append(ring);
 const surface=node('rect',{x:left,y:top,width:w-left-right,height:h-top-bottom,fill:'transparent',class:'scatter-surface'});let nearest=-1;
 const show=(index,cx,cy)=>{nearest=index;const p=pts[index];ring.setAttribute('cx',p.x);ring.setAttribute('cy',p.y);ring.setAttribute('visibility','visible');surface.dataset.listingId=p.r.listing_id;showTip(label(p.r.community)+' · '+label(p.r.layout)+'\n面积 '+fmt(p.r.area_sqm,2)+' ㎡\n挂牌总价 '+fmt(p.r.total_price_wan,1)+' 万元\n单价 '+fmt(p.r.unit_price_yuan)+' 元/㎡\n编号 '+p.r.listing_id+'\n点击查看该房源明细',cx,cy);};
 const seek=e=>{const b=s.getBoundingClientRect(),px=(e.clientX-b.left)*w/b.width,py=(e.clientY-b.top)*h/b.height,reach=e.pointerType==='touch'?26:15;let best=-1,dist=reach**2;pts.forEach((p,i)=>{const d=(p.x-px)**2+(p.y-py)**2;if(d<dist){dist=d;best=i;}});if(best<0){nearest=-1;delete surface.dataset.listingId;ring.setAttribute('visibility','hidden');hideTip();}else show(best,e.clientX,e.clientY);};
 surface.addEventListener('pointermove',seek);surface.addEventListener('pointerdown',seek);surface.addEventListener('pointerleave',()=>{ring.setAttribute('visibility','hidden');hideTip();});
 action(surface,'散点图：方向键选择房源，回车查看明细',()=>{if(nearest>=0)showListing(pts[nearest].r);});
 surface.addEventListener('keydown',e=>{if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(e.key)){e.preventDefault();const i=(Math.max(0,nearest)+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1)+pts.length)%pts.length,b=s.getBoundingClientRect();show(i,b.left+pts[i].x*b.width/w,b.top+pts[i].y*b.height/h);}});
 surface.addEventListener('focus',()=>{if(nearest<0){const b=s.getBoundingClientRect();show(0,b.left+pts[0].x,b.top+pts[0].y);}});s.append(surface);
 s.append(node('text',{x:w-right,y:h-5,'text-anchor':'end'},'面积 / ㎡'),node('text',{x:left,y:12},'总价 / 万元'));
}
// Source coordinates are preserved. The following standard display conversion is approximate.
function wgs84(lng,lat,system){const type=String(system||'').toLowerCase().replace(/[-_]/g,'');if(type==='bd09'||type==='bd09ll'){const x=lng-.0065,y=lat-.006,z=Math.sqrt(x*x+y*y)-.00002*Math.sin(y*Math.PI*3000/180),theta=Math.atan2(y,x)-.000003*Math.cos(x*Math.PI*3000/180);lng=z*Math.cos(theta);lat=z*Math.sin(theta);}else if(type==='wgs84'||type==='epsg4326')return [lng,lat];else if(type!=='gcj02')return null;
 const a=6378245,ee=.00669342162296594323,x=lng-105,y=lat-35;let dlat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x)),dlng=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));dlat+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3+(20*Math.sin(y*Math.PI)+40*Math.sin(y/3*Math.PI))*2/3+(160*Math.sin(y/12*Math.PI)+320*Math.sin(y*Math.PI/30))*2/3;dlng+=(20*Math.sin(6*x*Math.PI)+20*Math.sin(2*x*Math.PI))*2/3+(20*Math.sin(x*Math.PI)+40*Math.sin(x/3*Math.PI))*2/3+(150*Math.sin(x/12*Math.PI)+300*Math.sin(x/30*Math.PI))*2/3;const rad=lat/180*Math.PI,magic=1-ee*Math.sin(rad)**2,sqrt=Math.sqrt(magic);return [lng-dlng*180/(a/sqrt*Math.cos(rad)*Math.PI),lat-dlat*180/(a*(1-ee)/(magic*sqrt)*Math.PI)];}
function located(list){return list.map(r=>{if(!finite(r.__mapLongitude)||!finite(r.__mapLatitude))return null;const p=wgs84(+r.__mapLongitude,+r.__mapLatitude,r.__mapCoordinateSystem);return p&&p[0]>113.5&&p[0]<115&&p[1]>29.5&&p[1]<31.5?{row:r,lng:p[0],lat:p[1]}:null;}).filter(Boolean);}
const mapAll=located(rows), STEP=.005;
for(const p of mapAll)p.row.__mapCell=Math.floor(p.lng/STEP)+','+Math.floor(p.lat/STEP);
// Keep the original WGS84 grid IDs for reproducible filtering. Only the
// display is handled by Baidu: source positions are already BD09; polygons
// declare WGS84 so JSAPI 4.0 performs its own coordinate conversion.
let baiduMap=null, mapReady=null, mapError='', mapOverlays=[], mapLabels=[], mapNeedsFit=true;
const mapMessage=html('div','map-message');mapMessage.setAttribute('role','status');
const mapCanvas=html('div','baidu-map');mapCanvas.id='baiduMap';
$('mapChart').append(mapCanvas,mapMessage);
function mapNotice(message){mapMessage.textContent=message;mapMessage.hidden=!message;}
function ramp(t){const a=mode==='price'?[65,137,212]:[38,111,146],b=mode==='price'?[255,185,88]:[96,243,193];return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');}
function updateMapControls(){for(const id of ['mapZoomIn','mapZoomOut','mapReset'])$(id).disabled=!baiduMap;if(baiduMap){$('mapZoomIn').disabled=baiduMap.getZoom()>=19;$('mapZoomOut').disabled=baiduMap.getZoom()<=10;}}
function fitMap(){if(!baiduMap||!mapAll.length)return;baiduMap.setViewport(mapAll.map(p=>new BMap.Point(+p.row.__mapLongitude,+p.row.__mapLatitude)),{margins:[40,35,35,35],enableAnimation:false});mapNeedsFit=false;}
function placeMapLabels(){if(!baiduMap)return;const placed=[],w=mapCanvas.clientWidth,h=mapCanvas.clientHeight;for(const {label:mark,point,title}of mapLabels){const p=baiduMap.pointToPixel(point),tw=title.length*11+14;let found=null;for(const [dx,dy]of [[6,-23],[6,8],[-tw-6,-23],[-tw-6,8]]){const b={x:p.x+dx,y:p.y+dy,w:tw,h:24};if(b.x<4||b.y<42||b.x+b.w>w-4||b.y+b.h>h-30)continue;if(placed.some(a=>b.x<a.x+a.w+8&&b.x+b.w+8>a.x&&b.y<a.y+a.h+5&&b.y+b.h+5>a.y))continue;found={...b,dx,dy};break;}if(found){placed.push(found);mark.setOffset(new BMap.Size(found.dx,found.dy));mark.show();}else mark.hide();}}
function loadBaiduMap(){
 if(mapReady)return mapReady;
 mapReady=new Promise((resolve,reject)=>{
  const ak=window.DONGHU_MAP_CONFIG?.ak;
  if(!ak){reject(new Error('尚未配置百度地图 AK'));return;}
  const timer=setTimeout(()=>reject(new Error('百度地图加载超时，请检查网络或 AK 域名白名单')),20000);
  window.initDonghuBaiduMap=()=>{clearTimeout(timer);resolve();};
  const script=document.createElement('script');script.src='https://api.map.baidu.com/api?v=4.0&ak='+encodeURIComponent(ak)+'&callback=initDonghuBaiduMap';
  script.onerror=()=>{clearTimeout(timer);reject(new Error('百度地图加载失败，请检查网络连接'));};document.head.append(script);
 }).then(()=>{
  baiduMap=new BMap.Map(mapCanvas,{minZoom:10,maxZoom:19,enableAutoResize:true,enableWheelZoom:true,enableKeyboard:true,enableRotate:false,enableTilt:false,enableMapClick:false});
  baiduMap.centerAndZoom(new BMap.Point(114.45,30.47),11);
  baiduMap.setMapStyle({styleJson:[
   {featureType:'land',elementType:'geometry',stylers:{color:'#102632ff'}},
   {featureType:'water',elementType:'geometry',stylers:{color:'#153c50ff'}},
   {featureType:'green',elementType:'geometry',stylers:{color:'#1b393bff'}},
   {featureType:'building',elementType:'geometry',stylers:{color:'#203c49ff'}},
   {featureType:'road',elementType:'geometry',stylers:{color:'#36525eff'}},
   {featureType:'all',elementType:'labels.text.fill',stylers:{color:'#a9c1cdff'}},
   {featureType:'all',elementType:'labels.text.stroke',stylers:{color:'#102632ff'}},
   {featureType:'poilabel',elementType:'labels.icon',stylers:{visibility:'off'}}
  ]});
  baiduMap.addEventListener('zoomend',()=>{updateMapControls();placeMapLabels();});
  baiduMap.addEventListener('moveend',placeMapLabels);
  baiduMap.addEventListener('dragstart',hideTip);
  mapCanvas.addEventListener('pointerleave',hideTip);
  fitMap();updateMapControls();
  $('mapChart').dataset.provider='baidu';
  drawMap();
 }).catch(error=>{mapError=error.message;mapNotice(mapError);$('mapStatus').textContent='地图暂不可用';updateMapControls();});
 return mapReady;
}
function drawMap(){
 const points=mapAll.filter(p=>filtered.includes(p.row));
 $('mapCoverage').textContent='已定位 '+fmt(points.length)+' / '+fmt(filtered.length)+' 条';
 const projectCount=points.filter(p=>p.row.__mapLevel==='项目级').length;
 $('mapLocationNote').textContent=projectCount?(projectCount===points.length?'当前'+projectCount+'条均为项目级位置':'小区级定位为主 · '+projectCount+'条为项目级位置'):'同小区房源按小区位置汇总';
 $('mapLegend').replaceChildren();
 $('mapGrid').textContent='约500米网格 · '+(mode==='price'?'挂牌单价中位数':'采集房源数量');
 if(!baiduMap){mapNotice(mapError||'正在加载百度地图…');$('mapStatus').textContent=mapError?'地图暂不可用':'百度地图加载中';loadBaiduMap();return;}
 for(const overlay of mapOverlays){baiduMap.removeOverlay(overlay);overlay.dispose?.();}mapOverlays=[];mapLabels=[];
 if(!points.length){mapNotice(filtered.length?'当前样本暂无已核验坐标':'当前筛选暂无样本');$('mapStatus').textContent='百度地图 · 暂无定位样本';return;}
 mapNotice('');
 const groups=group(points,p=>p.row.__mapCell),values=groups.map(([,a])=>mode==='count'?a.length:median(a.map(p=>p.row.unit_price_yuan))).filter(finite),low=Math.min(...values),high=Math.max(...values);
 const add=overlay=>{baiduMap.addOverlay(overlay);mapOverlays.push(overlay);};
 const showMapTip=(text,e)=>{const b=mapCanvas.getBoundingClientRect(),pixel=e.pixel||baiduMap.pointToPixel(e.latLng||e.point);if(pixel)showTip(text,b.left+pixel.x,b.top+pixel.y);};
 for(const [key,a]of groups){
  const value=mode==='count'?a.length:median(a.map(p=>p.row.unit_price_yuan));if(value===null)continue;
  const [gx,gy]=key.split(',').map(Number),corners=[[gx*STEP,gy*STEP],[(gx+1)*STEP,gy*STEP],[(gx+1)*STEP,(gy+1)*STEP],[gx*STEP,(gy+1)*STEP]];
  const polygon=new BMap.Polygon(corners.map(p=>new BMap.Point(...p)),{coordType:'BMAP_COORD_WGS84',fillColor:ramp(high===low?.65:(value-low)/(high-low)),fillOpacity:.72,strokeColor:selection.mapCell===key?'#ffffff':'#83b5bd',strokeWeight:selection.mapCell===key?3:1,strokeOpacity:.8});
  const names=[...new Set(a.map(p=>label(p.row.community)))],text=names.slice(0,8).join('、')+(names.length>8?'等':'')+'\n样本 '+a.length+' 条\n'+(mode==='price'?'单价中位数 '+fmt(value)+' 元/㎡':'采集数量 '+fmt(value)+' 条')+'\n按小区位置汇总'+(a.some(p=>p.row.__mapLevel==='项目级')?'（含项目级位置）':'')+'\n点击筛选，再次点击取消';
  polygon.addEventListener('mousemove',e=>showMapTip(text,e));polygon.addEventListener('mouseout',hideTip);
  polygon.addEventListener('click',()=>{hideTip();changeChartFilter('mapCell',key);});add(polygon);
 }
 const communities=group(points,p=>communityKey(p.row)).sort((a,b)=>b[1].length-a[1].length);
 for(const [,a]of communities.slice(0,8)){
  const p=a[0],title=label(p.row.community),marker=new BMap.Label(title,{position:new BMap.Point(+p.row.__mapLongitude,+p.row.__mapLatitude),offset:new BMap.Size(5,-18)});
  marker.setStyle({color:'#eef7fa',backgroundColor:'#102632df',border:'1px solid #4b7584',borderRadius:'3px',padding:'3px 6px',fontSize:'11px',lineHeight:'16px',cursor:'pointer'});
  marker.addEventListener('click',()=>changeChartFilter('community',communityKey(p.row)));add(marker);mapLabels.push({label:marker,point:new BMap.Point(+p.row.__mapLongitude,+p.row.__mapLatitude),title});
 }
 const r=html('div','legend-ramp');r.style.background='linear-gradient(90deg,'+ramp(0)+','+ramp(1)+')';$('mapLegend').append(html('span','',fmt(low)),r,html('span','',fmt(high)),html('span','',mode==='price'?'元 / ㎡':'条'));
 $('mapStatus').textContent='百度地图 · 拖动平移 / 滚轮缩放';
 $('mapChart').dataset.gridCount=String(groups.length);
 if(mapNeedsFit)fitMap();updateMapControls();placeMapLabels();
}
function drawDetails(){const body=$('detailBody');body.replaceChildren();document.querySelectorAll('[data-sort]').forEach(b=>{b.parentElement.setAttribute('aria-sort',tableSort.key===b.dataset.sort?(tableSort.direction===1?'ascending':'descending'):'none');b.querySelector('span').textContent=tableSort.key===b.dataset.sort?(tableSort.direction===1?' ↑':' ↓'):' ↕';});const count=20,start=page*count;for(const r of tableRows().slice(start,start+count)){const tr=html('tr',r.listing_id===selectedListing?'selected-listing':''),name=html('td');tr.dataset.listingId=r.listing_id;name.append(html('div','',r.community),html('small','listing-id',r.listing_id));tr.append(name);for(const value of [r.subdistrict_raw,r.layout,r.orientation,fmt(num(r.area_sqm),2),fmt(num(r.total_price_wan),1),fmt(num(r.unit_price_yuan))])tr.append(html('td','',value||'未标注'));const mark=html('td','',r.suspected_duplicate_group?'同条件疑似重复':r.occurrence_count>1?'同编号展示 '+r.occurrence_count+' 次':'—');tr.append(mark);const td=html('td');if(/^https:\/\//i.test(r.url||'')){const a=html('a','','查看 ↗');a.href=r.url;a.target='_blank';a.rel='noopener noreferrer';td.append(a);}else td.textContent='—';tr.append(td);body.append(tr);}if(!filtered.length){const td=html('td','','当前筛选暂无房源');td.colSpan=9;const tr=html('tr');tr.append(td);body.append(tr);}$('pageLabel').textContent='共 '+fmt(filtered.length)+' 条 · 第 '+(page+1)+' / '+Math.max(1,Math.ceil(filtered.length/count))+' 页';$('previousPage').disabled=page===0;$('nextPage').disabled=start+count>=filtered.length;}
function drawPrices(){
 if(!filtered.length)return empty('priceChart');
 const edges=[0,8000,12000,16000,20000,30000,Infinity],names=['<8千','8千–1.2万','1.2–1.6万','1.6–2万','2–3万','≥3万'];
 const counts=names.map((_,i)=>filtered.filter(r=>r.unit_price_yuan>=edges[i]&&r.unit_price_yuan<edges[i+1]).length),w=$('priceChart').clientWidth,h=$('priceChart').clientHeight,s=chart('priceChart',w,h),max=Math.max(...counts,1),cw=w/6,base=h-28,range=Math.max(20,h-54);
 for(let i=0;i<counts.length;i++){
  const x=cw*i+cw/2,height=counts[i]/max*range,bw=Math.min(46,cw*.57);
  const bar=node('rect',{x:x-bw/2,y:base-height,width:bw,height,rx:3,fill:i===2?'#edb875':'#50a8ac'});
  tip(bar,names[i]+' 元/㎡：'+counts[i]+' 条\n点击筛选该单价区间');if(counts[i])action(bar,'筛选单价'+names[i],()=>changeChartFilter('unitRange',[edges[i],edges[i+1]]));bar.dataset.unitRange=String(i);
  s.append(bar,node('text',{x,y:base-height-8,'text-anchor':'middle',class:'chart-value'},fmt(counts[i])),node('text',{x,y:h-7,'text-anchor':'middle',class:'bin-label'},names[i]));
 }line(s,0,base+1,w,base+1);
}
function render(resetPage=true){const search=$('search').value.trim().toLowerCase(),sub=$('subdistrict').value,rm=$('rooms').value,bound=id=>$(id).value.trim()===''?null:Number($(id).value),amin=bound('areaMin'),amax=bound('areaMax'),pmin=bound('priceMin'),pmax=bound('priceMax');hideTip();filtered=rows.filter(r=>chartSelectionMatches(r)&&(!search||String(r.community).toLowerCase().includes(search))&&(!sub||r.__region===sub)&&(!rm||r.__room===+rm)&&(amin===null||finite(r.area_sqm)&&r.area_sqm>=amin)&&(amax===null||finite(r.area_sqm)&&r.area_sqm<=amax)&&(pmin===null||finite(r.total_price_wan)&&r.total_price_wan>=pmin)&&(pmax===null||finite(r.total_price_wan)&&r.total_price_wan<=pmax));if(resetPage){page=0;selectedListing='';}renderSelections();$('metricCount').textContent=fmt(filtered.length);$('metricCommunities').textContent=fmt(new Set(filtered.map(communityKey)).size);$('metricUnit').textContent=fmt(median(filtered.map(r=>r.unit_price_yuan)),1);$('metricTotal').textContent=fmt(median(filtered.map(r=>r.total_price_wan)),1);$('metricArea').textContent=fmt(median(filtered.map(r=>r.area_sqm)),2);$('filterCount').textContent='显示 '+fmt(filtered.length)+' / '+fmt(rows.length)+' 条';bars('regionChart',group(filtered,r=>r.__region).map(([name,a])=>({name,value:median(a.map(r=>r.unit_price_yuan)),n:a.length})).filter(g=>g.value!==null).sort((a,b)=>b.value-a.value),'price');bars('directionChart',group(filtered,r=>label(r.orientation)).map(([name,a])=>({name,value:a.length})).sort((a,b)=>b.value-a.value));bars('communityChart',group(filtered,communityKey).map(([key,a])=>({name:label(a[0].community),key,value:a.length})).sort((a,b)=>b.value-a.value).slice(0,10),'count',true);drawRooms();drawScatter();drawMap();drawDetails();drawPrices();$('footerSummary').textContent='普通住宅挂牌样本 · 价格为挂牌价';}
for(const name of [...new Set(rows.map(r=>r.__region))].sort()){const o=html('option','',name);o.value=name;$('subdistrict').append(o);}const dates=data.observation_dates||[...new Set(rows.map(r=>r.observation_date).filter(Boolean))].sort();$('observation').textContent=dates.length?dates.join(' — ')+' · 北京时间':'暂无观察数据';$('filters').addEventListener('submit',e=>e.preventDefault());let inputTimer;$('filters').addEventListener('input',e=>{clearTimeout(inputTimer);if(e.target.tagName==='SELECT')render();else inputTimer=setTimeout(render,150);});$('filters').addEventListener('reset',()=>{clearTimeout(inputTimer);selection.orientation='';selection.community='';selection.unitRange=null;selection.mapCell=null;setTimeout(render,0);});for(const [id,value]of [['modePrice','price'],['modeCount','count']])$(id).addEventListener('click',()=>{mode=value;for(const [bid,m]of [['modePrice','price'],['modeCount','count']]){$(bid).classList.toggle('active',mode===m);$(bid).setAttribute('aria-pressed',String(mode===m));}drawMap();});$('detailsButton').addEventListener('click',()=>$('details').showModal());$('closeDetails').addEventListener('click',()=>$('details').close());$('previousPage').addEventListener('click',()=>{page--;drawDetails();});$('nextPage').addEventListener('click',()=>{page++;drawDetails();});$('download').addEventListener('click',()=>{const fields=[['房源编号','listing_id'],['小区','community'],['展示片区','__region'],['平台原片区','subdistrict_raw'],['户型','layout'],['朝向','orientation'],['面积（㎡）','area_sqm'],['挂牌总价（万元）','total_price_wan'],['挂牌单价（元/㎡）','unit_price_yuan'],['观察日期','observation_date'],['详情链接','url'],['同编号展示次数','occurrence_count'],['疑似重复组','suspected_duplicate_group'],['类型审核依据','type_basis'],['原坐标经度','longitude'],['原坐标纬度','latitude'],['原坐标系','coordinate_system'],['坐标证据链接','coordinate_source'],['坐标证据时间','coordinate_evidence_at'],['地图经度','__mapLongitude'],['地图纬度','__mapLatitude'],['地图坐标系','__mapCoordinateSystem'],['地图定位精度','__mapLevel'],['地图定位依据','__mapBasis'],['地图位置来源','__mapSource'],['地图位置证据时间','__mapEvidenceAt']];const csv=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const text='\uFEFF'+[fields.map(f=>csv(f[0])).join(','),...filtered.map(r=>fields.map(f=>csv(r[f[1]])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'})),a=html('a');a.href=url;a.download='东湖高新区房源_'+(dates[0]||'当前筛选')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('methodButton').addEventListener('click',()=>$('method').showModal());
$('closeMethod').addEventListener('click',()=>$('method').close());
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');setTimeout(()=>$('toast').classList.remove('visible'),2600);}
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('当前窗口不支持全屏，可在浏览器按 F11。');}});
document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'退出全屏 ↙':'全屏展示 ↗';});
for(const id of ['details','method'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});

for(const id of ['regionChart','roomChart','directionChart','communityChart','mapChart','priceChart','scatterChart'])$(id).setAttribute('role','group');
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{tableSort={key:b.dataset.sort,direction:tableSort.key===b.dataset.sort?-tableSort.direction:1};page=0;drawDetails();}));
$('mapZoomIn').addEventListener('click',()=>baiduMap?.zoomIn());
$('mapZoomOut').addEventListener('click',()=>baiduMap?.zoomOut());
$('mapReset').addEventListener('click',()=>{fitMap();hideTip();});
updateMapControls();
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(false),120);});render();
})();
