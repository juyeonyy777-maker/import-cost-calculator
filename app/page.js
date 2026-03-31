'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

function ResizableTh({ children, className = '', style = {}, minWidth = 50, initialWidth, ...props }) {
  const thRef = useRef(null);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const th = thRef.current;
    startX.current = e.clientX;
    startW.current = th.offsetWidth;

    const onMouseMove = (e2) => {
      const newW = Math.max(minWidth, startW.current + e2.clientX - startX.current);
      th.style.width = newW + 'px';
      th.style.minWidth = newW + 'px';
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [minWidth]);

  const mergedStyle = { ...style, position: 'relative' };
  if (initialWidth) {
    mergedStyle.width = initialWidth;
    mergedStyle.minWidth = initialWidth;
  }

  return (
    <th ref={thRef} className={className} style={mergedStyle} {...props}>
      {children}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '4px',
          cursor: 'col-resize', userSelect: 'none',
          background: '#cbd5e1', borderRadius: '2px',
        }}
        onMouseOver={(e) => e.currentTarget.style.background = '#94a3b8'}
        onMouseOut={(e) => e.currentTarget.style.background = '#cbd5e1'}
      />
    </th>
  );
}

function FilePickButton({ label, accept, file, onFileChange, description, large }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);

  const onDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); counter.current++; if (counter.current === 1) setDragging(true); };
  const onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; };
  const onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); counter.current--; if (counter.current === 0) setDragging(false); };
  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); counter.current = 0; setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFileChange(f);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg ${large ? 'p-6' : 'p-4'} text-center cursor-pointer transition-colors ${
        dragging ? 'border-blue-500 bg-blue-50' : file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => { if (e.target.files[0]) onFileChange(e.target.files[0]); }}
      />
      <p className={`font-bold ${large ? 'text-lg' : 'text-sm'} text-gray-700`}>{label}</p>
      <p className={`${large ? 'text-sm' : 'text-xs'} text-gray-500 mt-1`}>{description}</p>
      {dragging ? (
        <p className={`${large ? 'text-sm' : 'text-xs'} text-blue-600 mt-2`}>여기에 놓으세요</p>
      ) : file ? (
        <p className={`${large ? 'text-sm' : 'text-xs'} text-green-600 mt-2 truncate`}>{file.name}</p>
      ) : (
        <p className={`${large ? 'text-sm' : 'text-xs'} text-gray-400 mt-2`}>클릭 또는 드래그&드롭</p>
      )}
    </div>
  );
}

function formatNumber(num) {
  if (num === 0 || num === undefined || num === null) return '0';
  return Math.round(num).toLocaleString('ko-KR');
}

function sendLog(user, action, detail) {
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userName: user, action, detail }),
  }).catch(() => {});
}

