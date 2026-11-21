import { act, assert, csv, expire, labels, readState, seed } from './domain.js';

const key = 'reagent-loop-session-v1';
let session;

function current() {
  if (session) return session;
  const saved = sessionStorage.getItem(key);
  session = saved ? JSON.parse(saved) : { data: seed(), active: '' };
  return session;
}

function save(next) {
  sessionStorage.setItem(key, JSON.stringify(next));
  session = next;
}

export async function api(path, body) {
  const next = structuredClone(current());
  const { data: s } = next;
  const expired = expire(s);
  const u = s.users.find(user => user.id === next.active && user.active);

  if (path === '/api/state') {
    if (expired) save(next);
    return {
      ...readState(s, u),
      ...(u ? {} : {
        personas: s.users.filter(user => user.active)
          .map(({ id, name, role, center }) => ({ id, name, role, center })),
      }),
    };
  }
  if (path === '/api/reset') {
    save({ data: seed(), active: '' });
    return;
  }
  if (path === '/api/logout') {
    next.active = '';
  } else if (path === '/api/login') {
    assert(s.users.some(user => user.id === body.username && user.active), '该演示身份已停用。');
    next.active = body.username;
  } else {
    assert(u, '请先选择演示身份。', 401);
    if (path === '/api/export') {
      assert(u.role === 'admin', '只有管理员可以导出台账', 403);
      const mode = 'demo';
      return csv([
            ['需求编号','记录类型','状态','申购人','需求实验室','原申购编号','品类','规格','单位','原拟购量','最迟领用日','登记时间','核对完成时间','库存实验室','库存批次','库存台账来源','审批人','核准数量','审批时间','转出凭据','转出人','转出时间','实收数量','签收人','签收时间','领用凭据','正式库存台账索引','回填人','库存回填时间','最终新购量','减购量','单价(元)','直接支出(元)','净节约(元)','申购变更凭据','价格凭据','归档时间','异常原因'],
            ...s.requests.filter(r=>r.center===u.center && r.mode===mode).map(r=>{
              const item=s.catalog.find(i=>i.sku===r.sku && i.center===u.center);
              const lot=s.lots.find(i=>i.id===r.lotId);
              const f=r.final;
              return [r.id,r.mode==='demo'?'演练':'试点',labels[r.status],r.applicant,r.lab,r.original,item?.name,item?.spec,item?.unit,r.qty,r.needBy,r.createdAt,r.matchAt,lot?.lab,lot?.batch,lot?.source,r.approver,r.approvedQty,r.approvedAt,r.dispatch?.ref,r.dispatch?.actor,r.dispatch?.at,r.receipt?.qty,r.receipt?.actor,r.receipt?.at,r.receipt?.ref,r.ledger?.ref,r.ledger?.actor,r.ledger?.at,f?.qty,f?.saved,f&&f.price/100,f&&f.cost/100,f&&f.net/100,f?.procurementRef,f?.priceRef,f?.at,r.reason];
            })
          ]);
    }
    assert(path === '/api/action', '未知演示操作', 404);
    const result = act(s, u, body.action, body);
    save(next);
    return result;
  }
  save(next);
}
