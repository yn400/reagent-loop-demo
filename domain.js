
export const roles = { applicant: '申购人', keeper: '实验员', lead: '项目负责人', admin: '管理员' };
export const labels = { pending:'待查库', reserved:'待审核', approved:'待交接', received:'待台账回填', closed:'已归档', no_match:'无货／继续采购', rejected:'已退回', cancelled:'已撤销', expired:'已超时' };
const sample = {
  'TIP-200': { name:'通用移液器吸头', spec:'200 μL · 96 支/盒', unit:'盒' },
  'TUBE-15': { name:'空离心管', spec:'1.5 mL · 500 支/袋', unit:'袋' },
  'RACK-15': { name:'空离心管架', spec:'1.5 mL · 24 孔', unit:'个' },
};
export function assert(test, message, status=400) {
  if (!test) throw Object.assign(new Error(message),{ status });
}
export function string(value,label,max=100) {
  assert(typeof value==='string' && value.trim().length>0 && value.trim().length<=max,label+'不能为空或过长');
  return value.trim();
}
export function number(value,label,min=1,max=100000) {
  const n=Number(value);
  assert((typeof value==='number' || (typeof value==='string' && value.trim()!=='')) && Number.isInteger(n) && n>=min && n<=max,label+'须为 '+min+'–'+max+' 的整数');
  return n;
}
function money(value,label) {
  assert(typeof value==='string' || typeof value==='number',label+'必须是金额');
  const raw=String(value).trim();
  assert(/^\d{1,7}(\.\d{1,2})?$/.test(raw),label+'须为非负金额，最多两位小数');
  return Math.round(Number(raw)*100);
}
function date(value,label) {
  const v=string(value,label,10);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v,label+'格式不正确');
  return v;
}
const now=()=>new Date().toISOString();
const campusDate=(timestamp=Date.now())=>new Date(timestamp+8*3600000).toISOString().slice(0,10);
const today=()=>campusDate();
const later=(days)=>campusDate(Date.now()+days*86400000);
const find=(values,id,message)=>{ const row=values.find(x=>x.id===id); assert(row,message,404); return row; };
const scope=(values,center)=>values.filter(row=>row.center===center);
const next=(s,prefix)=>prefix+'-'+String(++s.seq).padStart(4,'0');
const audit=(s,user,request,message)=>s.audit.push({ at:now(), center:user.center, actor:user.name, request, message });
function allowed(user,...permitted) { assert(permitted.includes(user.role),'当前角色不能执行此操作',403); }
function catalogItem(s,u,sku) {
  const entry=s.catalog.find(x=>x.center===u.center && x.sku===sku);
  assert(entry?.active,'该品类未在本中心启用');
  return entry;
}
function requisition(s,u,id) {
  const req=find(scope(s.requests,u.center),id,'申购需求不存在');
  assert(u.role!=='applicant' || req.owner===u.id,'只能办理自己的需求',403);
  return req;
}
function requestStatus(req,...values) { assert(values.includes(req.status),'当前状态不能执行此操作',409); }
export function held(s,lotId) { return s.requests.filter(r=>r.lotId===lotId && ['reserved','approved'].includes(r.status)).reduce((a,r)=>a+r.reserved,0); }
export function candidates(s,u,req) {
  if (!s.catalog.some(item=>item.center===u.center && item.sku===req.sku && item.active)) return [];
  return scope(s.lots,u.center).filter(l=>l.sku===req.sku && (l.mode||'demo')===req.mode && l.enabled && l.lab!==req.lab && (!l.expiry || l.expiry>=req.needBy))
    .map(l=>({...l,available:l.qty-held(s,l.id)})).filter(l=>l.available>0)
    .sort((a,b)=>(a.expiry||'9999').localeCompare(b.expiry||'9999') || a.lab.localeCompare(b.lab,'zh'));
}
export function expire(s,t=now()) {
  let dirty=false;
  for (const req of s.requests) {
    if (req.status==='pending' && req.needBy<campusDate(Date.parse(t))) {
      req.status='expired'; req.reason='已超过最迟领用日';
      audit(s,{center:req.center,name:'系统'},req.id,req.reason); dirty=true;
    }
    if (['reserved','approved'].includes(req.status) && req.holdUntil<=t && !req.dispatch) {
      req.status='expired'; req.reason='超过调剂暂留时限，库存已释放';
      audit(s,{center:req.center,name:'系统'},req.id,req.reason); dirty=true;
    }
  }
  return dirty;
}
export function seed() {
  const s={seq:3,centers:[{id:'teaching',name:'教学实验中心'},{id:'training',name:'工程实训中心'}],catalog:[],users:[],lots:[],requests:[],audit:[] };
  const names={applicant:'林同学',keeper:'周实验员',lead:'陈负责人',admin:'中心管理员'};
  for (const center of s.centers) {
    for (const role of Object.keys(roles)) {
      const username=center.id==='teaching'?role:center.id+'-'+role;
      s.users.push({id:username,username,name:names[role],role,center:center.id,active:true});
    }
    for (const [sku,item] of Object.entries(sample)) s.catalog.push({center:center.id,sku,...item,active:true});
  }
  s.lots=[
    {id:'LOT-001',center:'teaching',sku:'TIP-200',lab:'实验室 A',batch:'TIP-A01',qty:3,expiry:later(180),source:'入库-DEMO-001',enabled:true},
    {id:'LOT-002',center:'teaching',sku:'TUBE-15',lab:'实验室 A',batch:'TUBE-A01',qty:1,expiry:later(120),source:'入库-DEMO-002',enabled:true},
    {id:'LOT-003',center:'training',sku:'TIP-200',lab:'实训室 A',batch:'TIP-E01',qty:6,expiry:'',source:'入库-DEMO-003',enabled:true},
  ];
  const u=s.users[0];
  for (const [id,sku,qty,purpose] of [['REQ-0001','TIP-200',2,'教学课程补充耗材'],['REQ-0002','TUBE-15',2,'实验课分组用量'],['REQ-0003','RACK-15',1,'实验工位补充']]) {
    s.requests.push({id,center:'teaching',owner:u.id,applicant:u.name,sku,lab:'实验室 B',qty,needBy:later(7),purpose,original:'申购-DEMO-'+id.slice(-3),createdAt:now(),status:'pending',mode:'demo'});
    audit(s,u,id,'登记需求 '+qty+' '+sample[sku].unit);
  }
  return s;
}

