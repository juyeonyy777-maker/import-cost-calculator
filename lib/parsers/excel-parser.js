/**
 * 출고내역 (Shipping Details) Excel Parser
 * Parses the CNINSIDER shipping details Excel file.
 */
const XLSX = require('xlsx');

const HEADER_MAPPINGS = {
  'SKU': 'sku',
  '라벨명': 'productName',
  '품명': 'productName',
  '한글상품명': 'productName',
  '옵션': 'option',
  '발주수량': 'orderQty',
  '출고수량': 'shippedQty',
  '세트수량': 'setQty',
  '제품별총수량': 'setQty',
  '단가': 'unitPrice',
  '중국내륙 운송비': 'chinaShippingPerUnit',
  '중국내륙운송비': 'chinaShippingPerUnit',
  '운임단가': 'chinaShippingPerUnit',
  '운임': 'chinaShippingTotal',
  '총금액': 'totalAmount',
  '재질': 'material',
  'CBM': 'cbm',
  '상자 번호': 'boxNo',
  '상자번호': 'boxNo',
  '출고박스마킹': 'boxNo',
  '발주번호': 'orderNo',
  '후불 작업비용 단가': 'postpaidFee',
  '후불작업비용단가': 'postpaidFee',
  '후불 작업비용': 'postpaidFeeTotal',
  '후불작업비용': 'postpaidFeeTotal',
  '수수료7%': 'commission',
  '수수료': 'commission',
  '환율': 'exchangeRate',
};

function findHeaderRow(data) {
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const row = data[i];
    if (!row || !Array.isArray(row)) continue;
    const rowStr = row.map(c => String(c || '').trim()).join(' ');
    if (rowStr.includes('SKU') && (rowStr.includes('출고수량') || rowStr.includes('단가'))) {
      return i;
    }
  }
  return 1; // default to row index 1
}