export default function Home() {
  const [userName, setUserName] = useState('');
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const dropInputRef = useRef(null);
  const [excelFile2, setExcelFile2] = useState(null);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [declarationFile, setDeclarationFile] = useState(null);

  // 저장된 이름 불러오기
  useEffect(() => {
    const saved = localStorage.getItem('userName');
    if (saved) {
      setUserName(saved);
      setNameConfirmed(true);
    }
  }, []);

  // 브라우저 기본 드래그 동작 차단
  useEffect(() => {
    const prevent = (e) => e.preventDefault();
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);
  const [exchangeRate, setExchangeRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [parsedInfo, setParsedInfo] = useState(null);
  const [yuanMap, setYuanMap] = useState({}); // SKU → 위안화 매핑
  const [skuAvgCost, setSkuAvgCost] = useState({}); // SKU → 평균 원가
  const [recent5AvgRatio, setRecent5AvgRatio] = useState(null);
  const [sortOrder, setSortOrder] = useState(null); // 'asc' | 'desc' | null

  const handleCalculate = async () => {
    if (!excelFile) {
      setError('결제명세서 Excel 파일을 업로드해주세요.');
      return;
    }
    if (!excelFile2) {
      setError('출고내역 Excel 파일을 업로드해주세요.');
      return;
    }
    if (!invoiceFile) {
      setError('청구서 PDF 파일을 업로드해주세요.');
      return;
    }

    sendLog(userName, '원가계산', '환율: ' + exchangeRate);
    setLoading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('excel', excelFile);
    if (excelFile2) formData.append('excel2', excelFile2);
    if (invoiceFile) formData.append('invoice', invoiceFile);
    if (declarationFile) formData.append('declaration', declarationFile);
    if (exchangeRate) formData.append('exchangeRate', exchangeRate);

    try {
      const res = await fetch('/api/calculate', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '계산 중 오류가 발생했습니다.');
        return;
      }

      setResult(data.data);
      setParsedInfo(data.parsed);
      const ym = data.yuanMap || {};
      setYuanMap(ym);
      setSkuAvgCost(data.skuAvgCost || {});
      setRecent5AvgRatio(data.recent5AvgRatio);
      console.log('yuanMap 로드:', Object.keys(ym).length, '개 SKU');

      // 데이터 검증
      let hasError = false;
      const errors = [];

      // 박스수량 비교 (청구서 CTN vs 출고내역)
      const boxExcel = data.parsed?.excel?.boxCount || data.parsed?.excel?.boxCount2 || 0;
      const boxInvoice = data.parsed?.invoice?.packages || 0;
      if (boxInvoice > 0 && boxExcel > 0 && boxInvoice !== boxExcel) {
        alert(`박스수량이 맞지 않습니다.\n청구서: ${boxInvoice}CTN / 출고내역: ${boxExcel}상자\n올바른 파일인지 확인하십시오.`);
        setResult(null);
        setParsedInfo(null);
        return;
      }

      // 청구서 & 정산서 BL NO 비교
      const invoiceBl = data.parsed?.invoice?.blNo || '';
      const declarationBl = data.parsed?.declaration?.blNo || '';
      if (invoiceBl && declarationBl && invoiceBl !== declarationBl) {
        alert(`B/L NO가 맞지 않습니다.\n청구서: ${invoiceBl}\n수입정산서: ${declarationBl}\n올바른 파일인지 확인하십시오.`);
        setResult(null);
        setParsedInfo(null);
        return;
      }

      // Auto-fill exchange rate if extracted
      if (!exchangeRate && data.data.summary.exchangeRateCNY) {
        setExchangeRate(String(data.data.summary.exchangeRateCNY));
      }

      // 자동 저장 (에러 없을 때만)
      const shipmentCode = data.parsed?.excel?.shipmentCode || '';
      const boxCount = data.parsed?.excel?.boxCount || data.parsed?.excel?.boxCount2 || 0;
      const shipmentKey = shipmentCode ? shipmentCode + '-' + boxCount + '박스' : '';

      if (!hasError && shipmentKey) {
        try {
          const saveRes = await fetch('/api/save-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentKey, rows: data.data.results }),
          });
          const saveData = await saveRes.json();
          if (saveData.success) {
            console.log(shipmentKey + ' 자동 저장 완료');
                sendLog(userName, '자동저장', shipmentKey);
          }
        } catch (e) {
          console.error('자동 저장 실패:', e);
        }
      } else if (hasError) {
        alert('데이터에 문제가 있어 자동 저장하지 않았습니다.\n\n' + errors.join('\n'));
      }
    } catch (err) {
      setError(`요청 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!result) return;
    sendLog(userName, 'EXCEL다운로드', '수입원가 계산결과');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
    const costLabels = ['구매대행 수수료','해상운임','DOC FEE','원산지증명서','통관수수료','관세','부가세','내륙운송료'];
    const wsData = [
      ['SKU', '품명', '출고수량', '단가(CNY)', '환율', '수입원가(개당)', ...costLabels, '수입원가(총)'],
      ...result.results.map(r => [
        r.sku,
        r.productName,
        r.shippedQty,
        r.unitPriceCny,
        r.exchangeRate,
        r.costPerUnit,
        ...costKeys.map(k => r.costs?.[k]?.total || 0),
        r.totalImportCost,
      ]),
    ];

    // Summary sheet
    const summaryData = [
      ['항목', '금액 (KRW)'],
      ['총 SKU 수', result.summary.totalSkus],
      ['총 수량', result.summary.totalQty],
      ['총 금액 (CNY)', result.summary.totalAmountCny],
      ['총 CBM', result.summary.totalCbm],
      ['CNY 환율', result.summary.exchangeRateCNY],
      [''],
      ['비용 항목', '금액 (KRW)'],
      ['해상운임', result.summary.costs.oceanFreight],
      ['한국내륙운송료', result.summary.costs.domesticTransport],
      ['WHARFAGE', result.summary.costs.wharfage],
      ['창고료', result.summary.costs.warehouseFee],
      ['한국부대비용', result.summary.costs.additionalCosts],
      ['DOCUMENT FEE', result.summary.costs.documentFee],
      ['원산지증명서발급비용', result.summary.costs.originCertFee],
      ['통관수수료', result.summary.costs.customsClearanceFee],
      ['구매대행 수수료', result.summary.costs.purchasingFee],
      ['관세', result.summary.costs.customsDuty],
      ['부가세', result.summary.costs.vat],
      [''],
      ['총 수입원가', result.summary.totalImportCost],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const ws2 = XLSX.utils.aoa_to_sheet(summaryData);

    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, '수입원가');
    XLSX.utils.book_append_sheet(wb, ws2, '요약');
    XLSX.writeFile(wb, `수입원가_계산결과_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleDownloadSkuExcel = async () => {
    if (!result) return;
    sendLog(userName, 'EXCEL다운로드', 'SKU별 수입원가');
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
    const costLabels = ['수수료 1%','해상운임','DOC FEE','원산지증명서','통관수수료','관세','부가세','내륙운송료'];
    const shipmentLabel = (parsedInfo?.excel?.shipmentCode || '') + (parsedInfo?.excel?.boxCount ? '-' + parsedInfo.excel.boxCount + '박스' : '');
    const wsData = [
      ['출고', 'SKU', '품명', '수량', '단가(CNY)', '후불작업비용', '수수료7%', '원가(개당)', '원가(x285)', ...costLabels],
      ...result.results.map(r => [
        shipmentLabel,
        r.sku,
        r.productName,
        r.shippedQty,
        r.unitPriceCny,
        0.7,
        r.commission,
        r.costPerUnit,
        Math.round(r.unitPriceRaw * 285),
        ...costKeys.map(k => r.costs?.[k]?.perUnit || 0),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 18 }, { wch: 20 }, { wch: 40 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'SKU별 수입원가');
    XLSX.writeFile(wb, `SKU별_수입원가_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleReset = () => {
    sendLog(userName, '초기화', '');
    setExcelFile(null);
    setExcelFile2(null);
    setInvoiceFile(null);
    setDeclarationFile(null);
    setExchangeRate('');
    setResult(null);
    setError('');
    setParsedInfo(null);
    setYuanMap({});
    setSkuAvgCost({});
    setRecent5AvgRatio(null);
    // Reset file inputs
    document.querySelectorAll('input[type="file"]').forEach(input => { input.value = ''; });
  };

  if (!nameConfirmed) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="bg-white rounded-xl shadow-sm border p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">CN 수입 원가 계산기</h1>
          <p className="text-sm text-gray-500 mb-8">이름을 입력해주세요</p>
          <input
            type="text"
            placeholder="이름"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && userName.trim()) {
                localStorage.setItem('userName', userName.trim());
                sendLog(userName.trim(), '로그인', '');
                setNameConfirmed(true);
              }
            }}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            autoFocus
          />
          <button
            onClick={() => {
              if (userName.trim()) {
                localStorage.setItem('userName', userName.trim());
                sendLog(userName.trim(), '로그인', '');
                setNameConfirmed(true);
              }
            }}
            disabled={!userName.trim()}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
          >
            시작
          </button>
          <button
            onClick={() => window.open('/guide', '_blank')}
            className="w-full mt-3 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            사용방법
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto px-4 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CN 수입 원가 계산기</h1>
          <p className="text-sm text-gray-500 mt-1">CNINSIDER 중국 수입 원가 자동 계산 시스템</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{userName}님</span>
          <button
            onClick={() => window.open('/logs', '_blank')}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            사용로그
          </button>
          <button
            onClick={() => { localStorage.removeItem('userName'); setUserName(''); setNameConfirmed(false); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            변경
          </button>
        </div>
      </header>

      {/* 전체 데이터 조회 버튼 */}
      {!result && (
        <div className="max-w-4xl mx-auto mb-4 flex gap-3">
          <button
            onClick={() => window.open('/data', '_blank')}
            className="px-5 py-2 bg-teal-600 text-white rounded-lg font-medium text-sm hover:bg-teal-700 transition-colors"
          >
            전체 데이터 조회
          </button>
          <button
            onClick={() => window.open('/ratio', '_blank')}
            className="px-5 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 transition-colors"
          >
            환율 비율 평균
          </button>
        </div>
      )}

      {/* File Upload Section — 결과 없을 때만 표시 */}
      {!result && <div className="bg-white rounded-xl shadow-sm border p-6 mb-6 max-w-4xl mx-auto">
        <h2 className="text-lg font-semibold mb-4">파일 업로드</h2>

        {/* 통합 드래그앤드롭 */}
        {(() => {
          const classifyFile = (f) => {
            const name = f.name.toLowerCase();
            const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
            const isPdf = name.endsWith('.pdf');
            const isZip = name.endsWith('.zip') || name.endsWith('.alz') || name.endsWith('.egg');
            if (isExcel && name.includes('출고내역')) return '출고내역';
            if (isExcel) return '결제명세서';
            if (isPdf && name.includes('청구서')) return '청구서';
            if (isPdf) return '청구서';
            if (isZip) return 'zip';
            return null;
          };
          const handleFiles = async (files) => {
            for (const f of files) {
              // ZIP 파일 처리
              if (f.name.toLowerCase().endsWith('.zip')) {
                try {
                  const JSZip = (await import('jszip')).default;
                  const zip = await JSZip.loadAsync(f);
                  const extracted = [];
                  for (const [filename, entry] of Object.entries(zip.files)) {
                    if (entry.dir) continue;
                    const blob = await entry.async('blob');
                    extracted.push(new File([blob], filename, { type: blob.type }));
                  }
                  handleFiles(extracted);
                } catch (e) {
                  console.error('ZIP 해제 실패:', e);
                }
                continue;
              }
              const type = classifyFile(f);
              if (type === '결제명세서') { setExcelFile(f); sendLog(userName, '파일업로드', '결제명세서: ' + f.name); }
              else if (type === '출고내역') { setExcelFile2(f); sendLog(userName, '파일업로드', '출고내역: ' + f.name); }
              else if (type === '청구서') { setInvoiceFile(f); sendLog(userName, '파일업로드', '청구서: ' + f.name); }
            }
          };
          return (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-4 ${
                (excelFile && excelFile2 && invoiceFile) ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
              onClick={() => dropInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); handleFiles(e.dataTransfer.files); }}
            >
              <input
                ref={dropInputRef}
                type="file"
                accept=".xlsx,.xls,.pdf,.zip"
                multiple
                className="hidden"
                onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
              />
              <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-10 mb-6">
                <p className="font-bold text-3xl text-gray-800 mb-3">파일을 여기에 드래그하거나 클릭하세요</p>
                <p className="font-bold text-xl text-gray-500">엑셀 + PDF 또는 ZIP 파일</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className={`rounded-xl p-5 ${excelFile ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-100 border-2 border-gray-300'}`}>
                  <p className={`font-bold text-lg ${excelFile ? 'text-green-700' : 'text-gray-700'}`}>결제명세서</p>
                  <p className={`text-sm mt-1 truncate ${excelFile ? 'text-green-600' : 'text-red-500 font-bold'}`}>{excelFile ? excelFile.name : '필수'}</p>
                </div>
                <div className={`rounded-xl p-5 ${excelFile2 ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-100 border-2 border-gray-300'}`}>
                  <p className={`font-bold text-lg ${excelFile2 ? 'text-green-700' : 'text-gray-700'}`}>출고내역</p>
                  <p className={`text-sm mt-1 truncate ${excelFile2 ? 'text-green-600' : 'text-red-500 font-bold'}`}>{excelFile2 ? excelFile2.name : '필수'}</p>
                </div>
                <div className={`rounded-xl p-5 ${invoiceFile ? 'bg-green-100 border-2 border-green-400' : 'bg-gray-100 border-2 border-gray-300'}`}>
                  <p className={`font-bold text-lg ${invoiceFile ? 'text-green-700' : 'text-gray-700'}`}>청구서</p>
                  <p className={`text-sm mt-1 truncate ${invoiceFile ? 'text-green-600' : 'text-red-500 font-bold'}`}>{invoiceFile ? invoiceFile.name : '필수'}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={handleCalculate}
            disabled={loading}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
          >
            {loading ? '계산 중...' : '원가 계산'}
          </button>
          <button
            onClick={handleReset}
            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            초기화
          </button>
          {result && (
            <button
              onClick={handleDownloadExcel}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-colors"
            >
              Excel 다운로드
            </button>
          )}
        </div>
      </div>}

      {/* 결과 화면 — 뒤로가기 버튼 */}
      {result && (
        <div className="mb-4 flex gap-3">
          <button
            onClick={handleReset}
            className="px-5 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-200 transition-colors"
          >
            초기화
          </button>
          <button
            onClick={() => window.open('/logic', '_blank')}
            className="px-5 py-2 bg-indigo-100 text-indigo-700 rounded-lg font-medium text-sm hover:bg-indigo-200 transition-colors"
          >
            컬럼 로직 정리
          </button>
          <button
            onClick={() => window.open('/data', '_blank')}
            className="px-5 py-2 bg-teal-100 text-teal-700 rounded-lg font-medium text-sm hover:bg-teal-200 transition-colors"
          >
            전체 데이터 조회
          </button>
        </div>
      )}


      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}




      {/* Summary */}
      {result && (
        <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">비용 요약 {parsedInfo?.excel?.shipmentCode && <span className="text-blue-600 ml-2">{parsedInfo.excel.shipmentCode}-{parsedInfo.excel.boxCount || parsedInfo.excel.boxCount2 || 0}박스</span>}</h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <div className="bg-white rounded-lg p-3 border-2 border-red-200">
              <p className="text-gray-500">최근5건 평균비율</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-bold text-red-600">{recent5AvgRatio?.avg != null ? recent5AvgRatio.avg : '-'}</p>
                <button onClick={() => window.open('/ratio', '_blank')} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs font-bold hover:bg-red-200">전체보기</button>
              </div>
              {recent5AvgRatio?.detail && (
                <div className="mt-1 space-y-0.5">
                  {recent5AvgRatio.detail.map(d => (
                    <p key={d.key} className="text-xs text-gray-500">{d.key} - <b className="text-gray-700">{d.avg}</b></p>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-gray-500">총 수입원가</p>
              <p className="text-xl font-bold text-blue-600">{formatNumber(result.results.reduce((s, r) => s + r.costPerUnit * r.shippedQty, 0))} 원</p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-gray-500">총 제품비 (CNY)</p>
              <p className="text-xl font-bold">{formatNumber(Math.round(((parsedInfo?.excel?.totals?.totalAmount || 0) + (parsedInfo?.excel?.totals?.totalShipping || 0)) * 100) / 100)} 위안</p>
              <p className="text-sm text-gray-500 mt-1">= {formatNumber(result.results.reduce((s, r) => s + r.productCostKrw * r.shippedQty, 0))} 원</p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-gray-500">총 부대비용</p>
              <p className="text-xl font-bold">{formatNumber(parsedInfo?.invoice?.totalAmount || 0)} 원</p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-gray-500">총 수량</p>
              <p className="text-xl font-bold">{formatNumber(result.summary.totalQty)} 개</p>
            </div>
            <div className="bg-white rounded-lg p-3">
              <p className="text-gray-500">전체 CBM</p>
              <p className="text-xl font-bold">{Math.round((result.summary.totalCbm || 0) * 10000) / 10000}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      {result && result.results.length > 0 && (() => {
        let rows = result.results;
        // 청구서 항목 순서 (항목명 = 청구서 원본과 동일)
        const COST_COLS = [
          { key: 'purchasingFee',       label: '수수료 1%' },
          { key: 'oceanFreight',        label: '해상운임' },
          { key: 'documentFee',         label: 'DOC FEE' },
          { key: 'originCertFee',       label: '원산지증명서' },
          { key: 'customsClearanceFee', label: '통관수수료' },
          { key: 'customsDuty',         label: '관세' },
          { key: 'vat',                 label: '부가세' },
          { key: 'domesticTransport',   label: '내륙운송료' },
        ];

        // 품명 정렬
        if (sortOrder === 'asc') {
          rows = [...rows].sort((a, b) => (a.productName || '').localeCompare(b.productName || '', 'ko'));
        } else if (sortOrder === 'desc') {
          rows = [...rows].sort((a, b) => (b.productName || '').localeCompare(a.productName || '', 'ko'));
        }

        const sumQty = rows.reduce((s, r) => s + r.shippedQty, 0);
        const sumProduct = rows.reduce((s, r) => s + r.productCostTotal, 0);
        const sumTotal = rows.reduce((s, r) => s + r.totalImportCost, 0);
        // 청구서 항목별 총합
        const costSums = {};
        for (const col of COST_COLS) {
          costSums[col.key] = rows.reduce((s, r) => s + ((r.costs?.[col.key]?.perUnit || 0) * r.shippedQty), 0);
        }
        const allocTotal = COST_COLS.reduce((s, col) => s + costSums[col.key], 0);
        // 청구서 TOTAL KRW (실제 지출 총액)
        const invoiceTotal = parsedInfo?.invoice?.totalAmount || 0;
        const diff = allocTotal - invoiceTotal;

        // 출고내역 CNY = 결제명세서 총금액 합 + R열 운임 합 / 계산기 CNY = 테이블 단가(CNY) × 수량 합
        const excelTotalAmount = parsedInfo?.excel?.totals?.totalAmount || 0;
        const excelTotalShipping = parsedInfo?.excel?.totals?.totalShipping || 0;
        const excelTotalCny = excelTotalAmount + excelTotalShipping;
        const calcTotalCny = rows.reduce((s, r) => s + (r.unitPriceCny * r.shippedQty), 0);
        const cnyDiff = excelTotalCny - calcTotalCny;

        return (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="p-4 border-b flex flex-col gap-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">SKU별 수입원가</h2>
                <button
                  onClick={handleDownloadSkuExcel}
                  className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors"
                >
                  EXCEL 다운
                </button>
              </div>
              {invoiceTotal > 0 && (
                <div className="flex items-center gap-4 text-base">
                  <span className="text-gray-600 font-medium">청구서 <b className="text-gray-900 text-lg">{formatNumber(invoiceTotal)}원</b></span>
                  <span className="text-gray-600 font-medium">배분합 <b className="text-gray-900 text-lg">{formatNumber(allocTotal)}원</b></span>
                  <span className={`font-extrabold text-lg ${diff >= 0 ? 'text-blue-600' : 'text-red-600'}`}>오차 {diff >= 0 ? '+' : ''}{formatNumber(diff)}원</span>
                </div>
              )}
            </div>
            {excelTotalCny > 0 && (
              <div className="flex items-center justify-end gap-4 text-base">
                <span className="text-gray-600 font-medium">출고내역 <b className="text-gray-900 text-lg">{formatNumber(Math.round(excelTotalCny * 100) / 100)} CNY</b></span>
                <span className="text-gray-600 font-medium">계산기 <b className="text-gray-900 text-lg">{formatNumber(Math.round(calcTotalCny * 100) / 100)} CNY</b></span>
                <span className={`font-extrabold text-lg ${cnyDiff >= 0 ? 'text-blue-600' : 'text-red-600'}`}>오차 {cnyDiff >= 0 ? '+' : ''}{Math.round(cnyDiff * 100) / 100} CNY</span>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="text-sm" style={{ tableLayout: 'fixed', minWidth: '100%' }}>
              <thead className="bg-gray-50">
                <tr>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base sticky left-0 bg-gray-50 z-10" initialWidth="150px">SKU</ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base" initialWidth="80px">개당 CBM</ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base cursor-pointer select-none hover:text-blue-600" initialWidth="300px" onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc')}>
                    품명 {sortOrder === 'asc' ? '▲' : sortOrder === 'desc' ? '▼' : '⇅'}
                  </ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base" initialWidth="70px">수량</ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base bg-pink-100" initialWidth="90px">단가(CNY)</ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base bg-pink-100" initialWidth="90px">후불작업비용</ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base bg-pink-100" initialWidth="80px">수수료7%</ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base bg-blue-50" initialWidth="100px">원가(개당)</ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base bg-purple-50" initialWidth="100px">평균 원가</ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base bg-orange-50" initialWidth="100px">위안화 비율</ResizableTh>
                  <ResizableTh className="px-3 py-2 text-center font-bold text-gray-800 text-base bg-amber-100" initialWidth="100px">원가(x285)</ResizableTh>
                  {COST_COLS.map(col => (
                    <ResizableTh key={col.key} className="px-3 py-2 text-center font-bold text-gray-800 whitespace-nowrap text-base bg-sky-50" initialWidth="100px">{col.label}</ResizableTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* 실제 비용 행 */}
                <tr className="border-b border-gray-300 font-semibold text-sm bg-lime-50">
                  <td className="px-3 py-1.5 sticky left-0 bg-lime-50 z-10">실제 비용</td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 bg-lime-50 text-right text-red-600 font-extrabold whitespace-nowrap">평균 {(() => { const ratios = rows.filter(r => r.unitPriceCny > 0).map(r => r.costPerUnit / r.unitPriceCny); return ratios.length > 0 ? (Math.round(ratios.reduce((s, r) => s + r, 0) / ratios.length * 100) / 100) : '-'; })()}</td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  {COST_COLS.map(col => {
                    const c = parsedInfo?.invoice?.costs?.[col.key];
                    const val = c ? (c.amount || 0) + (c.vatAmount || 0) : 0;
                    return (
                      <td key={col.key} className="px-3 py-1.5 text-right bg-lime-50">{val > 0 ? formatNumber(val) + '원' : ''}</td>
                    );
                  })}
                </tr>
                {/* 배분 총합 행 */}
                <tr className="border-b-2 border-sky-300 font-semibold text-sm bg-lime-50">
                  <td className="px-3 py-1.5 sticky left-0 bg-lime-50 z-10">배분 총합</td>
                  <td className="px-3 py-1.5 text-right bg-lime-50">{Math.round(rows.reduce((s, r) => s + (r.cbmPerUnit || 0) * r.shippedQty, 0) * 10000) / 10000}</td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 text-right bg-lime-50">{formatNumber(sumQty)}</td>
                  <td className="px-3 py-1.5 text-right bg-lime-50">{Math.round(rows.reduce((s, r) => s + r.unitPriceCny * r.shippedQty, 0) * 100) / 100}</td>
                  <td className="px-3 py-1.5 text-right bg-lime-50">{Math.round(rows.reduce((s, r) => s + 0.7 * r.shippedQty, 0) * 100) / 100}</td>
                  <td className="px-3 py-1.5 text-right bg-lime-50">{Math.round(rows.reduce((s, r) => s + (r.commission || 0) * r.shippedQty, 0) * 100) / 100}</td>
                  <td className="px-3 py-1.5 text-right bg-lime-50">{formatNumber(rows.reduce((s, r) => s + r.costPerUnit * r.shippedQty, 0))}원</td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 bg-lime-50"></td>
                  <td className="px-3 py-1.5 text-right bg-lime-50">{formatNumber(rows.reduce((s, r) => s + Math.round(r.unitPriceRaw * 285) * r.shippedQty, 0))}원</td>
                  {COST_COLS.map(col => {
                    const c = parsedInfo?.invoice?.costs?.[col.key];
                    const actual = c ? (c.amount || 0) + (c.vatAmount || 0) : 0;
                    const diff2 = Math.round(costSums[col.key]) - Math.round(actual);
                    const color = actual === 0 || diff2 === 0 ? '' : diff2 > 0 ? 'text-blue-600' : 'text-red-600';
                    return (
                      <td key={col.key} className={`px-3 py-1.5 text-right bg-lime-50 ${color}`}>{formatNumber(costSums[col.key])}원</td>
                    );
                  })}
                </tr>
                {rows.map((row, i) => (
                  <tr key={row.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className={`px-3 py-2 font-mono text-xs font-bold sticky left-0 z-10 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>{row.sku}</td>
                    <td className="px-3 py-2 text-right text-sm">{row.cbmPerUnit}</td>
                    <td className="px-3 py-2 text-sm" style={{ wordBreak: 'break-word' }}>{row.productName}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold">{row.shippedQty}</td>
                    {(() => {
                      const yuanVal = yuanMap[row.sku];
                      const diff = yuanVal != null ? Math.abs(row.unitPriceCny - yuanVal) : 0;
                      const isOver4 = yuanVal != null && diff >= 4;
                      return (
                        <td
                          className={`px-3 py-2 text-right text-sm font-bold ${isOver4 ? 'text-red-600 bg-red-50' : ''}`}
                          title={yuanVal != null ? `위안화 정보: ${yuanVal} CNY (차이: ${(row.unitPriceCny - yuanVal).toFixed(2)} CNY)` : '위안화 정보에 SKU 없음'}
                        >
                          {row.unitPriceCny}
                          {isOver4 && <span className="ml-1 text-xs">({yuanVal})</span>}
                        </td>
                      );
                    })()}
                    <td className="px-3 py-2 text-right text-sm">0.7</td>
                    <td className="px-3 py-2 text-right text-sm">{row.commission || ''}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-blue-700 bg-blue-50">{formatNumber(row.costPerUnit)}원</td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-purple-700 bg-purple-50">{skuAvgCost[row.sku] ? formatNumber(skuAvgCost[row.sku]) + '원' : '-'}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-orange-700 bg-orange-50">{row.unitPriceCny > 0 ? (Math.round(row.costPerUnit / row.unitPriceCny * 100) / 100) : '-'}</td>
                    <td className="px-3 py-2 text-right text-sm font-bold bg-amber-50">{formatNumber(Math.round(row.unitPriceRaw * 285))}원</td>
                    {COST_COLS.map(col => {
                      const c = row.costs?.[col.key];
                      return (
                        <td key={col.key} className="px-3 py-2 text-right text-sm">
                          {formatNumber(c?.perUnit)}원
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
