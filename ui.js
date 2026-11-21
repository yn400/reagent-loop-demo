import { api } from './demo.js';
const app=document.getElementById('app');
const notice=document.getElementById('notice');
let state={}, tab='home', selected='', candidateRows=[], filter='', kind='all', timer;
const h=(t='')=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const icon=(name)=>`<span class="icon" aria-hidden="true">${({home:'▦',requests:'≡',inventory:'▤',records:'↧',admin:'⚙',arrow:'→',refresh:'↻',brand:'↔'})[name]||'·'}</span>`;
const dateTime=(t)=>t?new Intl.DateTimeFormat('zh-CN',{dateStyle:'short',timeStyle:'short'}).format(new Date(t)):'—';
const yuan=(c)=>c===undefined?'—':'¥'+(c/100).toFixed(2);
const role=()=>state.user?.role;
const product=(sku)=>state.catalog.find(i=>i.sku===sku)||{name:sku,spec:'',unit:''};
const actions={createRequest:'登记申购',reserve:'核实并暂留',noMatch:'记录为无货',approve:'确认核准',reject:'退回申请',cancel:'确认撤销',dispatch:'确认出库',receive:'确认签收',resolveHandoff:'记录差异并释放暂留',backfill:'确认库存台账回填',close:'保存并归档',saveItem:'保存品类',saveLot:'保存库存',saveUser:'保存账号'};
const steps=[['pending','登记'],['reserved','查库'],['approved','审核'],['received','交接'],['closed','归档']];
const stepIndex={pending:0,reserved:1,approved:2,received:3,closed:4,no_match:1,rejected:2,cancelled:-1,expired:-1};

