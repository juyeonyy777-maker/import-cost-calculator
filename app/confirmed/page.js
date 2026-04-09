'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';

function fmt(n) {
  if (n === 0 || n == null) return '0';
  return Math.round(n).toLocaleString('ko-KR');
}

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
  if (initialWidth) { s.width = initialWidth; }
  return (
    <th ref={ref} className={className} style={s} {...props}>
      {children}
      <div onMouseDown={onDown} style={{ position:'absolute', right:0, top:0, bottom:0, width:'6px', cursor:'col-resize', userSelect:'none', background:'#cbd5e1', borderRadius:'2px' }}
        onMouseOver={e => { e.currentTarget.style.background = '#94a3b8'; }} onMouseOut={e => { e.currentTarget.style.background = '#cbd5e1'; }} />
    </th>
  );
}

export default function ConfirmedCostPage() {
  const [allData, setAllData] = useState({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  const [displayCount, setDisplayCount] = useState(100);
  const [expandedSku, setExpandedSku] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setDisplayCount(100); }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const [confirmedSet, setConfirmedSet] = useState({});
  const [costMemos, setCostMemos] = useState({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem('costcheck_confirmed');
      if (saved) setConfirmedSet(JSON.parse(saved));
      const savedMemos = localStorage.getItem('costcheck_memos');
      if (savedMemos) setCostMemos(JSON.parse(savedMemos));
    } catch {}
  }, []);

  useEffect(() => {
    fetch('/api/save-all').then(r => r.json()).then(d => { setAllData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
  const costLabels = ['수수료1%','해상운임','DOC','원산지','통관','관세','부가세','내륙운송'];

  // SKU별 최신 1건 + 통계
  const skuList = useMemo(() => {
    const skuMap = {};
    const shipKeys = Object.keys(allData).sort();

    for (const shipKey of shipKeys) {
      const entry = allData[shipKey];
      if (!entry.rows) continue;
      for (const r of entry.rows) {
        if (!r.sku) continue;
        if (!skuMap[r.sku]) {
          skuMap[r.sku] = { costs: [], qtys: [], rows: [] };
        }
        const cKey = `${r.sku}_${shipKey}`;
        const isConfirmed = confirmedSet[cKey];
        const confirmedCost = isConfirmed && costMemos[cKey] ? Number(costMemos[cKey]) : null;
        skuMap[r.sku].rows.push({ ...r, shipmentKey: shipKey, confirmedCost });
        if (r.costPerUnit) {
          skuMap[r.sku].costs.push(r.costPerUnit);
          skuMap[r.sku].qtys.push(r.shippedQty || 0);
        }
      }
    }

    const result = [];
    for (const [sku, data] of Object.entries(skuMap)) {
      const latest = data.rows[data.rows.length - 1];
      const avg = data.costs.length > 0 ? Math.round(data.costs.reduce((s, c) => s + c, 0) / data.costs.length) : 0;
      const totalQty = data.qtys.reduce((s, q) => s + q, 0);
      const weightedAvg = totalQty > 0 ? Math.round(data.costs.reduce((s, c, i) => s + c * data.qtys[i], 0) / totalQty) : 0;
      const costX285 = Math.round((latest.unitPriceRaw || 0) * 285);

      const confirmedRows = data.rows.filter(r => r.confirmedCost !== null);
      const hasConfirmed = confirmedRows.length > 0;
      let confirmedWeightedAvg;
      if (hasConfirmed) {
        const cTotalQty = confirmedRows.reduce((s, r) => s + (r.shippedQty || 0), 0);
        confirmedWeightedAvg = cTotalQty > 0
          ? Math.round(confirmedRows.reduce((s, r) => s + r.confirmedCost * (r.shippedQty || 0), 0) / cTotalQty)
          : weightedAvg;
      } else {
        confirmedWeightedAvg = weightedAvg;
      }

      result.push({
        sku,
        labelName: latest.labelName || latest.productName,
        shipCount: data.rows.length,
        latestShip: latest.shipmentKey,
        cbmPerUnit: latest.cbmPerUnit,
        shippedQty: latest.shippedQty,
        unitPriceCny: latest.unitPriceCny,
        costPerUnit: latest.costPerUnit || 0,
        avgCost: avg,
        weightedAvg,
        confirmedWeightedAvg,
        hasConfirmed,
        confirmedCount: confirmedRows.length,
        costX285,
        costDiff: costX285 - (latest.costPerUnit || 0),
        costs: latest.costs,
        allRows: data.rows,
      });
    }
    return result;
  }, [allData, confirmedSet, costMemos]);

  // 검색 + 정렬
  const filtered = useMemo(() => {
    let result = skuList;
    const q = debouncedSearch.trim().toLowerCase();
    if (searched && q) {
      const kws = q.split(/\s+/);
      result = skuList.filter(r => {
        const text = ((r.sku || '') + ' ' + (r.labelName || '') + ' ' + (r.latestShip || '')).toLowerCase();
        return kws.every(kw => text.includes(kw));
      });
    }
    if (sortKey && sortDir) {
      result = [...result].sort((a, b) => {
        let va, vb;
        if (sortKey.startsWith('cost_')) {
          const ck = sortKey.replace('cost_', '');
          va = a.costs?.[ck]?.perUnit || 0;
          vb = b.costs?.[ck]?.perUnit || 0;
        } else {
          va = a[sortKey]; vb = b[sortKey];
        }
        if (typeof va === 'string') {
          const c = (va || '').localeCompare(vb || '', 'ko');
          return sortDir === 'asc' ? c : -c;
        }
        return sortDir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
      });
    }
    return result;
  }, [skuList, debouncedSearch, searched, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(p => p === 'asc' ? 'desc' : p === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else { setSortKey(key); setSortDir('asc'); }
  };
  const sortIcon = (key) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ▲' : sortDir === 'desc' ? ' ▼' : ' ⇅';
  const th = (bg) => `px-3 py-2 font-bold text-gray-800 whitespace-nowrap cursor-pointer select-none hover:text-blue-600 text-center ${bg}`;

  const columns = [
    { key: 'sku', label: 'SKU', width: '130px' },
    { key: 'labelName', label: '상품명', width: '220px' },
    { key: 'confirmedWeightedAvg', label: <span className="inline-block text-center">확정원가<br/>(가중평균)</span>, width: '100px', bg: 'bg-green-50' },
    { key: 'costPerUnit', label: '최신원가', width: '90px', bg: 'bg-blue-50' },
    { key: 'costX285', label: '원가(x285)', width: '90px', bg: 'bg-amber-100' },
    { key: 'costDiff', label: '차이', width: '80px' },
    { key: 'shipCount', label: '출고횟수', width: '70px' },
    { key: 'latestShip', label: '최신출고', width: '150px' },
    { key: 'cbmPerUnit', label: '개별CBM', width: '80px' },
  ];

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">확정 원가</h1>
        <p className="text-sm text-gray-500 mt-1">SKU별 최신 1건 원가 · {skuList.length}개 SKU</p>
      </header>

      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6 max-w-2xl mx-auto">
        <div className="flex gap-3">
          <input type="text" placeholder="SKU, 상품명 검색..." value={search}
            onChange={e => { setSearch(e.target.value); setSearched(false); }}
            onKeyDown={e => { if (e.key === 'Enter') setSearched(true); }}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          <button onClick={() => setSearched(true)} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700">조회</button>
          <button onClick={async () => {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();
            const headers = ['SKU','상품명','확정원가','최신원가','원가(x285)','차이','출고횟수','최신출고','개별CBM'];
            const wsData = [headers, ...filtered.map(r => [
              r.sku, r.labelName,
              r.confirmedWeightedAvg ?? '', r.costPerUnit, r.costX285, r.costDiff,
              r.shipCount, r.latestShip, r.cbmPerUnit || 0,
            ])];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, '확정원가');
            XLSX.writeFile(wb, `확정원가_${new Date().toISOString().slice(0,10)}.xlsx`);
          }} className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 whitespace-nowrap">EXCEL 다운</button>
        </div>
      </div>

      {loading ? <p className="text-gray-500 text-center py-10">로딩중...</p> : filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-10">{searched ? '검색 결과 없음' : '저장된 데이터 없음'}</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th('') + ' w-10'}></th>
                  {columns.map(c => (
                    <RTh key={c.key} className={th(c.bg || '') + (c.key === 'confirmedWeightedAvg' ? ' !whitespace-normal' : '')} initialWidth={c.width} onClick={() => handleSort(c.key)}>{c.label}{sortIcon(c.key)}</RTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expandedSku ? (() => {
                  const row = filtered.find(r => r.sku === expandedSku) || skuList.find(r => r.sku === expandedSku);
                  if (!row) return null;
                  return (
                    <>
                      <tr className="bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => setExpandedSku(null)}>
                        <td className="px-3 py-2.5 text-center text-gray-400">▲</td>
                        <td colSpan={999} className="px-3 py-2.5 font-bold text-sm">
                          {row.sku} — {row.labelName} ({row.allRows.length}건)
                        </td>
                      </tr>
                      <tr className="h-0"><td colSpan={999} className="p-0 border-t-2 border-blue-300"></td></tr>
                      {row.allRows.map((sub, j) => (
                        <tr key={j} className={j % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}>
                          <td className="px-3 py-2.5"></td>
                          <td className="px-3 py-2.5 font-mono text-sm font-semibold text-center">{sub.sku}</td>
                          <td className="px-3 py-2.5 text-sm text-center" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>{sub.labelName || sub.productName}</td>
                          <td className={`px-3 py-2.5 text-center text-sm font-semibold ${sub.confirmedCost !== null ? 'text-green-600' : 'text-gray-900'}`}>{sub.confirmedCost !== null ? fmt(sub.confirmedCost) + '원' : fmt(sub.costPerUnit) + '원'}</td>
                          <td className="px-3 py-2.5 text-center text-sm font-semibold text-blue-700">-</td>

                          <td className="px-3 py-2.5 text-center text-sm font-semibold">{fmt(Math.round((sub.unitPriceRaw || 0) * 285))}원</td>
                          <td className={`px-3 py-2.5 text-center text-sm font-semibold ${(Math.round((sub.unitPriceRaw || 0) * 285) - (sub.costPerUnit || 0)) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{(Math.round((sub.unitPriceRaw || 0) * 285) - (sub.costPerUnit || 0)) >= 0 ? '+' : ''}{fmt(Math.round((sub.unitPriceRaw || 0) * 285) - (sub.costPerUnit || 0))}원</td>
                          <td className="px-3 py-2.5 text-center text-sm font-semibold">-</td>
                          <td className="px-3 py-2.5 text-sm font-semibold text-center whitespace-nowrap">{sub.shipmentKey}</td>
                          <td className="px-3 py-2.5 text-center text-sm">{sub.cbmPerUnit ? sub.cbmPerUnit.toFixed(4) : '-'}</td>
                        </tr>
                      ))}
                    </>
                  );
                })() : (
                  filtered.slice(0, displayCount).map((row, i) => {
                    const hasMultiple = row.allRows.length > 1;
                    return (
                      <tr key={row.sku} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} cursor-pointer hover:bg-blue-50/30 transition-colors`} onClick={() => setExpandedSku(row.sku)}>
                        <td className="px-3 py-2.5 text-center text-gray-400">▼</td>
                        <td className="px-3 py-2.5 font-mono text-sm font-semibold text-center">{row.sku}</td>
                        <td className="px-3 py-2.5 text-sm text-center" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>{row.labelName}</td>
                        <td className={`px-3 py-2.5 text-center text-sm font-semibold ${row.hasConfirmed ? 'text-green-600' : 'text-gray-900'}`}>{fmt(row.confirmedWeightedAvg)}원</td>
                        <td className="px-3 py-2.5 text-center text-sm font-semibold text-blue-700">{fmt(row.costPerUnit)}원</td>

                        <td className="px-3 py-2.5 text-center text-sm font-semibold">{fmt(row.costX285)}원</td>
                        <td className={`px-3 py-2.5 text-center text-sm font-semibold ${row.costDiff >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{row.costDiff >= 0 ? '+' : ''}{fmt(row.costDiff)}원</td>
                        <td className="px-3 py-2.5 text-center text-sm font-semibold">{row.shipCount}회</td>
                        <td className="px-3 py-2.5 text-sm font-semibold text-center whitespace-nowrap">{row.latestShip}</td>
                        <td className="px-3 py-2.5 text-center text-sm">{row.cbmPerUnit ? row.cbmPerUnit.toFixed(4) : '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > displayCount && (
            <div className="py-3 text-center border-t">
              <button onClick={() => setDisplayCount(c => c + 100)}
                className="px-6 py-2 bg-[#1a2332] text-white rounded-lg text-sm font-semibold hover:bg-[#2a3342]">
                더보기 ({displayCount}/{filtered.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
