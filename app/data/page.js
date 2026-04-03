'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';

function formatNum(n) {
  if (n === 0 || n == null) return '0';
  return Math.round(n).toLocaleString('ko-KR');
}

export default function DataPage() {
  const [allData, setAllData] = useState({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searched, setSearched] = useState(false);

  // 디바운스: 타이핑 후 200ms 뒤에 실제 검색
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setDisplayCount(100); }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  const [displayCount, setDisplayCount] = useState(100);

  useEffect(() => {
    fetch('/api/save-all').then(r => r.json()).then(d => { setAllData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
  const costLabels = ['수수료1%','해상운임','DOC','원산지','통관','관세','부가세','내륙운송'];

  // 전체 행 (useMemo로 allData 변경 시에만 재계산)
  const allRows = useMemo(() => {
    const skuCosts = {};
    for (const entry of Object.values(allData)) {
      if (!entry.rows) continue;
      for (const r of entry.rows) {
        if (r.sku && r.costPerUnit) {
          if (!skuCosts[r.sku]) skuCosts[r.sku] = [];
          skuCosts[r.sku].push(r.costPerUnit);
        }
      }
    }
    const skuAvg = {};
    for (const [sku, costs] of Object.entries(skuCosts)) {
      skuAvg[sku] = Math.round(costs.reduce((s, c) => s + c, 0) / costs.length);
    }

    const skuShipCount = {};
    for (const [shipmentKey, entry] of Object.entries(allData)) {
      if (!entry.rows) continue;
      for (const r of entry.rows) {
        if (!r.sku) continue;
        if (!skuShipCount[r.sku]) skuShipCount[r.sku] = new Set();
        skuShipCount[r.sku].add(shipmentKey);
      }
    }

    const rows = [];
    for (const [shipmentKey, entry] of Object.entries(allData)) {
      if (!entry.rows) continue;
      for (const r of entry.rows) {
        const costX285 = Math.round((r.unitPriceRaw || 0) * 285);
        rows.push({ ...r, shipmentKey, costX285, avgCost: skuAvg[r.sku] || 0, costDiff: costX285 - (r.costPerUnit || 0), shipCount: skuShipCount[r.sku]?.size || 0 });
      }
    }
    return rows;
  }, [allData]);

  // 검색 + 정렬 (useMemo로 캐싱)
  const filtered = useMemo(() => {
    let result = allRows;
    const q = debouncedSearch.trim().toLowerCase();
    if (searched && q) {
      const kws = q.split(/\s+/);
      result = allRows.filter(r => {
        const text = ((r.sku || '') + ' ' + (r.labelName || '') + ' ' + (r.productName || '') + ' ' + (r.shipmentKey || '')).toLowerCase();
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
  }, [allRows, debouncedSearch, searched, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(p => p === 'asc' ? 'desc' : p === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else { setSortKey(key); setSortDir('asc'); }
  };
  const sortIcon = (key) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ▲' : sortDir === 'desc' ? ' ▼' : ' ⇅';
  const th = (bg) => `px-3 py-2 font-bold text-gray-800 whitespace-nowrap cursor-pointer select-none hover:text-blue-600 ${bg}`;

  const columns = [
    { key: 'shipmentKey', label: '출고', align: 'left', bg: 'sticky left-0 bg-gray-50 z-10' },
    { key: 'sku', label: 'SKU', align: 'center' },
    { key: 'shipCount', label: '출고횟수', align: 'center' },
    { key: 'productName', label: '라벨명', align: 'left' },
    { key: 'shippedQty', label: '수량', align: 'right' },
    { key: 'unitPriceCny', label: '단가(CNY)', align: 'right', bg: 'bg-pink-100' },
    { key: 'costPerUnit', label: '원가(개당)', align: 'right', bg: 'bg-blue-50' },
    { key: 'avgCost', label: '평균원가', align: 'right', bg: 'bg-purple-50' },
    { key: 'costX285', label: '원가(x285)', align: 'right', bg: 'bg-amber-100' },
    { key: 'costDiff', label: '차이', align: 'right' },
  ];

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">전체 데이터</h1>
        <p className="text-sm text-gray-500 mt-1">{Object.keys(allData).length}건 출고 / {allRows.length}개 SKU</p>
      </header>

      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6 max-w-2xl mx-auto">
        <div className="flex gap-3">
          <input type="text" placeholder="SKU, 상품명, 출고코드 검색..." value={search}
            onChange={e => { setSearch(e.target.value); setSearched(false); }}
            onKeyDown={e => { if (e.key === 'Enter') setSearched(true); }}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          <button onClick={() => setSearched(true)} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700">조회</button>
          <button onClick={async () => {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();
            const headers = ['출고','SKU','출고횟수','품명','수량','단가(CNY)','원가(개당)','평균원가','원가(x285)','차이',...costLabels];
            const wsData = [headers, ...filtered.map(r => [
              r.shipmentKey, r.sku, r.shipCount, r.productName, r.shippedQty, r.unitPriceCny,
              r.costPerUnit, r.avgCost, r.costX285, r.costDiff,
              ...costKeys.map(k => r.costs?.[k]?.perUnit || 0),
            ])];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [{wch:18},{wch:20},{wch:40},{wch:8},{wch:10},{wch:12},{wch:12},{wch:12},{wch:10},...costKeys.map(() => ({wch:10}))];
            XLSX.utils.book_append_sheet(wb, ws, '데이터');
            XLSX.writeFile(wb, `전체데이터_${new Date().toISOString().slice(0,10)}.xlsx`);
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
                  {columns.map(c => (
                    <th key={c.key} className={th(`text-${c.align} ${c.bg || ''}`)} onClick={() => handleSort(c.key)}>{c.label}{sortIcon(c.key)}</th>
                  ))}
                  {costKeys.map((k, i) => (
                    <th key={k} className={th('text-right bg-sky-50')} onClick={() => handleSort('cost_' + k)}>{costLabels[i]}{sortIcon('cost_' + k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, displayCount).map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className={`px-3 py-2 font-bold text-xs whitespace-nowrap sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{row.shipmentKey}</td>
                    <td className="px-3 py-2 font-mono text-xs text-center">{row.sku}</td>
                    <td className="px-3 py-2 text-center font-bold">{row.shipCount}회</td>
                    <td className="px-3 py-2 text-xs" style={{ maxWidth: '300px', wordBreak: 'break-word' }}>{row.labelName || row.productName}</td>
                    <td className="px-3 py-2 text-right">{row.shippedQty}</td>
                    <td className="px-3 py-2 text-right font-bold">{row.unitPriceCny}</td>
                    <td className="px-3 py-2 text-right font-bold text-blue-700">{formatNum(row.costPerUnit)}원</td>
                    <td className="px-3 py-2 text-right font-bold text-purple-700">{row.avgCost ? formatNum(row.avgCost) + '원' : '-'}</td>
                    <td className="px-3 py-2 text-right font-bold">{formatNum(row.costX285)}원</td>
                    <td className={`px-3 py-2 text-right font-bold ${row.costDiff >= 0 ? 'text-red-600' : 'text-blue-600'}`}>{row.costDiff >= 0 ? '+' : ''}{formatNum(row.costDiff)}원</td>
                    {costKeys.map(k => <td key={k} className="px-3 py-2 text-right">{formatNum(row.costs?.[k]?.perUnit)}원</td>)}
                  </tr>
                ))}
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
