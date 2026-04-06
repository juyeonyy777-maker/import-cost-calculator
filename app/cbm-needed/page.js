'use client';

import { useState, useEffect, Fragment } from 'react';

export default function CbmNeededPage() {
  const [data, setData] = useState([]);
  const [neverZeroData, setNeverZeroData] = useState([]);
  const [allSkuData, setAllSkuData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [boxSizes, setBoxSizes] = useState({});
  const [tempSizes, setTempSizes] = useState({});
  const [confirmedCbm, setConfirmedCbm] = useState({});
  const [tempCbm, setTempCbm] = useState({});
  const [expandedSku, setExpandedSku] = useState(null);
  const [selectedBoxInfo, setSelectedBoxInfo] = useState({});
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    fetch('/api/cbm-needed?type=never-zero').then(r => r.json()).then(d => setNeverZeroData(d)).catch(() => {});
    fetch('/api/cbm-needed?type=all').then(r => r.json()).then(d => setAllSkuData(d)).catch(() => {});
    fetch('/api/cbm-needed').then(r => r.json()).then(d => {
      setData(d);
      // 한 박스 꽉참 + calcCbm 있는 것 자동 확정
      setConfirmedCbm(prev => {
        const next = { ...prev };
        let changed = false;
        d.forEach(item => {
          if (item.fullBox && item.calcCbm > 0 && !next[item.sku]) {
            next[item.sku] = String(item.calcCbm);
            changed = true;
          }
        });
        if (changed) localStorage.setItem('cbm_confirmed', JSON.stringify(next));
        return next;
      });
      setLoading(false);
    }).catch(() => setLoading(false));
    try {
      const s1 = localStorage.getItem('cbm_box_sizes'); if (s1) setBoxSizes(JSON.parse(s1));
      const s2 = localStorage.getItem('cbm_confirmed'); if (s2) setConfirmedCbm(JSON.parse(s2));
    } catch {}
  }, []);

  let filtered = search === '__neverzero__' ? neverZeroData : search === '__all__' ? allSkuData : data;
  if (search === '__fullbox__') {
    filtered = data.filter(r => r.fullBox && !confirmedCbm[r.sku]);
  } else if (search === '__confirmed__') {
    filtered = data.filter(r => !!confirmedCbm[r.sku]);
  } else if (search === '__unconfirmed__') {
    filtered = data.filter(r => !confirmedCbm[r.sku]);
  } else if (search === '__neverzero__' || search === '__all__') {
    // already set above
  } else if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(r => (r.sku + ' ' + r.name).toLowerCase().includes(q));
  }

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(p => p === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const sortIcon = (key) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ▲' : ' ▼';

  function calcCbm(sizeStr) {
    if (!sizeStr) return 0;
    const parts = sizeStr.replace(/[xX×*]/g, '*').split('*').map(s => parseFloat(s.trim()));
    if (parts.length !== 3 || parts.some(isNaN)) return 0;
    return Math.round((parts[0] * parts[1] * parts[2] / 1000000) * 10000) / 10000;
  }

  function getCbm(r) {
    if (confirmedCbm[r.sku]) return parseFloat(confirmedCbm[r.sku]);
    if (r.calcCbm) return r.calcCbm;
    return calcCbm(boxSizes[r.sku] || '');
  }

  filtered = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'sku') cmp = (a.sku || '').localeCompare(b.sku || '');
    else if (sortKey === 'name') cmp = (a.name || '').localeCompare(b.name || '');
    else if (sortKey === 'count') cmp = (a.count || 0) - (b.count || 0);
    else if (sortKey === 'totalQty') cmp = (a.totalQty || 0) - (b.totalQty || 0);
    else if (sortKey === 'cbm') cmp = getCbm(a) - getCbm(b);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const updateBoxSize = (sku, val) => {
    setBoxSizes(prev => { const next = { ...prev, [sku]: val }; localStorage.setItem('cbm_box_sizes', JSON.stringify(next)); return next; });
  };
  const confirmCbm = (sku, val) => {
    setConfirmedCbm(prev => { const next = { ...prev, [sku]: val }; localStorage.setItem('cbm_confirmed', JSON.stringify(next)); return next; });
  };

  const confirmedCount = data.filter(r => getCbm(r) > 0).length;
  const thCls = 'px-3 py-2.5 text-sm font-semibold whitespace-nowrap cursor-pointer hover:text-blue-600 select-none';

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-8 h-12 flex items-center justify-between">
          <h1 className="text-base font-bold text-[#1a2332]">CBM 입력필요</h1>
          <button onClick={() => window.close()} className="text-sm text-gray-400 hover:text-gray-600">닫기</button>
        </div>
      </header>

      <div className="px-8 py-6">
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 mb-6">
          <p className="text-sm text-amber-700">엑셀에서 CBM이 0으로 잡힌 상품입니다. 박스 사이즈(cm)를 입력하거나 CBM을 직접 확정할 수 있습니다.</p>
          <p className="text-xs text-amber-500 mt-1">총 {data.length}개 SKU / CBM 확보 {confirmedCount}개 / 미입력 {data.length - confirmedCount}개</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-3">
          <input type="text" placeholder="SKU, 상품명 검색..." value={search.startsWith('__') ? '' : search}
            onChange={e => setSearch(e.target.value)}
            className="w-72 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400" />
          <button onClick={() => setSearch(search === '__fullbox__' ? '' : '__fullbox__')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${search === '__fullbox__' ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}`}>
            한 박스 꽉참 ({data.filter(r => r.fullBox && !confirmedCbm[r.sku]).length})
          </button>
          {search === '__fullbox__' && (() => {
            const unconfirmed = data.filter(r => r.fullBox && r.calcCbm > 0 && !confirmedCbm[r.sku]);
            if (unconfirmed.length === 0) return null;
            return (
              <button onClick={() => {
                const next = { ...confirmedCbm };
                unconfirmed.forEach(r => { next[r.sku] = String(r.calcCbm); });
                setConfirmedCbm(next);
                localStorage.setItem('cbm_confirmed', JSON.stringify(next));
              }}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700 transition-colors">
                전체 CBM 확정 ({unconfirmed.length}건)
              </button>
            );
          })()}
          <button onClick={() => setSearch(search === '__confirmed__' ? '' : '__confirmed__')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${search === '__confirmed__' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
            CBM 확정 ({data.filter(r => !!confirmedCbm[r.sku]).length})
          </button>
          <button onClick={() => setSearch(search === '__unconfirmed__' ? '' : '__unconfirmed__')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${search === '__unconfirmed__' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>
            CBM 미확정 ({data.filter(r => !confirmedCbm[r.sku]).length})
          </button>
          <button onClick={() => setSearch(search === '__neverzero__' ? '' : '__neverzero__')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${search === '__neverzero__' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            CBM 0인 적 없음 ({neverZeroData.length})
          </button>
          <button onClick={() => setSearch(search === '__all__' ? '' : '__all__')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${search === '__all__' ? 'bg-[#1a2332] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            전체 ({allSkuData.length})
          </button>
        </div>

        {loading ? <p className="text-gray-400 text-center py-16">로딩중...</p> : filtered.length === 0 ? (
          <p className="text-gray-400 text-center py-16">CBM 입력이 필요한 상품이 없습니다</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f5f6fa] border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2.5 text-center text-sm font-semibold text-gray-600 w-10"></th>
                    <th className="px-3 py-2.5 text-center text-sm font-semibold text-gray-600 w-12">#</th>
                    <th className={`${thCls} text-left`} onClick={() => handleSort('sku')}>SKU{sortIcon('sku')}</th>
                    <th className={`${thCls} text-left`} onClick={() => handleSort('name')}>상품명{sortIcon('name')}</th>
                    <th className={`${thCls} text-center`} onClick={() => handleSort('count')}>출고횟수{sortIcon('count')}</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('totalQty')}>총 수량{sortIcon('totalQty')}</th>
                    <th className="px-3 py-2.5 text-center text-sm font-semibold text-gray-600">박스 사이즈 (가로x세로x높이 cm)</th>
                    <th className={`${thCls} text-right`} onClick={() => handleSort('cbm')}>CBM{sortIcon('cbm')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const sizeVal = boxSizes[r.sku] || '';
                    const cbm = getCbm(r);
                    const isExpanded = expandedSku === r.sku;
                    const isConfirmed = !!confirmedCbm[r.sku];
                    return (
                      <Fragment key={r.sku}>
                        <tr className={`border-b border-gray-200 hover:bg-gray-50/50 cursor-pointer ${cbm > 0 ? 'bg-green-50/30' : ''}`}
                          onClick={() => setExpandedSku(isExpanded ? null : r.sku)}>
                          <td className="px-3 py-2.5 text-center text-gray-400">{isExpanded ? '▼' : '▶'}</td>
                          <td className="px-3 py-2.5 text-center text-gray-400 text-sm">{i + 1}</td>
                          <td className="px-3 py-2.5 text-sm">{r.sku}</td>
                          <td className="px-3 py-2.5 text-sm" style={{wordBreak:'break-word', maxWidth:'300px'}}>{r.name}</td>
                          <td className="px-3 py-2.5 text-center text-sm">{r.count || 0}</td>
                          <td className="px-3 py-2.5 text-right text-sm">{r.totalQty > 0 ? r.totalQty.toLocaleString('ko-KR') : '-'}</td>
                          <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            {isConfirmed && (() => {
                              const soloH = (r.history || []).find(h => h.perUnitCbm > 0 && h.boxSize);
                              if (soloH) return (
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs border border-blue-200">
                                  {soloH.boxSize}cm / {soloH.boxQty}개입
                                </span>
                              );
                              if (sizeVal) return (
                                <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded text-xs border border-green-200">
                                  {sizeVal}cm
                                </span>
                              );
                              return null;
                            })()}
                            {!isConfirmed && (
                              <div className="flex items-center justify-center gap-1">
                                <input type="text" value={tempSizes[r.sku] !== undefined ? tempSizes[r.sku] : sizeVal}
                                  onChange={e => setTempSizes(prev => ({ ...prev, [r.sku]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') { updateBoxSize(r.sku, tempSizes[r.sku] || ''); setTempSizes(prev => { const n = {...prev}; delete n[r.sku]; return n; }); } }}
                                  placeholder="예: 30x20x15"
                                  className={`w-32 px-2 py-1.5 border rounded-lg text-sm text-center focus:outline-none focus:border-blue-400 ${cbm > 0 ? 'border-green-300 bg-green-50' : 'border-gray-200'}`} />
                                <button onClick={() => { updateBoxSize(r.sku, tempSizes[r.sku] !== undefined ? tempSizes[r.sku] : sizeVal); setTempSizes(prev => { const n = {...prev}; delete n[r.sku]; return n; }); }}
                                  className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors whitespace-nowrap">입력</button>
                              </div>
                            )}
                          </td>
                          <td className={`px-3 py-2.5 text-right text-sm font-bold ${isConfirmed ? 'text-blue-600' : cbm > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                            {isConfirmed ? cbm + ' ✓' : cbm > 0 ? cbm : '-'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={8} className="px-0 py-0">
                              <div className="bg-gray-50 border-b border-gray-200 px-8 py-4">
                                <p className="text-xs font-semibold text-gray-500 mb-3">출고건별 CBM 이력 — {(r.history || []).length}건</p>
                                <div className="space-y-2 mb-4">
                                  {[...(r.history || [])].sort((a, b) => (a.shipment || '').localeCompare(b.shipment || '')).map((h, hi) => (
                                    <div key={hi} className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-gray-200 text-sm">
                                      <span className="font-bold text-[#1a2332] w-44">{h.shipment}</span>
                                      <span className="text-gray-500">{h.qty}개</span>
                                      <span className="text-gray-500">{h.boxes}박스</span>
                                      <span className="text-gray-300">|</span>
                                      <span className="font-bold">CBM: {h.cbmValues.map((v, vi) => (
                                        <span key={vi} className={v === 0 ? 'text-red-500' : 'text-green-600'}>
                                          {vi > 0 ? ', ' : ''}{v}
                                        </span>
                                      ))}</span>
                                      {h.hasZero && <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-xs font-bold">0포함</span>}
                                      {h.perUnitCbm > 0 && (
                                        <>
                                          <span className="text-gray-300">|</span>
                                          <span className="font-bold text-blue-600">개당 {h.perUnitCbm}</span>
                                          {h.boxSize && (
                                            <span onClick={() => { setTempCbm(prev => ({ ...prev, [r.sku]: String(h.perUnitCbm) })); setSelectedBoxInfo(prev => ({ ...prev, [r.sku]: { boxSize: h.boxSize, boxQty: h.boxQty } })); }}
                                              className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors">
                                              {h.boxSize}cm / {h.boxQty}개입
                                            </span>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 px-4 py-3">
                                  <span className="text-sm font-semibold text-gray-600">CBM 확정:</span>
                                  <input type="text" value={tempCbm[r.sku] !== undefined ? tempCbm[r.sku] : (confirmedCbm[r.sku] || '')}
                                    onChange={e => setTempCbm(prev => ({ ...prev, [r.sku]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') { confirmCbm(r.sku, tempCbm[r.sku] || ''); setTempCbm(prev => { const n = {...prev}; delete n[r.sku]; return n; }); } }}
                                    placeholder="개당 CBM 입력 (예: 0.12)"
                                    className="w-48 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-blue-400" />
                                  <button onClick={() => { confirmCbm(r.sku, tempCbm[r.sku] !== undefined ? tempCbm[r.sku] : (confirmedCbm[r.sku] || '')); setTempCbm(prev => { const n = {...prev}; delete n[r.sku]; return n; }); }}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors">확정</button>
                                  {confirmedCbm[r.sku] && (
                                    <button onClick={() => { const next = { ...confirmedCbm }; delete next[r.sku]; setConfirmedCbm(next); localStorage.setItem('cbm_confirmed', JSON.stringify(next)); }}
                                      className="px-3 py-1.5 bg-red-50 text-red-500 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors">취소</button>
                                  )}
                                  {selectedBoxInfo[r.sku] && (
                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-xs border border-blue-200">
                                      {selectedBoxInfo[r.sku].boxSize}cm / {selectedBoxInfo[r.sku].boxQty}개입
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
