/**
 * 수입원가 계산 엔진
 * Calculates import cost per SKU based on parsed data from Excel, Invoice, and Declaration.
 */

function calculateImportCosts({ excelData, invoiceData, declarationData, exchangeRateCNY }) {
  const { items, totals } = excelData;
  const { totalQty, totalAmount, totalCbm } = totals;

  // Determine exchange rate (priority: per-item from excel > user input > invoice > declaration)
  // 상품별 환율이 있으면 상품별로 적용, 없으면 폴백
  const fallbackRate = exchangeRateCNY
    || invoiceData?.exchangeRateCNY
    || declarationData?.invoiceCosts?.exchangeRateCNY
    || (declarationData?.exchangeRate ? declarationData.exchangeRate / 7.1 : 0)
    || 195;
  const getRate = (item) => item.exchangeRate > 0 ? item.exchangeRate : fallbackRate;
  const cnyRate = fallbackRate; // 요약용

  // Collect all costs from invoice (총금액 + 부가세 합산)
  const costs = {};
  if (invoiceData && invoiceData.costs && Object.keys(invoiceData.costs).length > 0) {
    for (const [key, val] of Object.entries(invoiceData.costs)) {
      costs[key] = (val.amount || 0) + (val.vatAmount || 0);
    }
  } else if (declarationData?.invoiceCosts?.costs) {
    for (const [key, val] of Object.entries(declarationData.invoiceCosts.costs)) {
      costs[key] = val || 0;
    }
  }

  // 관세·부가세는 정산서 우선, 없으면 청구서 값 유지
  // 정산서 영문명 ↔ 출고내역 한글명 키워드 매칭으로 관세 분배
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

  let dutySkuSet = new Set(); // 관세 부과 대상 SKU
  let dutyTaxedSkuQty = 0;   // 관세 대상 SKU 총 수량

  if (declarationData) {
    if (declarationData.totalCustomsDuty) {
      costs.customsDuty = declarationData.totalCustomsDuty;
    }
    if (declarationData.totalVat) {
      costs.vat = declarationData.totalVat;
    }

    // 관세율 > 0인 정산서 항목의 영문명으로 SKU 매칭
    if (declarationData.items && declarationData.items.length > 0) {
      const dutyItems = declarationData.items.filter(di => di.dutyRate > 0);
      for (const di of dutyItems) {
        const engName = (di.productName || '').toUpperCase();
        // 키워드 매칭
        let keywords = [];
        for (const [eng, kor] of Object.entries(DUTY_KEYWORDS)) {
          if (engName.includes(eng.toUpperCase())) {
            keywords = kor;
            break;
          }
        }
        // 매칭된 키워드로 SKU 찾기
        if (keywords.length > 0) {
          for (const item of items) {
            const name = (item.productName || '').toLowerCase();
            if (keywords.some(kw => name.includes(kw))) {
              dutySkuSet.add(item.sku);
            }
          }
        }
      }
      // 매칭된 SKU들의 총 수량
      for (const item of items) {
        if (dutySkuSet.has(item.sku)) {
          dutyTaxedSkuQty += item.shippedQty;
        }
      }
    }
  }

  // WHARFAGE, 창고료, 한국부대비용 → 해상운임에 합산
  costs.oceanFreight = (costs.oceanFreight || 0) + (costs.wharfage || 0) + (costs.warehouseFee || 0) + (costs.additionalCosts || 0);
  delete costs.wharfage;
  delete costs.warehouseFee;
  delete costs.additionalCosts;

  // 개당 CBM 계산 및 전체 CBM 합 (개당CBM × 수량의 총합)
  const cbmPerUnits = items.map(item => item.shippedQty > 0 ? item.totalCbm / item.shippedQty : 0);
  const totalCbmWeighted = items.reduce((s, item, idx) => s + cbmPerUnits[idx] * item.shippedQty, 0);

  // 1차 패스: SKU별 과세가격 합 계산 (부가세 비율 분배용)
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

  // 2차 패스: 실제 계산
  const results = items.map((item, idx) => {
    const qtyRatio = totalQty > 0 ? (item.shippedQty / totalQty) : (1 / items.length);
    const cbmPerUnit = cbmPerUnits[idx];

    // 단가(CNY) = 제품단가 + 중국내륙운송비(개당)
    const chinaShippingPerUnit = item.chinaShipping / (item.shippedQty || 1);
    const unitPriceCnyTotal = item.unitPrice + chinaShippingPerUnit;

    // 상품별 환율
    const itemRate = getRate(item);

    // 한화제품가 (product cost in KRW) = (단가CNY + 후불작업비용 + 수수료7%) × 환율
    const postpaidFeeUnit = 0.7;
    const commissionUnit = item.commission || 0;
    const fullCnyPerUnit = unitPriceCnyTotal + postpaidFeeUnit + commissionUnit;
    const productCostKrw = fullCnyPerUnit * itemRate;
    const productCostTotal = productCostKrw * item.shippedQty;

    // Allocate each cost category
    // CBM 개당 배분: 해상운임, 한국내륙운송료
    const oceanFreightPerUnit = totalCbmWeighted > 0 ? (costs.oceanFreight || 0) * cbmPerUnit / totalCbmWeighted : 0;
    const domesticTransportPerUnit = totalCbmWeighted > 0 ? (costs.domesticTransport || 0) * cbmPerUnit / totalCbmWeighted : 0;
    const oceanFreightAlloc = oceanFreightPerUnit * item.shippedQty;
    const domesticTransportAlloc = domesticTransportPerUnit * item.shippedQty;
    // 수량 엔빵: 나머지
    const purchasingFeeAlloc = (costs.purchasingFee || 0) * qtyRatio;
    const documentFeeAlloc = (costs.documentFee || 0) * qtyRatio;
    const originCertFeeAlloc = (costs.originCertFee || 0) * qtyRatio;
    const customsClearanceFeeAlloc = (costs.customsClearanceFee || 0) * qtyRatio;
    // 관세: 매칭된 SKU에만 분배
    let customsDutyAlloc = 0;
    if (dutySkuSet.size > 0 && dutyTaxedSkuQty > 0) {
      customsDutyAlloc = dutySkuSet.has(item.sku)
        ? (costs.customsDuty || 0) * (item.shippedQty / dutyTaxedSkuQty)
        : 0;
    } else {
      customsDutyAlloc = (costs.customsDuty || 0) * qtyRatio;
    }
    // 부가세: 정산서 부가세 총액을 SKU별 과세가격 비율로 분배
    const taxableRatio = totalTaxable > 0 ? preCalc[idx].taxableTotal / totalTaxable : qtyRatio;
    const vatAlloc = (costs.vat || 0) * taxableRatio;

    const allCosts = purchasingFeeAlloc + oceanFreightAlloc + documentFeeAlloc
      + originCertFeeAlloc + customsClearanceFeeAlloc + customsDutyAlloc
      + vatAlloc + domesticTransportAlloc;

    // 원가(개당) = (단가CNY + 후불작업비용0.7 + 수수료7%) × 위안화환율 + 배분비용(개당)
    const costPerUnitProduct = fullCnyPerUnit * itemRate;
    const allCostsPerUnit = allCosts / (item.shippedQty || 1);
    const costPerUnit = costPerUnitProduct + allCostsPerUnit;
    const totalImportCost = costPerUnit * item.shippedQty;
    const qty = item.shippedQty || 1;

    return {
      sku: item.sku,
      productName: item.productName,
      option: item.option,
      shippedQty: item.shippedQty,
      cbmPerUnit: item.shippedQty > 0 ? Math.round((item.totalCbm / item.shippedQty) * 10000) / 10000 : 0,
      unitPriceCny: Math.round(unitPriceCnyTotal * 100) / 100,
      unitPriceRaw: Math.round(item.unitPrice * 100) / 100,
      postpaidFee: Math.round((item.postpaidFee || 0) * 100) / 100,
      commission: Math.round((item.commission || 0) * 100) / 100,
      exchangeRate: itemRate,
      productCostKrw: Math.round(productCostKrw),
      productCostTotal: Math.round(productCostTotal),

      // 개별 청구서 항목 (청구서 순서대로)
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

  // Summary
  const totalImportCost = results.reduce((sum, r) => sum + r.totalImportCost, 0);

  return {
    results,
    summary: {
      totalSkus: results.length,
      totalQty,
      totalAmountCny: Math.round(totalAmount * 100) / 100,
      totalCbm: Math.round(totalCbm * 10000) / 10000,
      exchangeRateCNY: cnyRate,
      costs,
      totalImportCost,
    },
  };
}

module.exports = { calculateImportCosts };