async function refresh() { state=await api('/api/state'); render(); }
function toast(text,error=false) {
  notice.textContent=text; notice.className=error?'shown error':'shown';
  clearTimeout(timer); timer=setTimeout(()=>notice.className='',4000);
}
function button(label,command,value='',secondary=true) {
  return `<button type="button" class="${secondary?'button secondary':'button'}" data-cmd="${command}" data-value="${h(value)}">${label}</button>`;
}
function field(label,name,value='',type='text',extra='') {
  return `<label><span>${label}</span><input name="${name}" type="${type}" value="${h(value)}" ${extra}></label>`;
}
function listField(label,name,choices,value='') {
  return `<label><span>${label}</span><select name="${name}">${choices.map(([key,label])=>`<option value="${h(key)}" ${key===value?'selected':''}>${h(label)}</option>`).join('')}</select></label>`;
}
function form(action,id,content) {
  return `<form class="action-form" data-action="${action}" data-id="${h(id)}"><div class="form-fields">${content}</div><button class="button" type="submit">${actions[action]}</button></form>`;
}
const items=()=>state.catalog.filter(i=>i.active).map(i=>[i.sku,i.sku+' · '+i.name+' · '+i.spec]);
function crumb(title,description,extra='') {
  return `<div class="section-title"><div><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;
}
function table(head,rows) {
  return `<div class="table-wrap"><table><thead><tr>${head.map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(x=>`<td>${x}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${head.length}" class="empty">暂无记录</td></tr>`}</tbody></table></div>`;
}
function status(r) { return `<span class="badge ${r.status}">${h(r.status==='received'&&r.ledger?'待申购回填':state.labels[r.status])}</span>`; }
function metrics(reqs) {
  let checking=0,approval=0,handoff=0,closed=0;
  for(const r of reqs) {
    if(r.status==='pending') checking++;
    if(r.status==='reserved') approval++;
    if(['approved','received'].includes(r.status)) handoff++;
    if(r.status==='closed') closed++;
  }
  return [checking,approval,handoff,closed];
}
function login() {
  app.innerHTML=`<main class="login"><div class="login-photo"><img src="./cover.png" alt="透明耗材盒与空白核对单"><div><p>高校实验耗材管理</p><h1>先查库存，<br>再定采购量。</h1></div></div><section class="login-form">
  <div class="brand"><span class="brand-mark">${icon('brand')}</span><span>试剂循环<small>耗材调剂工作台</small></span></div>
  <h2>试剂循环公开演示</h2>
  <p>选一个身份进入工作台。切换身份可以接着办理同一条需求。</p>
  ${state.centers.map(center=>`<section class="center-choice"><h3>${h(center.name)}</h3><div class="demo-roles">${state.personas.filter(person=>person.center===center.id).map(person=>button(h(state.roles[person.role]+(Object.hasOwn(state.roles,person.id)||person.id==='training-'+person.role?'':' · '+person.name)),'demo',person.id)).join('')}</div></section>`).join('')}
  <p class="fine">此页面只有演示数据。本标签页内保存操作记录，请使用虚构的名称与编号。</p>
  ${button('重置演示数据','reset')}</section></main>`;
}
function requestsTable(reqs) {
  return table(['需求与规格','需求实验室','原拟购量','最迟领用日','状态','办理'],reqs.map(r=>{
    const p=product(r.sku);
    return [`<strong>${h(p.name)}</strong><small>${h(r.id)} · ${h(p.spec)}</small>`,h(r.lab),h(r.qty+' '+p.unit),h(r.needBy),status(r),button('查看 '+icon('arrow'),'select',r.id)];
  }));
}
function home() {
  const m=metrics(state.requests),recent=[...state.requests].reverse().slice(0,5);
  return `${crumb('工作台总览','查看申购、审核和交接的办理进度。',role()==='applicant'?button('＋ 登记需求','nav','create',false):button('查看需求','nav','requests',false))}
  <section class="hero"><div><p>校内耗材调剂</p><h2>先查库存，再定采购量</h2><p>核实可拨数量 · 项目负责人审核 · 按实领量回填</p></div><img src="./cover.png" alt="台面上的耗材盒和核对单"></section>
  <div class="metrics">${['待查库','待审核','待交接或回填','已归档'].map((label,i)=>`<article><span>${label}</span><strong>${m[i]}</strong></article>`).join('')}</div>
  <section class="card"><div class="card-title"><h2>近期需求</h2>${button('查看全部','nav','requests')}</div>${requestsTable(recent)}</section>`;
}
function requests() {
  const q=filter.trim().toLowerCase();
  const rows=[...state.requests].reverse().filter(r=>[r.id,r.original,product(r.sku).name,r.sku,r.lab].some(f=>String(f).toLowerCase().includes(q))&&(kind==='all'||r.status===kind));
  return `${crumb('需求与查库','按需求编号查找原申购、库存候选和办理记录。',role()==='applicant'?button('＋ 登记需求','nav','create',false):'')}
  <section class="card"><form class="search" data-action="filter">${field('搜索需求','query',filter,'search','placeholder="编号、品名、货号或实验室"')}${listField('状态','kind',[['all','全部状态'],...Object.entries(state.labels)],kind)}<button class="button" type="submit">筛选</button></form>${requestsTable(rows)}</section>`;
}
function details(r) {
  const p=product(r.sku), i=stepIndex[r.status];
  let work='';
  if(r.status==='pending'&&role()==='keeper') {
    work+=button('核对库存候选','lookup',r.id,false);
    if(candidateRows.length) work+=table(['批次及来源','实存','可拨','有效期','办理'],candidateRows.map(l=>[`${h(l.lab)}<small>${h(l.batch)} · ${h(l.source)}</small>`,h(l.qty),h(l.available),h(l.expiry||'未标注'),button('暂留','reserveForm',l.id)]));
    work+=form('noMatch',r.id,field('无货或不匹配原因','reason','','text','required placeholder="例如同货号库存不足"'));
  }
  if(r.status==='reserved'&&role()==='lead') work+=form('approve',r.id,field('核准数量','qty',r.reserved,'number',`required min="1" max="${r.reserved}"`))+form('reject',r.id,field('退回原因','reason','','text','required'));
  if(r.status==='approved'&&role()==='keeper') {
    work+=r.dispatch?form('resolveHandoff',r.id,field('交接差异与实物处置','reason','','text','required placeholder="例如实物未交付，已回收核对"')):form('dispatch',r.id,field('转出数量','qty',r.approvedQty,'number',`required min="1" max="${r.approvedQty}"`)+field('出库凭据索引','ref','','text','required'));
  }
  if(r.status==='approved'&&r.dispatch&&role()==='applicant') work+=form('receive',r.id,field('实收数量','qty',r.dispatch.qty,'number',`required min="1" max="${r.dispatch.qty}"`)+field('领用凭据索引','ref','','text','required'));
  if(['pending','reserved','approved'].includes(r.status)&&!r.dispatch&&['applicant','keeper'].includes(role())) work+=form('cancel',r.id,field('撤销或账实不符原因','reason','','text','required'));
  if(r.status==='received'&&!r.ledger&&role()==='keeper') work+=form('backfill',r.id,field('正式库存台账索引','ref','','text','required'));
  if(r.status==='received'&&r.ledger&&role()==='applicant') work+=form('close',r.id,field('最终新购量','final',r.qty-r.receipt.qty,'number',`required min="${r.qty-r.receipt.qty}" max="${r.qty}"`)+field('同规格单价（减购时填写）','price','','number','min="0" step=".01"')+field('直接支出（元）','cost',0,'number','required min="0" step=".01"')+field('申购变更凭据','ref','','text','required')+field('价格凭据（减购时填写）','priceRef'));
  const logs=state.audit.filter(a=>a.request===r.id);
  const vals=[['品类',p.name+' · '+p.spec],['需求实验室',r.lab],['原拟购量',r.qty+' '+p.unit],['最迟领用日',r.needBy],['原申购编号',r.original],['用途',r.purpose],['记录类型',r.mode==='demo'?'演练':'试点']];
  if(r.holdUntil) vals.push(['暂留截止',dateTime(r.holdUntil)]);
  if(r.approvedQty) vals.push(['核准数量',r.approvedQty+' '+p.unit]);
  if(r.dispatch) vals.push(['转出',r.dispatch.qty+' '+p.unit+' · '+r.dispatch.ref]);
  if(r.receipt) vals.push(['实收',r.receipt.qty+' '+p.unit+' · '+r.receipt.ref]);
  if(r.ledger) vals.push(['正式库存台账',r.ledger.ref]);
  if(r.final) vals.push(['新购／减购',r.final.qty+' / '+r.final.saved+' '+p.unit],['净节约',yuan(r.final.net)],['申购凭据',r.final.procurementRef]);
  if(r.reason) vals.push(['办理说明',r.reason]);
  return `${crumb(h(r.id),h(p.name)+' · '+h(p.spec),button('返回需求','nav','requests'))}<div class="detail-layout">
  <section class="card panel"><div class="card-title"><h2>需求详情</h2>${status(r)}</div>
  <div class="steps">${steps.map(([,label],index)=>`<span class="${index<=i?'done':''}">${index+1}. ${label}</span>`).join('')}</div>
  <dl class="data-grid">${vals.map(([key,value])=>`<div><dt>${key}</dt><dd>${h(value)}</dd></div>`).join('')}</dl>
  <div id="work">${work||'<p class="fine">当前角色可查看办理记录。</p>'}</div></section>
  <section class="card panel"><h2>操作记录</h2><ol class="timeline">${logs.map(a=>`<li><strong>${h(a.message)}</strong><small>${h(a.actor)} · ${dateTime(a.at)}</small></li>`).join('')}</ol></section></div>`;
}
function create() {
  const need=new Date(Date.now()+7*86400000+8*3600000).toISOString().slice(0,10);
  return `${crumb('登记申购需求','选择标准品类并填写原计划。查库与审批记录将使用同一需求编号。',button('返回需求','nav','requests'))}
  <section class="card panel">${form('createRequest','',listField('标准品类','sku',items())+field('需求实验室','lab','实验室 B','text','required')+field('原拟购量','qty',1,'number','required min="1"')+field('最迟领用日','needBy',need,'date','required')+field('原申购编号','original','','text','required')+field('需求用途','purpose','','text','required')+'<input type="hidden" name="mode" value="demo">')}</section>`;
}
function inventory() {
  return `${crumb('库存台账','按本中心与批次查看实存、暂留和可用数量。')}
  <section class="card">${table(['品类与规格','实验室／批次','实存','暂留','可用','有效期','来源','类型'],state.lots.map(l=>[`<strong>${h(product(l.sku).name)}</strong><small>${h(l.sku)} · ${h(product(l.sku).spec)}</small>`,h(l.lab+' / '+l.batch),h(l.qty),h(l.held),h(l.enabled?l.available:'已停用'),h(l.expiry||'—'),h(l.source),l.mode==='pilot'?'试点':'演练']))}</section>`;
}
function records() {
  const read=(t)=>t?new Date(t).getTime():0;
  const rs=state.requests;
  const decided=rs.filter(r=>r.matchAt);
  const matched=decided.filter(r=>r.matched);
  const approved=rs.filter(r=>r.approvedAt);
  const signed=approved.filter(r=>r.receipt);
  const times=decided.map(r=>Math.max(0,(read(r.matchAt)-read(r.createdAt))/60000)).sort((a,b)=>a-b);
  const median=times.length?(times[(times.length-1)>>1]+times[times.length>>1])/2:null;
  const savings=rs.filter(r=>r.final).reduce((a,r)=>a+r.final.net,0);
  const ratio=(a,b)=>b?`${(a/b*100).toFixed(0)}% · ${a}/${b}`:'—';
  return `${crumb('记录与导出','查看当前演示的匹配、签收和节约记录。管理员可导出 CSV。',role()==='admin'?button('导出台账','export','',false):'')}
  <section class="card panel">
  <div class="metrics">${[['符合条件需求匹配率',ratio(matched.length,rs.length)],['核准后签收率',ratio(signed.length,approved.length)],['已核对用时中位数',median===null?'—':median.toFixed(1)+' 分钟'],['归档净节约',yuan(savings)]].map(([k,v])=>`<article><span>${k}</span><strong>${v}</strong></article>`).join('')}</div>${requestsTable(rs)}</section>`;
}
function admin() {
  return `${crumb('中心设置','管理本中心账号、准入品类、库存批次和表格导入。')}
  <div class="settings">
  <section class="card panel"><h2>准入品类</h2>${table(['货号','品类／规格','状态'],state.catalog.map(i=>[h(i.sku),h(i.name+' / '+i.spec),i.active?'启用':'停用']))}${form('saveItem','',listField('品类编码','sku',state.catalog.map(i=>[i.sku,i.name]))+listField('是否启用','active',[['是','启用'],['否','停用']]))}</section>
  <section class="card panel"><h2>批次登记与盘点</h2><p>同品类、同实验室、同批次会更新已有库存。</p>${form('saveLot','',listField('品类编码','sku',items())+field('实验室','lab','','text','required')+field('批次','batch','','text','required')+field('实存量','qty',0,'number','required min="0"')+field('有效期','expiry','','date')+field('台账来源索引','source','','text','required')+'<input type="hidden" name="mode" value="demo">'+listField('上架','enabled',[['是','是'],['否','否']]))}</section>
  <section class="card panel"><h2>账号与角色</h2>${table(['账号','姓名','角色','状态'],state.users.map(u=>[h(u.username),h(u.name),h(state.roles[u.role]),u.active?'启用':'停用']))}${form('saveUser','',field('账号','username','','text','required')+field('显示姓名','name','','text','required')+listField('角色','role',Object.entries(state.roles))+listField('账号状态','active',[['true','启用'],['false','停用']]))}</section>
  <section class="card panel"><h2>表格导入</h2><p>使用 UTF-8 CSV，一个文件最多 500 行。任一行出错时整批回滚。库存记录类型填 demo。</p><div class="inline">${button('品类模板','template','catalog')}${button('库存模板','template','inventory')}</div>
  <form class="action-form" data-action="import"><div class="form-fields">${listField('导入类型','kind',[['catalog','品类'],['inventory','库存']])}<label><span>CSV 文件</span><input type="file" name="file" accept=".csv,text/csv" required></label></div><button class="button" type="submit">导入表格</button></form></section></div>`;
}
function render() {
  if(!state.user) { login(); return; }
  const top=[['home','总览'],['requests','需求与查库'],...(['keeper','lead','admin'].includes(role())?[['inventory','库存台账']]:[]),['records','记录与导出'],...(role()==='admin'?[['admin','中心设置']]:[])];
  const r=state.requests.find(item=>item.id===selected);
  const views={home,requests,inventory,records,admin,create};
  const page=tab==='detail'&&r?details(r):(views[tab]||home)();
  app.innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">${icon('brand')}</span><span>试剂循环<small>耗材调剂工作台</small></span></div>
  <div class="center-label"><span>当前中心</span><strong>${h(state.center.name)}</strong></div><nav aria-label="工作台导航">${top.map(([key,label])=>`<button type="button" class="${tab===key||(key==='requests'&&['detail','create'].includes(tab))?'active':''}" data-cmd="nav" data-value="${key}">${icon(key)}${label}</button>`).join('')}</nav>
  <div class="sidebar-foot"><span class="live-dot"></span>公开演示</div></aside>
  <div class="main"><header class="topbar"><span>${h(state.center.name)} <span class="separator">/</span> <strong>${h(state.roles[role()])}</strong></span><div class="inline">${button(icon('refresh')+' 刷新','refresh')}<span class="username">${h(state.user.name)}</span>${button('切换身份','logout')}</div></header><main class="content">${page}</main></div></div>`;
}
function parseCsv(text) {
  const rows=[]; let row=[], field='', quoted=false, afterQuote=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted) {
      if(c==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(c==='"'){quoted=false;afterQuote=true;}
      else field+=c;
    } else if(c===','||c==='\n'||c==='\r') {
      row.push(field.trim());field='';afterQuote=false;
      if(c!==','){ if(c==='\r'&&text[i+1]==='\n') i++; if(row.some(Boolean)) rows.push(row);row=[]; }
    } else if(c==='"'&&!field&&!afterQuote) quoted=true;
    else { if(afterQuote||c==='"') throw new Error('CSV 引号格式不正确'); field+=c; }
  }
  if(quoted) throw new Error('CSV 有未闭合的引号');
  row.push(field.trim()); if(row.some(Boolean)) rows.push(row); return rows;
}
const formats={
  catalog:{ headers:['品类编码','是否启用'],keys:['sku','active'],example:'TIP-200,是' },
  inventory:{headers:['品类编码','实验室','批次','实存数量','有效期','台账来源','上架','记录类型'],keys:['sku','lab','batch','qty','expiry','source','enabled','mode'],example:'TIP-200,实验室 A,TIP-A01,3,,入库-DEMO-001,是,demo'},
};
function download(text, filename) {
  const link=document.createElement('a');
  const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));
  link.href=url;
  link.download=filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