function mapColumns(headerRow) {
  const columnMap = {};
  // First pass: exact matches only (highest priority)
  for (let col = 0; col < headerRow.length; col++) {
    const cellValue = String(headerRow[col] || '').trim().replace(/\n/g, ' ');
    for (const [koreanName, fieldName] of Object.entries(HEADER_MAPPINGS)) {
      if (cellValue === koreanName) {
        columnMap[fieldName] = col;
        break;
      }
    }
  }
  // Second pass: includes matches (only for fields not yet found)
  for (let col = 0; col < headerRow.length; col++) {
    const cellValue = String(headerRow[col] || '').trim().replace(/\n/g, ' ');
    for (const [koreanName, fieldName] of Object.entries(HEADER_MAPPINGS)) {
      if (columnMap[fieldName] === undefined && cellValue.includes(koreanName)) {
        columnMap[fieldName] = col;
        break;
      }
    }
  }
  return columnMap;
}

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 첫 줄에서 박스수량 및 출고코드 추출
  let boxCount = 0;
  let shipmentCode = '';
  const row0Str = String(data[0]?.[0] || '');
  const boxMatch = row0Str.match(/박스수량[：:]?\s*(\d+)/);
  if (boxMatch) boxCount = parseInt(boxMatch[1]);
  const codeMatch = row0Str.match(/([A-Z]{2,}\d{6})/);
  if (codeMatch) shipmentCode = codeMatch[1];

  const headerRowIdx = findHeaderRow(data);
  const columnMap = mapColumns(data[headerRowIdx]);

  const items = [];
  let currentBoxNo = '';
  let currentBoxCbm = 0;
  const boxItems = {}; // boxNo -> [itemIndices]

  // Parse data rows
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !Array.isArray(row)) continue;

    const sku = String(row[columnMap.sku] || '').trim();
    const rawShippedQty = parseFloat(row[columnMap.shippedQty]) || 0;
    const setQty = parseFloat(row[columnMap.setQty]) || 0;
    // 세트수량(제품별총수량)이 있으면 우선, 없으면 출고수량
    const shippedQty = setQty > 0 ? setQty : rawShippedQty;

    // Skip empty rows, total rows
    if (!sku || shippedQty === 0) continue;

    const boxNo = String(row[columnMap.boxNo] || '').trim() || currentBoxNo;
    const cbm = parseFloat(row[columnMap.cbm]) || 0;
    const unitPrice = parseFloat(row[columnMap.unitPrice]) || 0;
    const totalAmount = parseFloat(row[columnMap.totalAmount]) || 0;
    // 운임: 운임단가(per 출고수량) 또는 운임총액에서 계산
    // 세트수량 사용 시 출고수량 기준 운임을 세트수량 기준으로 변환
    let chinaShippingPerUnit = 0;
    if (columnMap.chinaShippingPerUnit !== undefined) {
      const rawPerUnit = parseFloat(row[columnMap.chinaShippingPerUnit]) || 0;
      // 운임단가가 출고수량 기준이면 총 운임 = rawPerUnit * rawShippedQty, 세트 기준 = 총운임 / shippedQty
      if (setQty > 0 && rawShippedQty > 0 && setQty !== rawShippedQty) {
        chinaShippingPerUnit = (rawPerUnit * rawShippedQty) / shippedQty;
      } else {
        chinaShippingPerUnit = rawPerUnit;
      }
    } else if (columnMap.chinaShippingTotal !== undefined) {
      const shippingTotal = parseFloat(row[columnMap.chinaShippingTotal]) || 0;
      chinaShippingPerUnit = shippedQty > 0 ? shippingTotal / shippedQty : 0;
    }

    // Track box CBM (first item in each box has the CBM value)
    if (boxNo !== currentBoxNo) {
      currentBoxNo = boxNo;
      currentBoxCbm = cbm;
    } else if (cbm > 0) {
      currentBoxCbm = cbm;
    }

    let postpaidFee = 0;
    if (columnMap.postpaidFee !== undefined) {
      postpaidFee = parseFloat(row[columnMap.postpaidFee]) || 0;
    } else if (columnMap.postpaidFeeTotal !== undefined) {
      const total = parseFloat(row[columnMap.postpaidFeeTotal]) || 0;
      postpaidFee = shippedQty > 0 ? total / shippedQty : 0;
    }
    const commission = columnMap.commission !== undefined ? (parseFloat(row[columnMap.commission]) || 0) : 0;
    const exchangeRate = columnMap.exchangeRate !== undefined ? (parseFloat(row[columnMap.exchangeRate]) || 0) : 0;

    const item = {
      boxNo,
      sku,
      productName: String(row[columnMap.productName] || '').trim(),
      option: columnMap.option !== undefined ? String(row[columnMap.option] || '').trim() : '',
      orderQty: parseFloat(row[columnMap.orderQty]) || 0,
      shippedQty,
      setQty: parseFloat(row[columnMap.setQty]) || 0,
      unitPrice,
      chinaShipping: chinaShippingPerUnit,
      postpaidFee,
      commission,
      exchangeRate,
      totalAmount: totalAmount || (unitPrice * shippedQty),
      material: columnMap.material !== undefined ? String(row[columnMap.material] || '').trim() : '',
      boxCbm: currentBoxCbm,
      cbm: cbm,
    };

    const itemIdx = items.length;
    items.push(item);

    if (!boxItems[boxNo]) boxItems[boxNo] = [];
    boxItems[boxNo].push(itemIdx);
  }

  // Distribute box CBM proportionally by totalAmount within each box
  for (const [boxNo, indices] of Object.entries(boxItems)) {
    const boxCbm = items[indices[0]].boxCbm;
    const boxTotalAmount = indices.reduce((sum, idx) => sum + items[idx].totalAmount, 0);

    for (const idx of indices) {
      if (boxTotalAmount > 0) {
        items[idx].allocatedCbm = boxCbm * (items[idx].totalAmount / boxTotalAmount);
      } else {
        items[idx].allocatedCbm = boxCbm / indices.length;
      }
    }
  }

  // Aggregate by SKU
  const skuMap = {};
  for (const item of items) {
    if (!skuMap[item.sku]) {
      skuMap[item.sku] = {
        sku: item.sku,
        productName: item.productName,
        option: item.option,
        shippedQty: 0,
        unitPrice: item.unitPrice,
        chinaShipping: 0,
        postpaidFee: item.postpaidFee,
        commission: item.commission,
        exchangeRate: item.exchangeRate,
        totalAmount: 0,
        totalCbm: 0,
        material: item.material,
      };
    }
    const agg = skuMap[item.sku];
    agg.shippedQty += item.shippedQty;
    agg.totalAmount += item.totalAmount;
    agg.totalCbm += item.allocatedCbm || 0;
    agg.chinaShipping += item.chinaShipping * item.shippedQty;
    // Keep first non-empty productName
    if (!agg.productName && item.productName) {
      agg.productName = item.productName;
    }
  }

  const aggregated = Object.values(skuMap);

  // 단가 재계산: 총금액/수량 = 세트든 아니든 1개 상품 기준 단가
  for (const item of aggregated) {
    if (item.totalAmount > 0 && item.shippedQty > 0) {
      item.unitPrice = item.totalAmount / item.shippedQty;
    }
  }

  // Calculate totals
  const totalQty = aggregated.reduce((sum, item) => sum + item.shippedQty, 0);
  const totalAmount = aggregated.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalCbm = aggregated.reduce((sum, item) => sum + item.totalCbm, 0);
  const totalShipping = aggregated.reduce((sum, item) => sum + item.chinaShipping, 0);

  return {
    items: aggregated,
    rawItems: items,
    totals: { totalQty, totalAmount, totalCbm, totalShipping },
    boxCount,
    shipmentCode,
  };
}

module.exports = { parseExcel };
