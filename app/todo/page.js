'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

function RTh({ children, className = '', style = {}, minWidth = 50, initialWidth, ...props }) {
  const ref = useRef(null);
  const sx = useRef(0), sw = useRef(0);
  const onDown = useCallback(e => {
    e.preventDefault(); e.stopPropagation();
    sx.current = e.clientX; sw.current = ref.current.offsetWidth;
    const move = e2 => { ref.current.style.width = Math.max(minWidth, sw.current + e2.clientX - sx.current) + 'px'; };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
  }, [minWidth]);
  const s = { ...style, position: 'relative' };
  if (initialWidth) s.width = initialWidth;
  return (
    <th ref={ref} className={className} style={s} {...props}>
      {children}
      <div onMouseDown={onDown} style={{ position:'absolute', right:0, top:0, bottom:0, width:'6px', cursor:'col-resize', userSelect:'none', background:'#cbd5e1', borderRadius:'2px' }}
        onMouseOver={e => { e.currentTarget.style.background = '#94a3b8'; }} onMouseOut={e => { e.currentTarget.style.background = '#cbd5e1'; }} />
    </th>
  );
}

export default function TodoPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [checkedItems, setCheckedItems] = useState({});
  const [checkedRows, setCheckedRows] = useState({});
  const [progressData, setProgressData] = useState({});
  const [statusData, setStatusData] = useState({});
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    try {
      const s1 = localStorage.getItem('todo_checked_items'); if (s1) setCheckedItems(JSON.parse(s1));
      const s2 = localStorage.getItem('todo_checked_rows'); if (s2) setCheckedRows(JSON.parse(s2));
      const s3 = localStorage.getItem('todo_progress'); if (s3) setProgressData(JSON.parse(s3));
      const s4 = localStorage.getItem('todo_status'); if (s4) setStatusData(JSON.parse(s4));
    } catch {}
  }, []);

  useEffect(() => { (async () => {
    try {
      const todosData = JSON.parse(localStorage.getItem('costcheck_todos') || '{}');
      const reasonsData = JSON.parse(localStorage.getItem('costcheck_reasons') || '{}');
      const res = await fetch('/api/save-all');
      const allData = await res.json();
      const items = [];
      for (const [shipmentKey, entry] of Object.entries(allData)) {
        if (!entry.rows) continue;
        for (const r of entry.rows) {
          const cKey = `${r.sku}_${shipmentKey}`;
          const todo = (todosData[cKey] || '').trim();
          const memo = (reasonsData[cKey] || '').trim();
          if (!todo) continue;
          items.push({ id: cKey, shipmentKey, sku: r.sku, labelName: r.labelName || r.productName || '', todo, memo });
        }
      }
      setRows(items);
    } catch {}
    setLoading(false);
  })(); }, []);

  const toggleItem = (rowId, idx) => {
    const key = `${rowId}_${idx}`;
    setCheckedItems(prev => { const next = { ...prev, [key]: !prev[key] }; localStorage.setItem('todo_checked_items', JSON.stringify(next)); return next; });
  };
  const toggleRow = (id) => {
    setCheckedRows(prev => { const next = { ...prev, [id]: !prev[id] }; localStorage.setItem('todo_checked_rows', JSON.stringify(next)); return next; });
  };
  const updateProgress = (id, val) => {
    setProgressData(prev => { const next = { ...prev, [id]: val }; localStorage.setItem('todo_progress', JSON.stringify(next)); return next; });
  };
  const updateStatus = (id, val) => {
    setStatusData(prev => { const next = { ...prev, [id]: val }; localStorage.setItem('todo_status', JSON.stringify(next)); return next; });
  };

  const parseTodos = (text) => {
    const items = []; const lines = text.split('\n'); let current = null;
    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*(.*)/);
      if (match) { if (current) items.push(current); current = { num: match[1], title: match[2], details: [] }; }
      else if (current && line.trim()) current.details.push(line.trim());
      else if (!current && line.trim()) items.push({ num: String(items.length + 1), title: line.trim(), details: [] });
    }
    if (current) items.push(current);
    return items;
  };

  const statusOptions = [
    { value: 'pending', label: '대기', bg: 'bg-gray-100', text: 'text-gray-600' },
    { value: 'progress', label: '진행중', bg: 'bg-blue-100', text: 'text-blue-700' },
    { value: 'done', label: '완료', bg: 'bg-green-100', text: 'text-green-700' },
    { value: 'hold', label: '보류', bg: 'bg-red-100', text: 'text-red-600' },
  ];

  const getStatus = (id) => statusData[id] || 'pending';
  const getStatusObj = (id) => statusOptions.find(s => s.value === getStatus(id)) || statusOptions[0];

  const filtered = (() => {
    let result = rows;
    if (filter === 'active') result = result.filter(r => !['done'].includes(getStatus(r.id)));
    if (filter === 'done') result = result.filter(r => getStatus(r.id) === 'done');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(r => (r.sku + ' ' + r.labelName + ' ' + r.shipmentKey + ' ' + r.todo + ' ' + r.memo).toLowerCase().includes(q));
    }
    return result;
  })();

  const doneCount = rows.filter(r => getStatus(r.id) === 'done').length;
  const progressCount = rows.filter(r => getStatus(r.id) === 'progress').length;
  const waitingCount = rows.filter(r => getStatus(r.id) === 'waiting').length;

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-8 h-14 flex items-center justify-between">
          <h1 className="text-lg font-bold text-[#1a2332]">TO DO LIST</h1>
          <button onClick={() => window.close()} className="text-sm text-gray-400 hover:text-gray-600">닫기</button>
        </div>
      </header>

      <div className="px-8 py-6">
        {/* 요약 카드 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-bold text-gray-500 mb-1">전체 할일</p>
            <p className="text-3xl font-bold text-[#1a2332]">{rows.length}</p>
          </div>
          <div className="bg-white rounded-xl border-l-4 border-l-blue-500 border border-gray-200 p-4">
            <p className="text-sm font-bold text-blue-600 mb-1">진행중</p>
            <p className="text-3xl font-bold text-blue-700">{progressCount}</p>
          </div>
          <div className="bg-white rounded-xl border-l-4 border-l-green-500 border border-gray-200 p-4">
            <p className="text-sm font-bold text-green-600 mb-1">완료</p>
            <p className="text-3xl font-bold text-green-700">{doneCount}</p>
          </div>
          <div className="bg-white rounded-xl border-l-4 border-l-red-400 border border-gray-200 p-4">
            <p className="text-sm font-bold text-red-500 mb-1">미처리</p>
            <p className="text-3xl font-bold text-red-600">{rows.length - doneCount - progressCount - waitingCount}</p>
          </div>
        </div>

        {/* 필터 + 검색 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-3">
          <input type="text" placeholder="상품명, SKU, 출고건 검색..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          {[
            { key: 'all', label: `전체 (${rows.length})`, bg: 'bg-[#1a2332]', active: 'text-white' },
            { key: 'active', label: `진행 (${rows.length - doneCount})`, bg: 'bg-blue-600', active: 'text-white' },
            { key: 'done', label: `완료 (${doneCount})`, bg: 'bg-green-600', active: 'text-white' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${filter === f.key ? `${f.bg} ${f.active}` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* 테이블 */}
        {loading ? <p className="text-gray-400 text-center py-16">로딩중...</p> : filtered.length === 0 ? (
          <p className="text-gray-400 text-center py-16">해야할일이 없습니다</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f8f9fb] border-b border-gray-200">
                <tr>
                  <RTh className="px-3 py-3 text-center font-bold text-gray-600 border-r border-gray-200" initialWidth="40px" minWidth={30}></RTh>
                  <RTh className="px-4 py-3 text-center font-bold text-gray-600 border-r border-gray-200" initialWidth="50px" minWidth={40}>#</RTh>
                  <RTh className="px-4 py-3 text-center font-bold text-gray-600 border-r border-gray-200" initialWidth="90px" minWidth={70}>상태</RTh>
                  <RTh className="px-4 py-3 text-center font-bold text-gray-600 border-r border-gray-200" initialWidth="160px" minWidth={100}>출고건</RTh>
                  <RTh className="px-4 py-3 text-center font-bold text-gray-600 border-r border-gray-200" initialWidth="220px" minWidth={120}>상품명</RTh>
                  <RTh className="px-4 py-3 text-center font-bold text-gray-600 border-r border-gray-200" initialWidth="300px" minWidth={150}>해야할일</RTh>
                  <RTh className="px-4 py-3 text-center font-bold text-gray-600 border-r border-gray-200" initialWidth="170px" minWidth={100}>진행상황</RTh>
                  <RTh className="px-4 py-3 text-center font-bold text-gray-600" initialWidth="170px" minWidth={100}>참고</RTh>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const st = getStatusObj(r.id);
                  const todoItems = parseTodos(r.todo);
                  const rowDone = getStatus(r.id) === 'done';
                  return (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      {/* 체크 */}
                      <td className="px-3 py-3 text-center border-r border-gray-100">
                        <input type="checkbox" checked={!!checkedRows[r.id]} onChange={() => toggleRow(r.id)}
                          className="w-4 h-4 rounded cursor-pointer accent-green-500" />
                      </td>
                      {/* # */}
                      <td className="px-4 py-3 font-bold text-gray-400 text-center border-r border-gray-100">{i + 1}</td>
                      {/* 상태 */}
                      <td className="px-4 py-3 text-center border-r border-gray-100">
                        <select value={getStatus(r.id)} onChange={(e) => updateStatus(r.id, e.target.value)}
                          className={`px-2.5 py-1.5 rounded-full text-xs font-bold border-0 cursor-pointer ${st.bg} ${st.text}`}>
                          {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </td>
                      {/* 출고건 */}
                      <td className="px-4 py-3 border-r border-gray-100">
                        <p className="font-bold text-[#1a2332]">{r.shipmentKey}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{r.sku}</p>
                      </td>
                      {/* 상품명 */}
                      <td className="px-4 py-3 border-r border-gray-100">
                        <p className="text-[#1a2332] font-semibold leading-snug" style={{wordBreak:'break-word'}}>{r.labelName}</p>
                      </td>
                      {/* 해야할일 */}
                      <td className="px-4 py-3 border-r border-gray-100">
                        <div className="space-y-2">
                          {todoItems.map((item, idx) => {
                            const key = `${r.id}_${idx}`;
                            const isDone = !!checkedItems[key];
                            return (
                              <div key={idx} className="flex items-start gap-2">
                                <input type="checkbox" checked={isDone} onChange={() => toggleItem(r.id, idx)}
                                  className="w-3.5 h-3.5 mt-[3px] rounded cursor-pointer shrink-0 accent-blue-500" />
                                <div>
                                  <p className="font-semibold leading-snug text-[#1a2332]">
                                    {item.num}. {item.title}
                                  </p>
                                  {item.details.map((d, di) => (
                                    <p key={di} className={`text-xs leading-relaxed mt-0.5 ${isDone ? 'text-gray-300' : 'text-gray-500'}`}>{d}</p>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      {/* 진행상황 */}
                      <td className="px-4 py-3 border-r border-gray-100">
                        <textarea rows={2} spellCheck={false}
                          value={progressData[r.id] || ''}
                          onChange={(e) => updateProgress(r.id, e.target.value)}
                          placeholder="진행상황..."
                          className="w-full text-sm text-[#1a2332] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400 resize-none"
                        />
                      </td>
                      {/* 참고 */}
                      <td className="px-4 py-3 text-gray-600 whitespace-pre-wrap" style={{wordBreak:'break-word'}}>{r.memo || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