app.addEventListener('click',async e=>{
  const b=e.target.closest('button[data-cmd]'); if(!b) return;
  const {cmd,value}=b.dataset;
  b.disabled=true;
  try {
    if(cmd==='nav'){tab=value; filter='';kind=value==='records'?'demo':'all'; selected=''; candidateRows=[]; render();}
    if(cmd==='select'){selected=value;tab='detail';candidateRows=[];render();}
    if(cmd==='refresh') await refresh();
    if(cmd==='logout'){await api('/api/logout',{});candidateRows=[];await refresh();}
    if(cmd==='demo'){
      await api('/api/login',{username:value});
      state=await api('/api/state');
      if(tab!=='detail'||!state.requests.some(r=>r.id===selected)){
        tab='home'; selected=''; kind='all'; filter='';
      }
      render();
    }
    if(cmd==='reset'&&confirm('清空本标签页的演示记录并重新开始？')){
      await api('/api/reset');
      tab='home'; selected=''; kind='all'; filter='';
      await refresh();
    }
    if(cmd==='export') download(await api('/api/export'),'consumables-ledger.csv');
    if(cmd==='lookup'){
      candidateRows=await api('/api/action',{action:'lookup',id:value});
      render();
      if(!candidateRows.length) toast('没有符合规格、地点和效期的可拨库存。');
    }
    if(cmd==='reserveForm'){
      const l=candidateRows.find(l=>l.id===value);
      const r=state.requests.find(r=>r.id===selected);
      if(!l||!r) return;
      document.getElementById('reserve-form')?.remove();
      const wrap=document.createElement('div');
      wrap.id='reserve-form';
      const max=Math.min(l.available,r.qty);
      wrap.innerHTML=form('reserve',r.id,`<input type="hidden" name="lotId" value="${h(l.id)}">`+field('暂留数量','qty',max,'number',`required min="1" max="${max}"`)+field('暂留时长（小时）','hours',24,'number','required min="1" max="168"'));
      document.getElementById('work').append(wrap);
      wrap.querySelector('input[type=number]').focus();
    }
    if(cmd==='template'){
      const f=formats[value];
      download('\ufeff'+f.headers.join(',')+'\r\n'+f.example+'\r\n', value+'-template.csv');
    }
  }catch(err){toast(err.message,true);}finally{b.disabled=false;}
});
app.addEventListener('submit',async e=>{
  const f=e.target; if(!f.dataset.action) return;
  e.preventDefault();
  const action=f.dataset.action, values=Object.fromEntries(new FormData(f)), submit=e.submitter;
  if(submit) submit.disabled=true;
  try{
    if(action==='filter'){filter=values.query||'';kind=values.kind;render();return;}
    let result;
    if(action==='import'){
      const format=formats[values.kind];
      if(values.file.size>700000) throw new Error('CSV 文件过大');
      const [head,...lines]=parseCsv((await values.file.text()).replace(/^\ufeff/,''));
      if(!head||head.join(',')!==format.headers.join(',')) throw new Error('表头与模板不一致，请使用对应模板');
      if(lines.some(row=>row.length!==format.keys.length)) throw new Error('CSV 中有行的列数与表头不一致');
      result=await api('/api/action',{action:'importRows',kind:values.kind,rows:lines.map(row=>Object.fromEntries(format.keys.map((key,i)=>[key,row[i]])))});
      toast('已导入 '+result.count+' 条记录');
    } else {
      if(action==='saveUser') values.active=values.active==='true';
      result=await api('/api/action',{...values,action,id:f.dataset.id});
      if(action==='createRequest'){selected=result.id;tab='detail';}
      toast(actions[action]+'成功');
    }
    candidateRows=[]; await refresh();
  }catch(err){toast(err.message,true);}finally{if(submit) submit.disabled=false;}
});
refresh().catch(e=>{app.textContent=e.message;});


