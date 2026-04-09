/**
 * 수입원가 계산 엔진
 * SKU별 수입원가를 계산합니다.
 */

const DUTY_KEYWORDS = {
  'STORAGE BAG': ['정리 가방', '비닐봉투', '압축팩'],
  'MEASURING SPOON': ['계량스푼', '계량 스푼'],
  'WASHING GLOVES': ['고무장갑', '니트릴장갑', '니트릴 고무장갑'],
  'TRAY': ['트레이', '쟁반'],
  'SOCKS': ['양말'],
  'CUSHIONS': ['쿠션 도넛', '도넛 방석', '도넛방석', '욕창방지 쿠션'],
  'MAGNETS': ['자석 인테리어', '자석 액자'],
  'SCISSORS': ['가위'],
  'STEEL WOOL': ['철수세미', '수세미'],
};

function calculateImportCosts({ excelData, invoiceData, declarationData, exchangeRateCNY }) {
  const { items, totals } = excelData;
  const { totalQty, totalAmount, totalCbm } = totals;

  // 환율 결정 (상품별 > 사용자입력 > 청구서 > 정산서 > 기본값)
  const fallbackRate = exchangeRateCNY
    || invoiceData?.exchangeRateCNY
    || declarationData?.invoiceCosts?.exchangeRateCNY
    || (declarationData?.exchangeRate ? declarationData.exchangeRate / 7.1 : 0)
    || 195;
  const getRate = (item) => item.exchangeRate > 0 ? item.exchangeRate : fallbackRate;

  // 청구서 비용 수집 (총금액 + 부가세 합산)
  const costs = {};
  if (invoiceData?.costs && Object.keys(invoiceData.costs).length > 0) {
    for (const [key, val] of Object.entries(invoiceData.costs)) {
      costs[key] = (val.amount || 0) + (val.vatAmount || 0);
    }
  } else if (declarationData?.invoiceCosts?.costs) {
    for (const [key, val] of Object.entries(declarationData.invoiceCosts.costs)) {
      costs[key] = val || 0;
    }
  }

  // 관세 대상 SKU 매칭 (정산서 기준)
  let dutySkuSet = new Set();
  let dutyTaxedSkuQty = 0;

  if (declarationData) {
    if (declarationData.totalCustomsDuty) costs.customsDuty = declarationData.totalCustomsDuty;
    if (declarationData.totalVat) costs.vat = declarationData.totalVat;

    if (declarationData.items?.length > 0) {
      const dutyItems = declarationData.items.filter(di => di.dutyRate > 0);
      for (const di of dutyItems) {
        const engName = (di.productName || '').toUpperCase();
        let keywords = [];
        for (const [eng, kor] of Object.entries(DUTY_KEYWORDS)) {
          if (engName.includes(eng.toUpperCase())) { keywords = kor; break; }
        }
        if (keywords.length > 0) {
          for (const item of items) {
            if (keywords.some(kw => (item.productName || '').toLowerCase().includes(kw))) {
              dutySkuSet.add(item.sku);
            }
          }
        }
      }
      for (const item of items) {
        if (dutySkuSet.has(item.sku)) dutyTaxedSkuQty += item.shippedQty;
      }
    }
  }

  // WHARFAGE, 창고료, 한국부대비용 → 해상운임에 합산
  costs.oceanFreight = (costs.oceanFreight || 0) + (costs.wharfage || 0) + (costs.warehouseFee || 0) + (costs.additionalCosts || 0);
  delete costs.wharfage;
  delete costs.warehouseFee;
  delete costs.additionalCosts;

  // 개당 CBM 및 가중 CBM 합계
  const cbmPerUnits = items.map(item => item.shippedQty > 0 ? item.totalCbm / item.shippedQty : 0);
  const totalCbmWeighted = items.reduce((s, item, idx) => s + cbmPerUnits[idx] * item.shippedQty, 0);

  // 1차 패스: 과세가격 비율 계산 (부가세 분배용)
  const preCalc = items.map((item, idx) => {
    const cbmPerUnit = cbmPerUnits[idx];
    const chinaShippingPerUnit = item.chinaShipping / (item.shippedQty || 1);
    const unitPriceCnyTotal = item.unitPrice + chinaShippingPerUnit;
    const oceanFreightPerUnit = totalCbmWeighted > 0 ? (costs.oceanFreight || 0) * cbmPerUnit / totalCbmWeighted : 0;

    let customsDutyPerUnit = 0;
    if (dutySkuSet.size > 0 && dutyTaxedSkuQty > 0) {
      customsDutyPerUnit = dutySkuSet.has(item.sku) ? (costs.customsDuty || 0) / dutyTaxedSkuQty : 0;
    } else if (totalQty > 0) {
      customsDutyPerUnit = (costs.customsDuty || 0) / totalQty;
    }

    const itemRate = getRate(item);
    const taxablePerUnit = unitPriceCnyTotal * itemRate + oceanFreightPerUnit + customsDutyPerUnit;
    return { taxablePerUnit, taxableTotal: taxablePerUnit * item.shippedQty };
  });
  const totalTaxable = preCalc.reduce((s, p) => s + p.taxableTotal, 0);

  // 2차 패스: 실제 원가 계산
  const results = items.map((item, idx) => {
    const qtyRatio = totalQty > 0 ? item.shippedQty / totalQty : 1 / items.length;
    const cbmPerUnit = cbmPerUnits[idx];
    const chinaShippingPerUnit = item.chinaShipping / (item.shippedQty || 1);
    const unitPriceCnyTotal = item.unitPrice + chinaShippingPerUnit;
    const itemRate = getRate(item);

    // 한화 제품가
    const postpaidFeeUnit = 0.7;
    const commissionUnit = item.commission || 0;
    const fullCnyPerUnit = unitPriceCnyTotal + postpaidFeeUnit + commissionUnit;
    const productCostKrw = fullCnyPerUnit * itemRate;

    // 비용 배분
    const oceanFreightPerUnit = totalCbmWeighted > 0 ? (costs.oceanFreight || 0) * cbmPerUnit / totalCbmWeighted : 0;
    const domesticTransportPerUnit = totalCbmWeighted > 0 ? (costs.domesticTransport || 0) * cbmPerUnit / totalCbmWeighted : 0;

    const purchasingFeeAlloc = (costs.purchasingFee || 0) * qtyRatio;
    const documentFeeAlloc = (costs.documentFee || 0) * qtyRatio;
    const originCertFeeAlloc = (costs.originCertFee || 0) * qtyRatio;
    const customsClearanceFeeAlloc = (costs.customsClearanceFee || 0) * qtyRatio;

    let customsDutyAlloc = 0;
    if (dutySkuSet.size > 0 && dutyTaxedSkuQty > 0) {
      customsDutyAlloc = dutySkuSet.has(item.sku) ? (costs.customsDuty || 0) * (item.shippedQty / dutyTaxedSkuQty) : 0;
    } else {
      customsDutyAlloc = (costs.customsDuty || 0) * qtyRatio;
    }

    const taxableRatio = totalTaxable > 0 ? preCalc[idx].taxableTotal / totalTaxable : qtyRatio;
    const vatAlloc = (costs.vat || 0) * taxableRatio;

    const oceanFreightAlloc = oceanFreightPerUnit * item.shippedQty;
    const domesticTransportAlloc = domesticTransportPerUnit * item.shippedQty;

    const allCosts = purchasingFeeAlloc + oceanFreightAlloc + documentFeeAlloc
      + originCertFeeAlloc + customsClearanceFeeAlloc + customsDutyAlloc
      + vatAlloc + domesticTransportAlloc;

    const allCostsPerUnit = allCosts / (item.shippedQty || 1);
    const costPerUnit = productCostKrw + allCostsPerUnit;
    const totalImportCost = costPerUnit * item.shippedQty;
    const qty = item.shippedQty || 1;

    return {
      sku: item.sku,
      productName: item.productName,
      labelName: item.labelName || '',
      boxSize: item.boxSize || '',
      option: item.option,
      shippedQty: item.shippedQty,
      cbmPerUnit: item.shippedQty > 0 ? Math.round((item.totalCbm / item.shippedQty) * 10000) / 10000 : 0,
      originalCbmZero: item.originalCbmZero || false,
      cbmConfirmed: item.cbmConfirmed !== false,
      unitPriceCny: Math.round(unitPriceCnyTotal * 100) / 100,
      unitPriceRaw: Math.round(item.unitPrice * 100) / 100,
      chinaShippingPerUnit: Math.round((item.chinaShipping / (item.shippedQty || 1)) * 100) / 100,
      postpaidFee: Math.round((item.postpaidFee || 0) * 100) / 100,
      commission: Math.round((item.commission || 0) * 100) / 100,
      exchangeRate: itemRate,
      productCostKrw: Math.round(productCostKrw),
      productCostTotal: Math.round(productCostKrw * item.shippedQty),
      costs: {
        purchasingFee:       { total: Math.round(purchasingFeeAlloc),       perUnit: Math.round(purchasingFeeAlloc / qty) },
        oceanFreight:        { total: Math.round(oceanFreightAlloc),        perUnit: Math.round(oceanFreightAlloc / qty) },
        documentFee:         { total: Math.round(documentFeeAlloc),         perUnit: Math.round(documentFeeAlloc / qty) },
        originCertFee:       { total: Math.round(originCertFeeAlloc),       perUnit: Math.round(originCertFeeAlloc / qty) },
        customsClearanceFee: { total: Math.round(customsClearanceFeeAlloc), perUnit: Math.round(customsClearanceFeeAlloc / qty) },
        customsDuty:         { total: Math.round(customsDutyAlloc),         perUnit: Math.round(customsDutyAlloc / qty) },
        vat:                 { total: Math.round(vatAlloc),                 perUnit: Math.round(vatAlloc / qty) },
        domesticTransport:   { total: Math.round(domesticTransportAlloc),   perUnit: Math.round(domesticTransportAlloc / qty) },
      },
      totalImportCost: Math.round(totalImportCost),
      costPerUnit: Math.round(costPerUnit),
    };
  });

  const totalImportCost = results.reduce((sum, r) => sum + r.totalImportCost, 0);

  return {
    results,
    summary: {
      totalSkus: results.length,
      totalQty,
      totalAmountCny: Math.round(totalAmount * 100) / 100,
      totalCbm: Math.round(totalCbm * 10000) / 10000,
      exchangeRateCNY: fallbackRate,
      costs,
      totalImportCost,
    },
  };
}

module.exports = { calculateImportCosts };
