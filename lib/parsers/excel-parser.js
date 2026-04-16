const XLSX = require('xlsx');

const HEADER_MAP = {
  'SKU': 'sku',
  '라벨명': 'labelName',
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
  '가로*세로*높이': 'boxSize',
  '가로×세로×높이': 'boxSize',
  '상자 번호': 'boxNo',
  '상자번호': 'boxNo',
  '출고박스마킹': 'boxNo',
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
    const text = row.map(c => String(c || '').trim()).join(' ');
    if (text.includes('SKU') && (text.includes('출고수량') || text.includes('단가'))) {
      return i;
    }
  }
  return 1;
}

function mapColumns(headerRow) {
  const colMap = {};
  // 1차: 정확히 일치
  for (let col = 0; col < headerRow.length; col++) {
    const cell = String(headerRow[col] || '').trim().replace(/\n/g, ' ');
    for (const [name, field] of Object.entries(HEADER_MAP)) {
      if (cell === name && colMap[field] === undefined) {
        colMap[field] = col;
        break;
      }
    }
  }
  // 2차: 부분 일치 (미매핑 필드만)
  for (let col = 0; col < headerRow.length; col++) {
    const cell = String(headerRow[col] || '').trim().replace(/\n/g, ' ');
    for (const [name, field] of Object.entries(HEADER_MAP)) {
      if (colMap[field] === undefined && cell.includes(name)) {
        colMap[field] = col;
        break;
      }
    }
  }
  return colMap;
}

