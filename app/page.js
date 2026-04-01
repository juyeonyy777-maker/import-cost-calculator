'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/* ── 유틸 ── */
function fmt(n) {
  if (n === 0 || n == null) return '0';
  return Math.round(n).toLocaleString('ko-KR');
}

function sendLog(user, action, detail) {
  fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: user, action, detail }) }).catch(() => {});
}

/* ── 리사이즈 가능한 TH ── */
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
  if (initialWidth) { s.width = initialWidth; s.minWidth = initialWidth; }
  return (
    <th ref={ref} className={className} style={s} {...props}>
      {children}
      <div onMouseDown={onDown} style={{ position:'absolute', right:0, top:0, bottom:0, width:'4px', cursor:'col-resize', userSelect:'none', background:'#cbd5e1', borderRadius:'2px' }}
        onMouseOver={e => e.currentTarget.style.background='#94a3b8'} onMouseOut={e => e.currentTarget.style.background='#cbd5e1'} />
    </th>
  );
}

/* ── 메인 ── */
export default function Home() {
  const [userName, setUserName] = useState('');
  const [nameOk, setNameOk] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelFile2, setExcelFile2] = useState(null);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [declarationFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [parsedInfo, setParsedInfo] = useState(null);
  const [yuanMap, setYuanMap] = useState({});
  const [skuAvgCost, setSkuAvgCost] = useState({});
  const [recent5, setRecent5] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(null);
  const dropRef = useRef(null);

  useEffect(() => { const s = localStorage.getItem('userName'); if (s) { setUserName(s); setNameOk(true); } }, []);
  useEffect(() => { const p = e => e.preventDefault(); window.addEventListener('dragover', p); window.addEventListener('drop', p); return () => { window.removeEventListener('dragover', p); window.removeEventListener('drop', p); }; }, []);

  /* ── 파일 자동 분류 (ZIP 해제 포함) ── */
  const classifyAndSet = async (files) => {
    for (const f of files) {
      const name = f.name.toLowerCase();
      // ZIP 자동 해제
      if (name.endsWith('.zip')) {
        try {
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(f);
          const extracted = [];
          for (const [fn, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            const blob = await entry.async('blob');
            extracted.push(new File([blob], fn, { type: blob.type }));
          }
          await classifyAndSet(extracted);
        } catch (e) { console.error('ZIP 해제 실패:', e); }
        continue;
      }
      const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
      const isPdf = name.endsWith('.pdf');
      if (isExcel && name.includes('출고내역')) { setExcelFile2(f); sendLog(userName, '파일업로드', '출고내역: ' + f.name); }
      else if (isExcel) { setExcelFile(f); sendLog(userName, '파일업로드', '결제명세서: ' + f.name); }
      else if (isPdf) { setInvoiceFile(f); sendLog(userName, '파일업로드', '청구서: ' + f.name); }
    }
  };

  /* ── 원가 계산 ── */
  const handleCalc = async () => {
    if (!excelFile) { setError('결제명세서를 업로드해주세요.'); return; }
    if (!excelFile2) { setError('출고내역을 업로드해주세요.'); return; }
    if (!invoiceFile) { setError('청구서 PDF를 업로드해주세요.'); return; }
    sendLog(userName, '원가계산', ''); setLoading(true); setError(''); setResult(null);

    const fd = new FormData();
    fd.append('excel', excelFile); fd.append('excel2', excelFile2); fd.append('invoice', invoiceFile);
    if (declarationFile) fd.append('declaration', declarationFile);

    try {
      const res = await fetch('/api/calculate', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '계산 오류'); return; }

      setResult(data.data); setParsedInfo(data.parsed);
      setYuanMap(data.yuanMap || {}); setSkuAvgCost(data.skuAvgCost || {}); setRecent5(data.recent5AvgRatio);

      // 박스수량 검증
      const bE = data.parsed?.excel?.boxCount || data.parsed?.excel?.boxCount2 || 0;
      const bI = data.parsed?.invoice?.packages || 0;
      if (bI > 0 && bE > 0 && bI !== bE) { alert(`박스수량 불일치!\n청구서: ${bI}CTN / 출고내역: ${bE}상자`); setResult(null); setParsedInfo(null); return; }

      // B/L NO 비교
      const invBl = data.parsed?.invoice?.blNo || '';
      const declBl = data.parsed?.declaration?.blNo || '';
      if (invBl && declBl && invBl !== declBl) { alert(`B/L NO 불일치!\n청구서: ${invBl}\n정산서: ${declBl}`); setResult(null); setParsedInfo(null); return; }

      // 자동 저장
      const code = data.parsed?.excel?.shipmentCode || '';
      const bc = data.parsed?.excel?.boxCount || data.parsed?.excel?.boxCount2 || 0;
      const shipKey = code ? code + '-' + bc + '박스' : '';
      if (shipKey) {
        try {
          const sr = await fetch('/api/save-all', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentKey: shipKey, rows: data.data.results }) });
          const sd = await sr.json();
          if (sd.success) sendLog(userName, '자동저장', shipKey);
        } catch (e) { console.error('자동 저장 실패:', e); }
      }
    } catch (err) { setError(`요청 실패: ${err.message}`); } finally { setLoading(false); }
  };

  /* ── EXCEL 다운로드 (SKU별) ── */
  const handleDownloadSku = async () => {
    if (!result) return;
    sendLog(userName, 'EXCEL다운로드', 'SKU별');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const cKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
    const cLabels = ['수수료1%','해상운임','DOC FEE','원산지증명서','통관수수료','관세','부가세','내륙운송료'];
    const shipLabel = (parsedInfo?.excel?.shipmentCode || '') + (parsedInfo?.excel?.boxCount ? '-' + parsedInfo.excel.boxCount + '박스' : '');
    const wsData = [
      ['출고', 'SKU', '품명', '수량', '단가(CNY)', '후불작업비용', '수수료7%', '원가(개당)', '원가(x285)', ...cLabels],
      ...result.results.map(r => [
        shipLabel, r.sku, r.productName, r.shippedQty, r.unitPriceCny,
        0.7, r.commission, r.costPerUnit, Math.round(r.unitPriceRaw * 285),
        ...cKeys.map(k => r.costs?.[k]?.perUnit || 0),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch:18 },{ wch:20 },{ wch:40 },{ wch:8 },{ wch:10 },{ wch:12 },{ wch:10 },{ wch:12 },{ wch:12 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 },{ wch:10 }];
    XLSX.utils.book_append_sheet(wb, ws, '수입원가');
    XLSX.writeFile(wb, `수입원가_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /* ── EXCEL 다운로드 (전체 요약) ── */
  const handleDownloadFull = async () => {
    if (!result) return;
    sendLog(userName, 'EXCEL다운로드', '전체요약');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const cKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
    const cLabels = ['구매대행수수료','해상운임','DOC FEE','원산지증명서','통관수수료','관세','부가세','내륙운송료'];
    const ws1Data = [
      ['SKU','품명','출고수량','단가(CNY)','환율','수입원가(개당)',...cLabels,'수입원가(총)'],
      ...result.results.map(r => [
        r.sku, r.productName, r.shippedQty, r.unitPriceCny, r.exchangeRate, r.costPerUnit,
        ...cKeys.map(k => r.costs?.[k]?.total || 0), r.totalImportCost,
      ]),
    ];
    const ws2Data = [
      ['항목','금액 (KRW)'], ['총 SKU 수', result.summary.totalSkus], ['총 수량', result.summary.totalQty],
      ['총 금액 (CNY)', result.summary.totalAmountCny], ['총 CBM', result.summary.totalCbm],
      [''], ['비용 항목','금액 (KRW)'],
      ...Object.entries(result.summary.costs).map(([k, v]) => [k, v]),
      [''], ['총 수입원가', result.summary.totalImportCost],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    XLSX.utils.book_append_sheet(wb, ws1, '수입원가');
    XLSX.utils.book_append_sheet(wb, ws2, '요약');
    XLSX.writeFile(wb, `수입원가_전체_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /* ── 초기화 ── */
  const handleReset = () => {
    sendLog(userName, '초기화', '');
    setExcelFile(null); setExcelFile2(null); setInvoiceFile(null);
    setResult(null); setError(''); setParsedInfo(null); setYuanMap({}); setSkuAvgCost({}); setRecent5(null);
    document.querySelectorAll('input[type="file"]').forEach(i => { i.value = ''; });
  };

  /* ═══════════════ 이름 입력 화면 ═══════════════ */
  if (!nameOk) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-2xl shadow-xl border p-10 w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-black">IC</span>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-1">수입원가 계산기</h1>
          <p className="text-sm text-gray-400 mb-8">이름을 입력하세요</p>
          <input type="text" placeholder="이름" value={userName}
            onChange={e => setUserName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && userName.trim()) { localStorage.setItem('userName', userName.trim()); sendLog(userName.trim(), '로그인', ''); setNameOk(true); } }}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-center text-lg focus:outline-none focus:border-blue-500 transition-colors mb-4" autoFocus />
          <button onClick={() => { if (userName.trim()) { localStorage.setItem('userName', userName.trim()); sendLog(userName.trim(), '로그인', ''); setNameOk(true); } }}
            disabled={!userName.trim()} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors">
            시작하기
          </button>
          <button onClick={() => window.open('/guide', '_blank')} className="w-full mt-3 py-2.5 text-sm text-gray-500 hover:text-blue-600 transition-colors">사용방법 보기</button>
        </div>
      </div>
    );
  }

  /* ═══════════════ 메인 화면 ═══════════════ */
  const COST_COLS = [
    { key: 'purchasingFee', label: '수수료1%' }, { key: 'oceanFreight', label: '해상운임' },
    { key: 'documentFee', label: 'DOC' }, { key: 'originCertFee', label: '원산지' },
    { key: 'customsClearanceFee', label: '통관' }, { key: 'customsDuty', label: '관세' },
    { key: 'vat', label: '부가세' }, { key: 'domesticTransport', label: '내륙운송' },
  ];

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(p => p === 'asc' ? 'desc' : p === 'desc' ? null : 'asc');
      if (sortDir === 'desc') setSortKey(null);
    } else { setSortKey(key); setSortDir('asc'); }
  };
  const sortIcon = (key) => sortKey !== key ? ' ⇅' : sortDir === 'asc' ? ' ▲' : sortDir === 'desc' ? ' ▼' : ' ⇅';

  let rows = result?.results || [];
  if (sortKey && sortDir && rows.length > 0) {
    rows = [...rows].sort((a, b) => {
      let va, vb;
      if (sortKey === 'ratio') {
        va = a.unitPriceCny > 0 ? a.costPerUnit / a.unitPriceCny : 0;
        vb = b.unitPriceCny > 0 ? b.costPerUnit / b.unitPriceCny : 0;
      } else if (sortKey === 'costX285') {
        va = Math.round(a.unitPriceRaw * 285);
        vb = Math.round(b.unitPriceRaw * 285);
      } else if (sortKey === 'costDiff') {
        va = Math.round(a.unitPriceRaw * 285) - (a.costPerUnit || 0);
        vb = Math.round(b.unitPriceRaw * 285) - (b.costPerUnit || 0);
      } else if (sortKey === 'avgCost') {
        va = skuAvgCost[a.sku] || 0;
        vb = skuAvgCost[b.sku] || 0;
      } else if (sortKey.startsWith('cost_')) {
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

  // 합계 계산
  const costSums = {};
  for (const col of COST_COLS) costSums[col.key] = rows.reduce((s, r) => s + ((r.costs?.[col.key]?.perUnit || 0) * r.shippedQty), 0);
  const allocTotal = COST_COLS.reduce((s, col) => s + costSums[col.key], 0);
  const invoiceTotal = parsedInfo?.invoice?.totalAmount || 0;
  const allocDiff = allocTotal - invoiceTotal;
  const excelCny = (parsedInfo?.excel?.totals?.totalAmount || 0) + (parsedInfo?.excel?.totals?.totalShipping || 0);
  const calcCny = rows.reduce((s, r) => s + r.unitPriceCny * r.shippedQty, 0);
  const cnyDiff = calcCny - excelCny;

  const thBase = 'px-3 py-2.5 text-center font-bold whitespace-nowrap';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── 상단 네비게이션 ── */}
      <nav className="bg-white border-b shadow-sm sticky top-0 z-50">
        <div className="max-w-full mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><span className="text-white text-xs font-black">IC</span></div>
            <h1 className="text-lg font-extrabold text-gray-900">수입원가 계산기</h1>
          </div>
          <div className="flex items-center gap-2">
            {!result && <>
              <button onClick={() => window.open('/data', '_blank')} className="px-3 py-1.5 text-xs font-bold bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors">전체 데이터</button>
              <button onClick={() => window.open('/ratio', '_blank')} className="px-3 py-1.5 text-xs font-bold bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors">비율 평균</button>
            </>}
            <button onClick={() => window.open('/logs', '_blank')} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">로그</button>
            <span className="text-sm text-gray-500 ml-2">{userName}님</span>
            <button onClick={() => { localStorage.removeItem('userName'); setUserName(''); setNameOk(false); }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors">변경</button>
          </div>
        </div>
      </nav>

      <div className="max-w-full mx-auto px-6 py-6">

        {/* ═══ 파일 업로드 (결과 없을 때) ═══ */}
        {!result && (
          <div className="max-w-4xl mx-auto mb-4 flex gap-3">
            <button onClick={() => window.open('/data', '_blank')}
              className="px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 transition-colors shadow-sm">
              전체 데이터 조회
            </button>
            <button onClick={() => window.open('/ratio', '_blank')}
              className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors shadow-sm">
              환율 비율 평균
            </button>
          </div>
        )}
        {!result && (
          <div className="bg-white rounded-2xl shadow-sm border p-8 mb-6 max-w-4xl mx-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-5">파일 업로드</h2>

            {/* 통합 드래그앤드롭 */}
            <div
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all mb-6 ${
                (excelFile && excelFile2 && invoiceFile) ? 'border-green-400 bg-green-50/50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
              }`}
              onClick={() => dropRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); classifyAndSet(e.dataTransfer.files); }}
            >
              <input ref={dropRef} type="file" accept=".xlsx,.xls,.pdf,.zip" multiple className="hidden"
                onChange={e => { classifyAndSet(e.target.files); e.target.value = ''; }} />
              <div className="mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl text-blue-500">+</span>
                </div>
                <p className="font-bold text-xl text-gray-700">파일을 드래그하거나 클릭하세요</p>
                <p className="text-sm text-gray-400 mt-1">엑셀 + PDF 또는 ZIP 파일 (자동 분류)</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: '결제명세서', file: excelFile, req: true },
                  { label: '출고내역', file: excelFile2, req: true },
                  { label: '청구서', file: invoiceFile, req: true },
                ].map(({ label, file, req }) => (
                  <div key={label} className={`rounded-xl p-4 transition-all ${file ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-100 border-2 border-gray-200'}`}>
                    <p className={`font-bold ${file ? 'text-green-700' : 'text-gray-600'}`}>{label}</p>
                    <p className={`text-xs mt-1 truncate ${file ? 'text-green-600' : req ? 'text-red-400 font-bold' : 'text-gray-400'}`}>{file ? file.name : '필수'}</p>
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-6 text-sm whitespace-pre-line">{error}</div>}

            <div className="flex gap-3">
              <button onClick={handleCalc} disabled={loading}
                className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold text-base hover:bg-blue-700 disabled:bg-gray-300 transition-colors shadow-sm">
                {loading ? '계산 중...' : '원가 계산'}
              </button>
              <button onClick={handleReset} className="px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-colors">초기화</button>
            </div>
          </div>
        )}

        {/* ═══ 결과 화면 ═══ */}
        {result && (
          <>
            {/* 비용 요약 */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 mb-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-900">비용 요약</h2>
                  {parsedInfo?.excel?.shipmentCode && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-bold">
                      {parsedInfo.excel.shipmentCode}-{parsedInfo.excel.boxCount || parsedInfo.excel.boxCount2 || 0}박스
                    </span>
                  )}
                </div>
              </div>

              {/* 최근5건 평균비율 */}
              {recent5 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bold text-gray-700">최근5건 평균비율</span>
                    <span className="font-extrabold text-red-600 text-2xl">{recent5.avg}</span>
                    <button onClick={() => window.open('/ratio', '_blank')} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs font-bold hover:bg-red-200">전체보기</button>
                  </div>
                  {recent5.detail && (
                    <div className="flex gap-4 text-xs text-gray-500">
                      {recent5.detail.map(d => <span key={d.key}>{d.key}: <b className="text-gray-700">{d.avg}</b></span>)}
                    </div>
                  )}
                </div>
              )}

              {/* 숫자 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                  <p className="text-base font-bold text-blue-600 mb-1">총 수입원가</p>
                  <p className="text-2xl font-extrabold text-blue-700">{fmt(
                    result.results.reduce((s, r) => s + r.productCostKrw * r.shippedQty, 0)
                    + Math.round((0.7 * result.summary.totalQty + result.results.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0)) * (result.summary.exchangeRateCNY || 195))
                    + (parsedInfo?.invoice?.totalAmount || 0)
                  )}<span className="text-sm ml-0.5">원</span></p>
                </div>
                <div className="bg-pink-50 rounded-xl p-4 border border-pink-100">
                  <p className="text-base font-bold text-pink-600 mb-1">1. 총 제품비(CNY)</p>
                  <p className="text-xl font-bold">{Math.round(((parsedInfo?.excel?.totals?.totalAmount || 0) + (parsedInfo?.excel?.totals?.totalShipping || 0)) * 100) / 100} <span className="text-xs">CNY</span></p>
                  <p className="text-base font-bold text-gray-700">= {fmt(result.results.reduce((s, r) => s + r.productCostKrw * r.shippedQty, 0))}원</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <p className="text-base font-bold text-purple-600 mb-1">2. 총 수수료(CNY)</p>
                  <p className="text-xl font-bold">{Math.round((0.7 * result.summary.totalQty + result.results.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0)) * 100) / 100} <span className="text-xs">CNY</span></p>
                  <p className="text-base font-bold text-gray-700">= {fmt(Math.round((0.7 * result.summary.totalQty + result.results.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0)) * (result.summary.exchangeRateCNY || 195)))}원</p>
                  <p className="text-sm font-medium text-gray-500">SOP {Math.round(0.7 * result.summary.totalQty * 100) / 100} CNY</p>
                  <p className="text-sm font-medium text-gray-500">수수료7% {Math.round(result.results.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0) * 100) / 100} CNY</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                  <p className="text-base font-bold text-orange-600 mb-1">3. 총 부대비용</p>
                  <p className="text-xl font-bold">{fmt(invoiceTotal)}<span className="text-xs ml-0.5">원</span></p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-base font-bold text-gray-700 mb-1">총 수량</p>
                  <p className="text-xl font-bold">{fmt(result.summary.totalQty)}<span className="text-xs ml-0.5">개</span></p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-base font-bold text-gray-700 mb-1">전체 CBM</p>
                  <p className="text-xl font-bold">{Math.round((result.summary.totalCbm || 0) * 10000) / 10000}</p>
                </div>
              </div>
            </div>

            {/* ═══ SKU별 테이블 ═══ */}
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              {/* 오차 표시 바 */}
              <div className="px-5 py-3 bg-gray-50 flex flex-col items-end gap-1 text-sm">
                {invoiceTotal > 0 && (
                  <div className="flex items-center gap-6">
                    <span>청구서 <b className="text-gray-900">{fmt(invoiceTotal)}원</b></span>
                    <span>배분합 <b className="text-gray-900">{fmt(allocTotal)}원</b></span>
                    <span className={`font-extrabold ${allocDiff >= 0 ? 'text-blue-600' : 'text-red-600'}`}>오차 {allocDiff >= 0 ? '+' : ''}{fmt(allocDiff)}원</span>
                  </div>
                )}
                {excelCny > 0 && (
                  <div className="flex items-center gap-6">
                    <span>출고내역 <b className="text-gray-900">{Math.round(excelCny * 100) / 100} CNY</b></span>
                    <span>계산기 <b className="text-gray-900">{Math.round(calcCny * 100) / 100} CNY</b></span>
                    <span className={`font-extrabold ${cnyDiff >= 0 ? 'text-blue-600' : 'text-red-600'}`}>오차 {cnyDiff >= 0 ? '+' : ''}{Math.round(cnyDiff * 100) / 100} CNY</span>
                  </div>
                )}
              </div>

              <div className="px-5 py-3 border-t border-b border-gray-200 flex items-center gap-2">
                <button onClick={handleDownloadSku} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition-colors">전체 EXCEL 다운</button>
                <button onClick={() => window.open('/logic', '_blank')} className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-bold hover:bg-indigo-600 transition-colors">컬럼 로직</button>
                <button onClick={() => window.open('/data', '_blank')} className="px-4 py-2 bg-teal-500 text-white rounded-lg text-sm font-bold hover:bg-teal-600 transition-colors">전체 데이터 조회</button>
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
                  <thead className="bg-gray-100 border-t border-gray-300">
                    <tr>
                      <RTh className={`${thBase} sticky left-0 bg-gray-100 z-10 cursor-pointer hover:text-blue-600`} initialWidth="140px" onClick={() => handleSort('sku')}>SKU{sortIcon('sku')}</RTh>
                      <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="75px" onClick={() => handleSort('cbmPerUnit')}>개당CBM{sortIcon('cbmPerUnit')}</RTh>
                      <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="280px" onClick={() => handleSort('productName')}>품명{sortIcon('productName')}</RTh>
                      <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="65px" onClick={() => handleSort('shippedQty')}>수량{sortIcon('shippedQty')}</RTh>
                      <RTh className={`${thBase} bg-pink-50 cursor-pointer hover:text-blue-600`} initialWidth="90px" onClick={() => handleSort('unitPriceCny')}>단가(CNY){sortIcon('unitPriceCny')}</RTh>
                      <RTh className={`${thBase} bg-pink-50`} initialWidth="85px">후불0.7</RTh>
                      <RTh className={`${thBase} bg-pink-50 cursor-pointer hover:text-blue-600`} initialWidth="80px" onClick={() => handleSort('commission')}>수수료7%{sortIcon('commission')}</RTh>
                      <RTh className={`${thBase} bg-yellow-100 cursor-pointer hover:text-blue-600`} initialWidth="100px" onClick={() => handleSort('costPerUnit')}>원가(개당){sortIcon('costPerUnit')}</RTh>
                      <RTh className={`${thBase} bg-purple-50 cursor-pointer hover:text-blue-600`} initialWidth="95px" onClick={() => handleSort('avgCost')}>평균원가{sortIcon('avgCost')}</RTh>
                      <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="90px" onClick={() => handleSort('ratio')}>위안화비율{sortIcon('ratio')}</RTh>
                      <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="95px" onClick={() => handleSort('costX285')}>원가(x285){sortIcon('costX285')}</RTh>
                      <RTh className={`${thBase} cursor-pointer hover:text-blue-600`} initialWidth="80px" onClick={() => handleSort('costDiff')}>차이{sortIcon('costDiff')}</RTh>
                      {COST_COLS.map(c => <RTh key={c.key} className={`${thBase} bg-sky-50 cursor-pointer hover:text-blue-600`} initialWidth="90px" onClick={() => handleSort('cost_' + c.key)}>{c.label}{sortIcon('cost_' + c.key)}</RTh>)}
                    </tr>
                  </thead>
                  <tbody>
                    {/* 실제 비용 행 */}
                    <tr className="border-b border-gray-300 font-semibold bg-lime-50">
                      <td className="px-3 py-2 sticky left-0 bg-lime-50 z-10 font-bold">실제 비용</td>
                      <td className="px-3 py-2"></td><td className="px-3 py-2"></td><td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td><td className="px-3 py-2"></td><td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td><td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right text-red-600 font-extrabold whitespace-nowrap">
                        평균 {(() => { const r = rows.filter(r => r.unitPriceCny > 0).map(r => r.costPerUnit / r.unitPriceCny); return r.length > 0 ? Math.round(r.reduce((a, b) => a + b, 0) / r.length * 100) / 100 : '-'; })()}
                      </td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2"></td>
                      {COST_COLS.map(col => {
                        const c = parsedInfo?.invoice?.costs?.[col.key];
                        const v = c ? (c.amount || 0) + (c.vatAmount || 0) : 0;
                        return <td key={col.key} className="px-3 py-2 text-right">{v > 0 ? fmt(v) + '원' : ''}</td>;
                      })}
                    </tr>
                    {/* 배분 총합 행 */}
                    <tr className="border-b-2 border-sky-300 font-semibold bg-lime-50">
                      <td className="px-3 py-2 sticky left-0 bg-lime-50 z-10 font-bold">배분 총합</td>
                      <td className="px-3 py-2 text-right">{Math.round(rows.reduce((s, r) => s + (r.cbmPerUnit || 0) * r.shippedQty, 0) * 10000) / 10000}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right">{fmt(rows.reduce((s, r) => s + r.shippedQty, 0))}</td>
                      <td className="px-3 py-2 text-right">{Math.round(rows.reduce((s, r) => s + r.unitPriceCny * r.shippedQty, 0) * 100) / 100}</td>
                      <td className="px-3 py-2 text-right">{Math.round(rows.reduce((s, r) => s + 0.7 * r.shippedQty, 0) * 100) / 100}</td>
                      <td className="px-3 py-2 text-right">{Math.round(rows.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0) * 100) / 100}</td>
                      <td className="px-3 py-2 text-right">{fmt(rows.reduce((s, r) => s + r.costPerUnit * r.shippedQty, 0))}원</td>
                      <td className="px-3 py-2"></td><td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right">{fmt(rows.reduce((s, r) => s + Math.round(r.unitPriceRaw * 285) * r.shippedQty, 0))}원</td>
                      <td className="px-3 py-2"></td>
                      {COST_COLS.map(col => {
                        const c = parsedInfo?.invoice?.costs?.[col.key];
                        const actual = c ? (c.amount || 0) + (c.vatAmount || 0) : 0;
                        const d = Math.round(costSums[col.key]) - Math.round(actual);
                        const clr = actual === 0 || d === 0 ? '' : d > 0 ? 'text-blue-600' : 'text-red-600';
                        return <td key={col.key} className={`px-3 py-2 text-right ${clr}`}>{fmt(costSums[col.key])}원</td>;
                      })}
                    </tr>
                    {/* SKU 행 */}
                    {rows.map((r, i) => {
                      const yv = yuanMap[r.sku];
                      const yd = yv != null ? Math.abs(r.unitPriceCny - yv) : 0;
                      const yw = yv != null && yd >= 4;
                      const ratio = r.unitPriceCny > 0 ? Math.round(r.costPerUnit / r.unitPriceCny * 100) / 100 : '-';
                      const bg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                      return (
                        <tr key={r.sku} className={bg}>
                          <td className={`px-3 py-2 font-mono text-xs font-bold sticky left-0 z-10 ${bg}`}>{r.sku}</td>
                          <td className="px-3 py-2 text-right">{r.cbmPerUnit}</td>
                          <td className="px-3 py-2" style={{ wordBreak: 'break-word' }}>{r.productName}</td>
                          <td className="px-3 py-2 text-right font-bold">{r.shippedQty}</td>
                          <td className={`px-3 py-2 text-right font-bold ${yw ? 'text-red-600 bg-red-50' : ''}`}
                            title={yv != null ? `위안화 정보: ${yv} (차이: ${(r.unitPriceCny - yv).toFixed(2)})` : ''}>
                            {r.unitPriceCny}{yw && <span className="text-xs ml-1">({yv})</span>}
                          </td>
                          <td className="px-3 py-2 text-right">0.7</td>
                          <td className="px-3 py-2 text-right">{r.commission || ''}</td>
                          <td className="px-3 py-2 text-right font-bold text-blue-700 bg-yellow-50">{fmt(r.costPerUnit)}원</td>
                          <td className="px-3 py-2 text-right font-bold text-purple-700 bg-purple-50/50">{skuAvgCost[r.sku] ? fmt(skuAvgCost[r.sku]) + '원' : '-'}</td>
                          <td className="px-3 py-2 text-right font-bold text-gray-900">{ratio}</td>
                          <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(Math.round(r.unitPriceRaw * 285))}원</td>
                          {(() => { const d = Math.round(r.unitPriceRaw * 285) - (r.costPerUnit || 0); return (
                            <td className={`px-3 py-2 text-right font-bold ${d >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{d >= 0 ? '+' : ''}{fmt(d)}원</td>
                          ); })()}
                          {COST_COLS.map(col => <td key={col.key} className="px-3 py-2 text-right">{fmt(r.costs?.[col.key]?.perUnit)}원</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