export function readState(s,u) {
  if (!u) return { centers:s.centers,roles };
  const requests=scope(s.requests,u.center).filter(r=>u.role!=='applicant' || r.owner===u.id);
  const ids=new Set(requests.map(r=>r.id));
  return {
    roles,labels,center:find(s.centers,u.center,'中心不存在'),centers:u.role==='admin'?s.centers:undefined,
    user:{id:u.id,name:u.name,role:u.role},requests,
    catalog:scope(s.catalog,u.center),
    lots:u.role==='applicant'?[]:scope(s.lots,u.center).map(l=>({...l,available:l.qty-held(s,l.id),held:held(s,l.id)})),
    users:u.role==='admin'?scope(s.users,u.center).map(({id,username,name,role,active})=>({id,username,name,role,active})):[],
    audit:scope(s.audit,u.center).filter(a=>u.role==='admin' || ids.has(a.request)).slice(-500).reverse(),
  };
}

export function act(s,u,action,b) {
  if (action==='createRequest') {
    allowed(u,'applicant');
    const item=catalogItem(s,u,b.sku);
    const needBy=date(b.needBy,'最迟领用日');
    assert(needBy>=today(),'最迟领用日不能早于今天');
    assert(b.mode==='demo','请选择记录类型');
    const original=string(b.original,'原申购编号',45);
    assert(!scope(s.requests,u.center).some(r=>r.mode===b.mode && r.original===original && !['cancelled','expired','rejected'].includes(r.status)),'原申购编号已登记',409);
    const r={ id:next(s,'REQ'),center:u.center,owner:u.id,applicant:u.name,sku:item.sku,lab:string(b.lab,'需求实验室',45),qty:number(b.qty,'数量'),needBy,purpose:string(b.purpose,'用途',240),original,createdAt:now(),status:'pending',mode:b.mode };
    s.requests.push(r);
    audit(s,u,r.id,'登记需求 '+r.qty+' '+item.unit);
    return r;
  }
  if (action==='saveItem' || action==='saveLot' || action==='importRows' || action==='saveUser') {
    allowed(u,'admin');
    if (action==='saveItem') {
      const sku=string(b.sku,'品类编码',24).toUpperCase();
      assert(Object.hasOwn(sample,sku),'试验版只使用预设的常温通用耗材编码');
      let item=s.catalog.find(x=>x.center===u.center && x.sku===sku);
      if (!item) { item={center:u.center,sku,...sample[sku]}; s.catalog.push(item); }
      item.active=b.active===true || b.active==='是';
      audit(s,u,null,(item.active?'启用':'停用')+'品类 '+sku);
      return item;
    }
    if (action==='saveLot') {
      const item=catalogItem(s,u,b.sku);
      const lab=string(b.lab,'库存实验室',45), batch=string(b.batch,'批次',45);
      const mode=b.mode||'demo';
      assert(mode==='demo','库存记录类型无效');
      const existing=scope(s.lots,u.center).find(l=>l.sku===item.sku && l.lab===lab && l.batch===batch && (l.mode||'demo')===mode);
      const qty=number(b.qty,'实存数量',0);
      assert(!existing || qty>=held(s,existing.id),'实存数量不能少于当前暂留量');
      const enabled=b.enabled===true || b.enabled==='是';
      assert(enabled || !existing || held(s,existing.id)===0,'先处理该批次的暂留，再停用');
      const info={sku:item.sku,lab,batch,mode,qty,expiry:b.expiry?date(b.expiry,'有效期'):'',source:string(b.source,'台账来源',65),enabled};
      if (existing) Object.assign(existing,info);
      else s.lots.push({id:next(s,'LOT'),center:u.center,...info});
      audit(s,u,null,'登记或更新库存 '+item.sku+' / '+batch);
      return info;
    }
    if (action==='saveUser') {
      const username=string(b.username,'账号',36).toLowerCase();
      assert(/^[a-z0-9][a-z0-9_-]{2,35}$/.test(username),'账号需为3–36位英文、数字、横线或下划线');
      assert(Object.hasOwn(roles,b.role),'角色无效');
      const current=s.users.find(x=>x.username===username);
      assert(!current || current.center===u.center,'该账号已存在',409);
      assert(!current || current.id!==u.id || (b.role==='admin' && b.active===true),'当前管理员账号需保持启用');
      const user={id:current?.id||username,username,name:string(b.name,'显示姓名',40),role:b.role,center:u.center,active:b.active===true};
      if (current) Object.assign(current,user); else s.users.push(user);
      audit(s,u,null,'更新账号 '+username);
      return {id:user.id};
    }
    assert(['catalog','inventory'].includes(b.kind) && Array.isArray(b.rows) && b.rows.length>0 && b.rows.length<=500,'导入须包含1–500条记录');
    for (const [i,row] of b.rows.entries()) {
      try { act(s,u,b.kind==='catalog'?'saveItem':'saveLot',row); }
      catch(e) { e.message='第 '+(i+2)+' 行：'+e.message; throw e; }
    }
    return {count:b.rows.length};
  }

  const r=requisition(s,u,b.id);
  if (action==='lookup') {
    allowed(u,'keeper','lead','admin'); requestStatus(r,'pending'); r.lookupAt ??= now();
    return candidates(s,u,r);
  }
  let msg;
  switch(action) {
    case 'reserve': {
      allowed(u,'keeper'); requestStatus(r,'pending');
      const lot=find(candidates(s,u,r),b.lotId,'该批次没有可调剂数量，或不符合规格与日期要求');
      const qty=number(b.qty,'暂留数量',1,Math.min(r.qty,lot.available));
      const hours=number(b.hours,'暂留时长（小时）',1,168);
      assert(!lot.expiry || lot.expiry>=r.needBy,'批次到期日早于领用日');
      const latest=new Date(r.needBy+'T23:59:59.999+08:00').getTime();
      const holdUntil=new Date(Math.min(Date.now()+hours*3600000,latest)).toISOString();
      Object.assign(r,{lotId:lot.id,reserved:qty,holdUntil,status:'reserved',matchAt:now(),matched:true});
      msg='核对 '+lot.lab+' / '+lot.batch+'，暂留 '+qty;
      break;
    }
    case 'noMatch':
      allowed(u,'keeper'); requestStatus(r,'pending');
      r.status='no_match'; r.reason=string(b.reason,'原因',200); r.matchAt=now(); r.matched=false;
      msg='结束查库，按原流程办理：'+r.reason;
      break;
    case 'approve':
      allowed(u,'lead'); requestStatus(r,'reserved');
      r.approvedQty=number(b.qty,'核准数量',1,r.reserved);
      r.reserved=r.approvedQty; r.status='approved'; r.approvedAt=now(); r.approver=u.name;
      msg='核准调剂 '+r.approvedQty;
      break;
    case 'reject':
      allowed(u,'lead'); requestStatus(r,'reserved');
      r.status='rejected'; r.reason=string(b.reason,'退回原因',200);
      msg='退回并释放暂留：'+r.reason;
      break;
    case 'cancel':
      allowed(u,'applicant','keeper'); requestStatus(r,'pending','reserved','approved');
      assert(!r.dispatch,'已确认交付的需求需先由实验员处理交接差异');
      r.status='cancelled'; r.reason=string(b.reason,'撤销原因',200);
      msg='撤销并释放暂留：'+r.reason;
      break;
    case 'dispatch': {
      allowed(u,'keeper'); requestStatus(r,'approved'); assert(!r.dispatch,'转出方已确认',409);
      r.dispatch={qty:number(b.qty,'转出数量',1,r.approvedQty),actor:u.name,at:now(),ref:string(b.ref,'出库凭据索引',65)};
      r.reserved=r.dispatch.qty;
      msg='转出方确认 '+r.dispatch.qty+'，出库索引 '+r.dispatch.ref;
      break;
    }
    case 'resolveHandoff':
      allowed(u,'keeper'); requestStatus(r,'approved'); assert(r.dispatch,'没有待处理的交接');
      r.status='cancelled'; r.reason=string(b.reason,'交接差异原因',200);
      msg='登记交接差异并释放暂留：'+r.reason;
      break;
    case 'receive': {
      allowed(u,'applicant'); requestStatus(r,'approved'); assert(r.dispatch,'等待转出方确认');
      const qty=number(b.qty,'实收数量',1,r.dispatch.qty);
      assert(qty===r.dispatch.qty,'签收数量与转出不符，请实验员先核实差异');
      const lot=find(scope(s.lots,u.center),r.lotId,'批次不存在');
      assert(lot.qty>=qty,'库存账实不符',409);
      lot.qty-=qty;
      r.receipt={qty,actor:u.name,at:now(),ref:string(b.ref,'领用凭据索引',65)};
      r.status='received'; r.reserved=0;
      msg='接收方签收 '+qty+'，实存已扣减，剩余暂留已释放';
      break;
    }
    case 'backfill':
      allowed(u,'keeper'); requestStatus(r,'received');
      assert(!r.ledger,'这笔需求已回填库存台账',409);
      r.ledger={ref:string(b.ref,'正式库存台账索引',65),actor:u.name,at:now()};
      msg='回填正式库存台账 '+r.ledger.ref;
      break;
    case 'close': {
      allowed(u,'applicant'); requestStatus(r,'received');
      assert(r.ledger,'请等待实验员回填正式库存台账');
      const final=number(b.final,'最终新购量',r.qty-r.receipt.qty,r.qty);
      const saved=r.qty-final;
      const price=saved?money(b.price,'同规格单价'):0;
      const cost=money(b.cost,'调剂直接支出');
      const procurementRef=string(b.ref,'申购变更凭据',65);
      const priceRef=saved?string(b.priceRef,'价格凭据',65):'';
      r.final={qty:final,saved,price,cost,net:saved*price-cost,procurementRef,priceRef,at:now()};
      r.status='closed'; msg='回填申购，减购 '+saved+'；归档索引 '+procurementRef;
      break;
    }
    default: assert(false,'未知操作',404);
  }
  audit(s,u,r.id,msg);
  return r;
}

export function csv(rows) {
  return '\ufeff'+rows.map(row=>row.map(value=>{
    let text=String(value??'');
    if (typeof value==='string' && /^[\s]*[=+\-@\t\r]/.test(text)) text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  }).join(',')).join('\r\n');
}