function parseExcel(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 첫 줄에서 박스수량 및 출고코드 추출
  let boxCount = 0;
  let shipmentCode = '';
  const firstRow = String(data[0]?.[0] || '');
  const boxMatch = firstRow.match(/박스수량[：:]?\s*(\d+)/);
  if (boxMatch) boxCount = parseInt(boxMatch[1]);
  const codeMatch = firstRow.match(/([A-Z]{2,}\d{6})/);
  if (codeMatch) shipmentCode = codeMatch[1];

  const headerIdx = findHeaderRow(data);
  const colMap = mapColumns(data[headerIdx]);
  const items = [];
  let curBoxNo = '';
  let curBoxCbm = 0;
  const boxItems = {};

  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !Array.isArray(row)) continue;

    const sku = String(row[colMap.sku] || '').trim();
    const rawShippedQty = parseFloat(row[colMap.shippedQty]) || 0;
    const setQty = parseFloat(row[colMap.setQty]) || 0;
    const shippedQty = setQty > 0 ? setQty : rawShippedQty;
    if (!sku || shippedQty === 0) continue;

    const boxNo = String(row[colMap.boxNo] || '').trim() || curBoxNo;
    const cbm = parseFloat(row[colMap.cbm]) || 0;
    const unitPrice = parseFloat(row[colMap.unitPrice]) || 0;
    const totalAmount = parseFloat(row[colMap.totalAmount]) || 0;

    // 운임 계산
    let chinaShippingPerUnit = 0;
    if (colMap.chinaShippingPerUnit !== undefined) {
      const rawPerUnit = parseFloat(row[colMap.chinaShippingPerUnit]) || 0;
      if (setQty > 0 && rawShippedQty > 0 && setQty !== rawShippedQty) {
        chinaShippingPerUnit = (rawPerUnit * rawShippedQty) / shippedQty;
      } else {
        chinaShippingPerUnit = rawPerUnit;
      }
    } else if (colMap.chinaShippingTotal !== undefined) {
      const total = parseFloat(row[colMap.chinaShippingTotal]) || 0;
      chinaShippingPerUnit = shippedQty > 0 ? total / shippedQty : 0;
    }

    // 상자 CBM 추적
    if (boxNo !== curBoxNo) {
      curBoxNo = boxNo;
      curBoxCbm = cbm;
    } else if (cbm > 0) {
      curBoxCbm = cbm;
    }

    let postpaidFee = 0;
    if (colMap.postpaidFee !== undefined) {
      postpaidFee = parseFloat(row[colMap.postpaidFee]) || 0;
    } else if (colMap.postpaidFeeTotal !== undefined) {
      const total = parseFloat(row[colMap.postpaidFeeTotal]) || 0;
      postpaidFee = shippedQty > 0 ? total / shippedQty : 0;
    }

    const commission = colMap.commission !== undefined ? (parseFloat(row[colMap.commission]) || 0) : 0;
    const exchangeRate = colMap.exchangeRate !== undefined ? (parseFloat(row[colMap.exchangeRate]) || 0) : 0;

    const item = {
      boxNo, sku,
      productName: String(row[colMap.productName] || '').trim(),
      labelName: colMap.labelName !== undefined ? String(row[colMap.labelName] || '').trim() : '',
      option: colMap.option !== undefined ? String(row[colMap.option] || '').trim() : '',
      shippedQty, setQty: parseFloat(row[colMap.setQty]) || 0,
      unitPrice, chinaShipping: chinaShippingPerUnit,
      postpaidFee, commission, exchangeRate,
      totalAmount: totalAmount || (unitPrice * shippedQty),
      material: colMap.material !== undefined ? String(row[colMap.material] || '').trim() : '',
      boxSize: colMap.boxSize !== undefined ? String(row[colMap.boxSize] || '').trim() : '',
      boxCbm: curBoxCbm, cbm,
    };

    const idx = items.length;
    items.push(item);
    if (!boxItems[boxNo]) boxItems[boxNo] = [];
    boxItems[boxNo].push(idx);
  }

  // 박스 내 CBM 배분: 개별 CBM 있으면 확정, 0이면 박스CBM/총수량으로 추정
  for (const [, indices] of Object.entries(boxItems)) {
    const boxCbm = items[indices[0]].boxCbm;
    const boxQty = indices.reduce((sum, idx) => sum + items[idx].shippedQty, 0);
    for (const idx of indices) {
      if (items[idx].cbm > 0) {
        items[idx].allocatedCbm = items[idx].cbm;
        items[idx].cbmConfirmed = true;
      } else {
        items[idx].allocatedCbm = boxQty > 0 ? boxCbm / boxQty * items[idx].shippedQty : 0;
        items[idx].cbmConfirmed = false;
      }
    }
  }

  // SKU별 집계
  const skuMap = {};
  for (const item of items) {
    if (!skuMap[item.sku]) {
      skuMap[item.sku] = {
        sku: item.sku, productName: item.productName, labelName: item.labelName, option: item.option,
        shippedQty: 0, unitPrice: item.unitPrice, chinaShipping: 0,
        postpaidFee: item.postpaidFee, commission: item.commission,
        exchangeRate: item.exchangeRate, totalAmount: 0, totalCbm: 0,
        material: item.material, originalCbmZero: false, boxCount: 0, boxNos: new Set(), boxQties: [],
      };
    }
    const agg = skuMap[item.sku];
    agg.shippedQty += item.shippedQty;
    if (item.boxNo) agg.boxNos.add(item.boxNo);
    agg.boxCount = agg.boxNos.size;
    agg.boxQties.push(item.shippedQty);
    agg.totalAmount += item.totalAmount;
    agg.totalCbm += item.allocatedCbm || 0;
    agg.chinaShipping += item.chinaShipping * item.shippedQty;
    if (item.cbm === 0) agg.originalCbmZero = true;
    if (item.cbmConfirmed === false) agg.cbmConfirmed = false;
    if (agg.cbmConfirmed === undefined) agg.cbmConfirmed = true;
    if (!agg.productName && item.productName) agg.productName = item.productName;
    if (!agg.labelName && item.labelName) agg.labelName = item.labelName;
  }

  const aggregated = Object.values(skuMap);
  for (const item of aggregated) {
    const allSame = item.boxQties.length >= 2 && item.boxQties.every(q => q === item.boxQties[0]);
    item.uniformBoxQty = allSame;
    item.qtyPerBox = allSame ? item.boxQties[0] : 0;
    delete item.boxNos;
    delete item.boxQties;
    if (item.totalAmount > 0 && item.shippedQty > 0) {
      item.unitPrice = item.totalAmount / item.shippedQty;
    }
  }

  const totalQty = aggregated.reduce((s, i) => s + i.shippedQty, 0);
  const totalAmount = aggregated.reduce((s, i) => s + i.totalAmount, 0);
  const totalCbm = aggregated.reduce((s, i) => s + i.totalCbm, 0);
  const totalShipping = aggregated.reduce((s, i) => s + i.chinaShipping, 0);

  return {
    items: aggregated,
    rawItems: items,
    totals: { totalQty, totalAmount, totalCbm, totalShipping },
    boxCount,
    shipmentCode,
  };
}

module.exports = { parseExcel };
