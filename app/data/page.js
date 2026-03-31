'use client';

import { useState, useEffect } from 'react';

function formatNumber(num) {
  if (num === 0 || num === undefined || num === null) return '0';
  return Math.round(num).toLocaleString('ko-KR');
}

export default function DataPage() {
  const [allData, setAllData] = useState({});
  const [search, setSearch] = useState('');
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null); // 'asc' | 'desc' | null

  useEffect(() => {
    fetch('/api/save-all')
      .then(r => r.json())
      .then(data => { setAllData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
  const costLabels = ['수수료1%','해상운임','DOC','원산지','통관','관세','부가세','내륙운송'];

  const columns = [
    { key: 'shipmentKey', label: '출고', type: 'string' },
    { key: 'sku', label: 'SKU', type: 'string' },
    { key: 'productName', label: '품명', type: 'string' },
    { key: 'shippedQty', label: '수량', type: 'number' },
    { key: 'unitPriceCny', label: '단가(CNY)', type: 'number' },
    { key: 'costPerUnit', label: '원가(개당)', type: 'number' },
    { key: 'avgCost', label: '평균 원가', type: 'number' },
    { key: 'costX285', label: '원가(x285)', type: 'number' },
    { key: 'costDiff', label: '차이', type: 'number' },
    ...costKeys.map((k, i) => ({ key: 'cost_' + k, label: costLabels[i], type: 'number' })),
  ];

  // 전체 행 펼치기
  const allRows = [];
  const skuCosts = {};
  for (const [shipmentKey, entry] of Object.entries(allData)) {
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
  for (const [shipmentKey, entry] of Object.entries(allData)) {
    if (!entry.rows) continue;
    for (const r of entry.rows) {
      const costX285 = Math.round((r.unitPriceRaw || 0) * 285);
      allRows.push({ ...r, shipmentKey, costX285, avgCost: skuAvg[r.sku] || 0, costDiff: costX285 - (r.costPerUnit || 0) });
    }
  }

  // 검색 필터
  const getFiltered = () => {
    const query = search.trim().toLowerCase();
    if (!searched || !query) return allRows;
    const keywords = query.split(/\s+/);
    return allRows.filter(r => {
      const text = ((r.sku || '') + ' ' + (r.productName || '') + ' ' + (r.shipmentKey || '')).toLowerCase();
      return keywords.every(kw => text.includes(kw));
    });
  };

  let filtered = getFiltered();

  // 정렬
  if (sortKey && sortDir) {
    filtered = [...filtered].sort((a, b) => {
      let va, vb;
      if (sortKey.startsWith('cost_')) {
        const ck = sortKey.replace('cost_', '');
        va = a.costs?.[ck]?.perUnit || 0;
        vb = b.costs?.[ck]?.perUnit || 0;
      } else {
        va = a[sortKey];
        vb = b[sortKey];
      }
      if (typeof va === 'string') {
        const cmp = (va || '').localeCompare(vb || '', 'ko');
        return sortDir === 'asc' ? cmp : -cmp;
      }
      return sortDir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
    });
  }

  const shipmentCount = Object.keys(allData).length;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return ' ⇅';
    if (sortDir === 'asc') return ' ▲';
    if (sortDir === 'desc') return ' ▼';
    return ' ⇅';
  };

  const handleSearch = () => { setSearched(true); };
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch(); };

  const thClass = (bg) => `px-3 py-2 font-bold text-gray-800 whitespace-nowrap cursor-pointer select-none hover:text-blue-600 ${bg}`;

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">전체 데이터</h1>
        <p className="text-sm text-gray-500 mt-1">저장된 모든 출고 건의 수입원가 데이터 ({shipmentCount}건 출고 / {allRows.length}개 SKU)</p>
      </header>

      <div className="bg-white rounded-xl shadow-sm border p-6 mb-6 max-w-2xl mx-auto">
        <h2 className="text-lg font-semibold mb-4">데이터 검색</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="바코드(SKU), 상품명, 출고코드 검색..."
            value={search}
            onChange={e => { setSearch(e.target.value); setSearched(false); }}
            onKeyDown={handleKeyDown}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button onClick={handleSearch} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors">조회</button>
          <button onClick={() => window.open('/api/save-all/download', '_blank')} className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-colors whitespace-nowrap">전체 EXCEL 다운</button>
        </div>
        <p className="text-xs text-gray-400 mt-2">키워드 하나만 맞아도 검색됩니다. 헤더 클릭으로 정렬할 수 있습니다.</p>
      </div>

      {loading ? (
        <p className="text-gray-500 text-center py-10">로딩중...</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-gray-600 font-medium">{searched && search.trim() ? '검색 결과' : '전체 데이터'}: {filtered.length}건</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-gray-500 text-center py-10">{searched && search.trim() ? '검색 결과가 없습니다.' : '저장된 데이터가 없습니다.'}</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="text-sm w-full" style={{ tableLayout: 'auto' }}>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className={thClass('sticky left-0 bg-gray-50 z-10 text-left')} onClick={() => handleSort('shipmentKey')}>출고{sortIcon('shipmentKey')}</th>
                      <th className={thClass('text-left')} onClick={() => handleSort('sku')}>SKU{sortIcon('sku')}</th>
                      <th className={thClass('text-left')} onClick={() => handleSort('productName')}>품명{sortIcon('productName')}</th>
                      <th className={thClass('text-right')} onClick={() => handleSort('shippedQty')}>수량{sortIcon('shippedQty')}</th>
                      <th className={thClass('text-right bg-pink-100')} onClick={() => handleSort('unitPriceCny')}>단가(CNY){sortIcon('unitPriceCny')}</th>
                      <th className={thClass('text-right bg-blue-50')} onClick={() => handleSort('costPerUnit')}>원가(개당){sortIcon('costPerUnit')}</th>
                      <th className={thClass('text-right bg-purple-50')} onClick={() => handleSort('avgCost')}>평균 원가{sortIcon('avgCost')}</th>
                      <th className={thClass('text-right bg-amber-100')} onClick={() => handleSort('costX285')}>원가(x285){sortIcon('costX285')}</th>
                      <th className={thClass('text-right')} onClick={() => handleSort('costDiff')}>차이{sortIcon('costDiff')}</th>
                      {costKeys.map((k, i) => (
                        <th key={k} className={thClass('text-right bg-sky-50')} onClick={() => handleSort('cost_' + k)}>{costLabels[i]}{sortIcon('cost_' + k)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className={`px-3 py-2 font-bold text-xs whitespace-nowrap sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{row.shipmentKey}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.sku}</td>
                        <td className="px-3 py-2 text-xs" style={{ wordBreak: 'break-word', maxWidth: '300px' }}>{row.productName}</td>
                        <td className="px-3 py-2 text-right">{row.shippedQty}</td>
                        <td className="px-3 py-2 text-right font-bold">{row.unitPriceCny}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{formatNumber(row.costPerUnit)}원</td>
                        <td className="px-3 py-2 text-right font-bold text-purple-700">{row.avgCost ? formatNumber(row.avgCost) + '원' : '-'}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatNumber(row.costX285)}원</td>
                        <td className={`px-3 py-2 text-right font-bold ${row.costDiff >= 0 ? 'text-red-600' : 'text-blue-600'}`}>{row.costDiff >= 0 ? '+' : ''}{formatNumber(row.costDiff)}원</td>
                        {costKeys.map(k => (
                          <td key={k} className="px-3 py-2 text-right">{formatNumber(row.costs?.[k]?.perUnit)}원</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
