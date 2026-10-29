(() => {
  "use strict";
  const data = window.HOUSING_DATA;
  const $ = id => document.getElementById(id);
  if (!data || !Array.isArray(data.records)) {
    $("filterSummary").textContent = "样本数据暂未加载，请刷新页面后重试。";
    return;
  }
  const nf = new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 1});
  const colors = ["#366c86","#5e999e","#90b6b0","#c2cfc0","#b69e7c","#8a9fb7","#688b7b","#c3a8a2","#9eb3c6","#9d91af","#afbc94","#b9bac1"];
  const state = {district:"",orientation:"",query:"",sort:"default",page:1};
  const pageSize = 12;
  let filtered = [], timer;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svgEl = (tag, attrs = {}, text) => {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key,value]) => node.setAttribute(key,String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const valid = value => typeof value === "number" && Number.isFinite(value) && value > 0;
  const fmt = value => valid(value) ? nf.format(value) : "—";
  function median(rows,key) {
    const values = rows.map(r => r[key]).filter(valid).sort((a,b) => a-b);
    const n = values.length;
    return n ? (values[Math.floor(n/2)] + values[Math.floor((n-1)/2)])/2 : null;
  }
  function groups(rows,key) {
    const map = new Map();
    for (const row of rows) {
      const value = row[key] || "未标注";
      if (!map.has(value)) map.set(value,[]);
      map.get(value).push(row);
    }
    return [...map];
  }
  function empty(container,message) {
    container.replaceChildren(el("div","empty",message || "当前筛选条件下暂无样本"));
  }
  function bar(container,label,value,max,title) {
    const row = el("div","bar-row");
    row.title = title;
    const track = el("div","bar-track"), fill = el("div","bar-fill");
    fill.style.width = (max ? value/max*100 : 0) + "%";
    track.append(fill);
    row.append(el("span","bar-label",label),track,el("span","bar-value",nf.format(value)));
    container.append(row);
  }
  function renderDistrict() {
    const box = $("districtChart");
    const values = groups(filtered,"district").map(([name,rows]) => ({name,median:median(rows,"unit_price_yuan"),n:rows.length})).sort((a,b)=>b.median-a.median);
    if (!values.length) return empty(box);
    box.replaceChildren();
    values.forEach(r => bar(box,r.name,r.median,values[0].median,r.name + " · 单价中位数 " + fmt(r.median) + " 元/㎡ · " + r.n + " 条样本"));
  }
  function renderOrientation() {
    const box = $("orientationChart"), values = groups(filtered,"orientation").sort((a,b)=>b[1].length-a[1].length);
    if (!values.length) return empty(box);
    box.replaceChildren();
    const svg = svgEl("svg",{viewBox:"0 0 160 160",class:"donut-svg","aria-hidden":"true"});
    const radius = 59, length = 2*Math.PI*radius;
    let offset = 0;
    const legend = el("div","donut-legend");
    values.forEach(([name,rows],i) => {
      const share = rows.length/filtered.length, color = colors[i%colors.length];
      const percent = share*100 < 0.1 ? "＜0.1%" : (share*100).toFixed(1)+"%";
      const circle = svgEl("circle",{cx:80,cy:80,r:radius,fill:"none",stroke:color,"stroke-width":17,"stroke-dasharray":share*length+" "+length,"stroke-dashoffset":-offset});
      circle.append(svgEl("title",{},name+"："+rows.length+"条，占"+percent));
      svg.append(circle);offset+=share*length;
      const row = el("div","legend-row"), swatch = el("span","swatch");
      swatch.style.background = color;
      row.append(swatch,el("span","",name),el("span","legend-value",percent));
      row.title = name+"："+rows.length+"条";
      legend.append(row);
    });
    const center = svgEl("g",{transform:"rotate(90 80 80)"});
    center.append(svgEl("text",{x:80,y:80,"text-anchor":"middle",class:"donut-number"},nf.format(filtered.length)),svgEl("text",{x:80,y:99,"text-anchor":"middle",class:"donut-label"},"条发布记录"));
    svg.append(center);box.append(svg,legend);
  }
  function renderScatter() {
    const box = $("scatterChart"), rows = filtered.filter(r=>valid(r.area_sqm)&&valid(r.total_price_wan));
    if (!rows.length) return empty(box);
    box.replaceChildren();
    const width=620,height=300,left=55,right=19,top=26,bottom=44;
    const xmax=Math.ceil(Math.max(...rows.map(r=>r.area_sqm))*1.05/50)*50;
    const ymax=Math.ceil(Math.max(...rows.map(r=>r.total_price_wan))*1.05/100)*100;
    const sx=x=>left+x/xmax*(width-left-right);
    const sy=y=>height-bottom-y/ymax*(height-top-bottom);
    const svg=svgEl("svg",{viewBox:"0 0 "+width+" "+height,class:"scatter-svg","aria-label":rows.length+"条样本的建筑面积与挂牌总价分布"});
    for(let i=0;i<=4;i++){
      const x=xmax*i/4,y=ymax*i/4;
      svg.append(svgEl("line",{x1:left,y1:sy(y),x2:width-right,y2:sy(y),stroke:"#e8eef1","stroke-dasharray":"3 4"}));
      svg.append(svgEl("text",{x:left-8,y:sy(y)+3,"text-anchor":"end"},nf.format(y)));
      svg.append(svgEl("text",{x:sx(x),y:height-bottom+19,"text-anchor":"middle"},nf.format(x)));
    }
    svg.append(svgEl("text",{x:left,y:13,class:"axis-title"},"挂牌总价 / 万元"),svgEl("text",{x:width-right,y:height-4,"text-anchor":"end",class:"axis-title"},"建筑面积 / ㎡"));
    const tip=el("div","scatter-tooltip");tip.hidden=true;
    rows.forEach(row=>{
      const text=(row.community||"未标注小区")+" · "+row.district+" · "+fmt(row.area_sqm)+"㎡ · "+fmt(row.total_price_wan)+"万元";
      const point=svgEl("circle",{cx:sx(row.area_sqm),cy:sy(row.total_price_wan),r:3.3,class:"scatter-point"});
      point.append(svgEl("title",{},text));
      point.addEventListener("pointerenter",()=>{
        tip.textContent=text;tip.hidden=false;
        const pos=point.getBoundingClientRect(),parent=box.getBoundingClientRect();
        tip.style.left=Math.max(4,Math.min(pos.left-parent.left+8,parent.width-tip.offsetWidth-4))+"px";
        tip.style.top=Math.max(3,pos.top-parent.top-tip.offsetHeight-8)+"px";
      });
      point.addEventListener("pointerleave",()=>{tip.hidden=true;});
      svg.append(point);
    });
    box.append(svg,tip);
  }
  function renderHistogram() {
    const box=$("histogramChart"), prices=filtered.map(r=>r.unit_price_yuan).filter(valid);
    if(!prices.length) return empty(box);
    box.replaceChildren();
    const bins=[["＜5,000",0,5000],["5,000–10,000",5000,10000],["10,000–15,000",10000,15000],["15,000–20,000",15000,20000],["20,000–25,000",20000,25000],["≥25,000",25000,Infinity]];
    const values=bins.map(([label,low,high])=>({label,n:prices.filter(v=>v>=low&&v<high).length}));
    const max=Math.max(...values.map(r=>r.n));
    values.forEach(r=>bar(box,r.label,r.n,max,r.label+"元/㎡："+r.n+"条样本"));
  }
  function renderHeatmap() {
    const box=$("heatmapChart");
    if(!filtered.length) return empty(box);
    const districts=[...new Set(filtered.map(r=>r.district))].sort((a,b)=>a.localeCompare(b,"zh-CN"));
    const orientations=groups(filtered,"orientation").sort((a,b)=>b[1].length-a[1].length).map(([name])=>name);
    const map=new Map();
    filtered.forEach(r=>{const key=r.district+"|"+r.orientation;if(!map.has(key))map.set(key,[]);map.get(key).push(r);});
    const cells=[...map.values()].map(rows=>median(rows,"unit_price_yuan")).filter(valid);
    const min=Math.min(...cells),max=Math.max(...cells);
    const table=el("table","heatmap"),head=el("thead"),tr=el("tr");
    tr.append(el("th","","区域 / 朝向"));
    orientations.forEach(name=>{const th=el("th","",name);th.scope="col";tr.append(th);});
    head.append(tr);table.append(head);
    const body=el("tbody");
    districts.forEach(district=>{
      const row=el("tr"),th=el("th","",district);th.scope="row";row.append(th);
      orientations.forEach(orientation=>{
        const list=map.get(district+"|"+orientation)||[], value=median(list,"unit_price_yuan"),td=el("td");
        if(valid(value)){
          const ratio=max===min ? 0.5 : (value-min)/(max-min);
          const red=Math.round(237-ratio*200),green=Math.round(244-ratio*145),blue=Math.round(245-ratio*122);
          td.style.background="rgb("+red+","+green+","+blue+")";td.style.color=ratio>.6?"#fff":"#466c7e";
          td.append(el("span","",nf.format(value)),el("small","","("+list.length+")"));
          td.title=district+" · "+orientation+" · "+list.length+"条 · 挂牌单价中位数 "+nf.format(value)+"元/㎡";
        }else{td.className="missing-cell";td.textContent="—";td.title=district+" · "+orientation+"：无样本";}
        row.append(td);
      });body.append(row);
    });table.append(body);box.replaceChildren(table);
  }
  function sourceUrl(value) {
    try{const url=new URL(value);return url.protocol==="https:"&&url.hostname==="m.fang.com"&&/^\/esf\/wuhan\/\d+_\d+\.html$/.test(url.pathname)?url.href:null;}
    catch{return null;}
  }
  function renderTable() {
    const body=$("tableBody");body.replaceChildren();
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    state.page=Math.min(Math.max(1,state.page),pages);
    $("tableCount").textContent=nf.format(filtered.length);
    if(!filtered.length){const row=el("tr"),td=el("td","empty","当前筛选条件下暂无样本，请调整筛选。");td.colSpan=8;row.append(td);body.append(row);}
    const start=(state.page-1)*pageSize;
    filtered.slice(start,start+pageSize).forEach(item=>{
      const row=el("tr"),name=el("td");
      const title=el("div","sample-title",item.community||"未标注小区");title.title=item.community||"未标注小区";
      const subtitle=el("div","sample-subtitle",item.title||"");subtitle.title=item.title||"";
      name.append(title,subtitle);
      if(item.suspected_duplicate)name.append(el("span","review-tag","疑似同房发布 · 待核对"));
      row.append(name,el("td","",item.district),el("td","",item.layout),el("td","price-cell",fmt(item.area_sqm)+"㎡"),el("td","price-cell strong",fmt(item.total_price_wan)+"万"),el("td","price-cell",fmt(item.unit_price_yuan)),el("td","",item.orientation));
      const td=el("td"),href=sourceUrl(item.url);
      if(href){const a=el("a","source-link","原页面 ↗");a.href=href;a.target="_blank";a.rel="noopener noreferrer";a.setAttribute("aria-label","查看"+(item.community||"房源")+"的公开来源页面");td.append(a);}else td.textContent="—";
      row.append(td);body.append(row);
    });
    $("pageSummary").textContent=filtered.length?"第 "+nf.format(start+1)+"—"+nf.format(Math.min(start+pageSize,filtered.length))+" 条，共 "+nf.format(filtered.length)+" 条":"共 0 条样本";
    $("pageNumber").textContent=state.page+" / "+pages;
    $("prevPage").disabled=state.page===1;$("nextPage").disabled=state.page===pages;
  }
  function render() {
    const query=state.query.trim().toLocaleLowerCase();
    filtered=data.records.filter(r=>(!state.district||r.district===state.district)&&(!state.orientation||r.orientation===state.orientation)&&(!query||((r.community||"")+" "+(r.title||"")).toLocaleLowerCase().includes(query)));
    if(state.sort!=="default"){const [key,order]=state.sort.split(":");filtered.sort((a,b)=>(a[key]-b[key])*(order==="asc"?1:-1));}
    $("countMetric").textContent=nf.format(filtered.length);
    $("unitMetric").textContent=fmt(median(filtered,"unit_price_yuan"));
    $("totalMetric").textContent=fmt(median(filtered,"total_price_wan"));
    $("areaMetric").textContent=fmt(median(filtered,"area_sqm"));
    const labels=[state.district,state.orientation,state.query.trim()&&"关键词："+state.query.trim()].filter(Boolean);
    $("filterSummary").textContent=(labels.length?"当前筛选："+labels.join(" · "):"全部研究样本")+" · "+nf.format(filtered.length)+" 条发布记录";
    $("exportButton").disabled=!filtered.length;
    renderDistrict();renderOrientation();renderScatter();renderHistogram();renderHeatmap();renderTable();
  }
  function csvCell(value) {
    let text=String(value??"");
    if(/^[=+\-@\t\r]/.test(text))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }
  function download() {
    const columns=[["community","小区"],["district","区域"],["layout","户型"],["area_sqm","建筑面积_平方米"],["total_price_wan","挂牌总价_万元"],["unit_price_yuan","挂牌单价_元每平方米"],["orientation","朝向"],["suspected_duplicate","疑似同房发布待核对"],["url","公开来源"]];
    const lines=[columns.map(c=>csvCell(c[1])).join(",")];
    filtered.forEach(row=>lines.push(columns.map(([key])=>csvCell(key==="suspected_duplicate"?(row[key]?"是":""):row[key])).join(",")));
    const url=URL.createObjectURL(new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"}));
    const link=el("a");link.href=url;link.download="武汉二手房样本_"+data.date+".csv";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    $("toast").textContent="已导出 "+filtered.length+" 条筛选样本";$("toast").classList.add("visible");clearTimeout(timer);timer=setTimeout(()=>$("toast").classList.remove("visible"),2800);
  }
  $("heroCount").textContent=nf.format(data.records.length);
  $("heroRegions").textContent=Object.keys(data.region_counts).length;
  $("observationDate").textContent=data.date.replaceAll("-",".");
  const q=data.quality;
  $("rawCount").textContent=nf.format(q.input_records);
  $("cleanCount").textContent=nf.format(q.cleaned_listing_records);
  $("excludedCount").textContent=q.identity_duplicates_removed+" / "+q.invalid_records_excluded;
  $("reviewCount").textContent=q.suspected_duplicate_groups+"组 · "+q.suspected_duplicate_records+"条";
  $("duplicateNote").textContent=q.suspected_duplicate_groups+"组、"+q.suspected_duplicate_records+"条记录在区域、小区、户型、面积、朝向和总价上相同，但发布编号不同。仅标记待核对，不直接合并成一套住宅。";
  ["district","orientation"].forEach(key=>{
    [...new Set(data.records.map(r=>r[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"zh-CN")).forEach(value=>$(key+"Filter").append(new Option(value,value)));
    $(key+"Filter").addEventListener("change",event=>{state[key]=event.target.value;state.page=1;render();});
  });
  let searchTimer;
  $("searchInput").addEventListener("input",event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.query=event.target.value;state.page=1;render();},140);});
  $("filters").addEventListener("submit",event=>event.preventDefault());
  $("filters").addEventListener("reset",()=>{clearTimeout(searchTimer);Object.assign(state,{district:"",orientation:"",query:"",page:1});setTimeout(render,0);});
  $("sortSelect").addEventListener("change",event=>{state.sort=event.target.value;state.page=1;render();});
  $("prevPage").addEventListener("click",()=>{state.page--;renderTable();});
  $("nextPage").addEventListener("click",()=>{state.page++;renderTable();});
  $("exportButton").addEventListener("click",download);
  if("IntersectionObserver" in window){const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting)document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("active",a.hash==="#"+entry.target.id));});},{rootMargin:"-15% 0px -65% 0px"});document.querySelectorAll("main section[id]").forEach(section=>observer.observe(section));}
  render();
})();
