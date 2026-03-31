/**
 * 정산서 (수입신고필증 / Import Declaration) PDF Parser
 * Extracts HS code-level customs information from declaration PDF.
 */

function parseDeclarationPdf(text) {
  const result = {
    declarationNo: '',
    blNo: '',
    exchangeRate: 0,
    totalCifUsd: 0,
    totalCifKrw: 0,
    totalCustomsDuty: 0,
    totalVat: 0,
    totalTax: 0,
    freight: 0,
    items: [], // per-란번호 items
    invoiceCosts: null, // if the first page contains invoice data
  };

  // Extract declaration number
  const declMatch = text.match(/신고번호[^]*?(\d{5}-\d{2}-\d{6,}[A-Z]?)/);
  if (declMatch) result.declarationNo = declMatch[1];

  // Extract B/L NO - 정산서에서는 CNIS + 날짜 + 코드 형식 (예: CNIS260311D18)
  const blCnis = text.match(/(CNIS\d{6}[A-Z]\d{1,2})/i);
  if (blCnis) {
    result.blNo = blCnis[1];
  } else {
    const blMatch = text.match(/B\/L\s*NO\s*[:：]\s*([A-Z0-9]{6,})/i);
    if (blMatch) result.blNo = blMatch[1];
  }

  // Extract exchange rate from declaration section
  const rateMatch = text.match(/환\s*율\s*\n?\s*([\d,]+\.\d+)/);
  if (rateMatch) result.exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));

  // Extract total CIF (use comma-formatted number patterns to avoid grabbing trailing field numbers)
  const cifUsdMatch = text.match(/55\s*총과세가격\s*\n?\s*\$(\d{1,3}(?:,\d{3})*)/);
  if (cifUsdMatch) result.totalCifUsd = parseFloat(cifUsdMatch[1].replace(/,/g, ''));

  const cifKrwMatch = text.match(/￦(\d{1,3}(?:,\d{3})*).*?58\s*보험료/s);
  if (cifKrwMatch) result.totalCifKrw = parseFloat(cifKrwMatch[1].replace(/,/g, ''));

  // Extract freight
  const freightMatch = text.match(/57\s*운\s*임\s*(\d{1,3}(?:,\d{3})*)/);
  if (freightMatch) result.freight = parseFloat(freightMatch[1].replace(/,/g, ''));

  // Extract total customs duty and VAT from summary
  const dutyMatch = text.match(/관\s*세\s*(\d{1,3}(?:,\d{3})*)/);
  if (dutyMatch) result.totalCustomsDuty = parseFloat(dutyMatch[1].replace(/,/g, ''));

  const vatSummaryMatch = text.match(/부가가치세\s*(\d{1,3}(?:,\d{3})*)/);
  if (vatSummaryMatch) result.totalVat = parseFloat(vatSummaryMatch[1].replace(/,/g, ''));

  const totalTaxMatch = text.match(/63\s*\n?\s*총세액합계\s*(\d{1,3}(?:,\d{3})*)/);
  if (totalTaxMatch) result.totalTax = parseFloat(totalTaxMatch[1].replace(/,/g, ''));

  // Parse per-란번호 items
  result.items = parseDeclarationItems(text);

  // Parse invoice costs from first page (if present)
  result.invoiceCosts = parseInvoiceFromDeclaration(text);

  return result;
}

function parseDeclarationItems(text) {
  const items = [];

  // Find all 란번호 sections
  const sectionPattern = /란번호\/총란수\s*[:：]\s*(\d{3})\/(\d{3})/g;
  let sectionMatch;
  const sectionPositions = [];

  while ((sectionMatch = sectionPattern.exec(text)) !== null) {
    const ranNo = parseInt(sectionMatch[1]);
    const totalRan = parseInt(sectionMatch[2]);
    // Only add unique 란번호 (first occurrence with HS code data)
    if (!sectionPositions.find(s => s.ranNo === ranNo)) {
      sectionPositions.push({
        ranNo,
        totalRan,
        position: sectionMatch.index,
      });
    }
  }

  for (let i = 0; i < sectionPositions.length; i++) {
    const section = sectionPositions[i];
    // Get text from this section to the next section (or end)
    const startPos = section.position;
    // Find the last occurrence of this 란번호 section for complete data
    let endPos = text.length;

    // Find the text chunk that contains the HS code for this 란번호
    // We need to find the chunk with 38세번부호 for this section
    const nextSectionStart = sectionPositions.find(s => s.ranNo === section.ranNo + 1);
    if (nextSectionStart) {
      endPos = nextSectionStart.position;
    }

    const sectionText = text.substring(startPos, endPos);

    // Extract HS code
    const hsMatch = sectionText.match(/38\s*세번부호\s*(\d{4}\.\d{2}-\d{4})/);
    if (!hsMatch) continue;

    const hsCode = hsMatch[1];

    // Extract product name
    const nameMatch = sectionText.match(/30\s*\n\s*품\s*명\s*\n\s*([A-Z\s']+)/);
    const productName = nameMatch ? nameMatch[1].trim() : '';

    // Extract CIF KRW - use proper comma-formatted number after ￦
    const cifMatch = sectionText.match(/￦(\d{1,3}(?:,\d{3})*)/);
    let cifKrw = 0;
    if (cifMatch) {
      cifKrw = parseFloat(cifMatch[1].replace(/,/g, ''));
    }

    // Extract CIF USD - use proper comma-formatted number after $
    const cifUsdMatch = sectionText.match(/39\s*과세가격\(CIF\)\s*\n?\$(\d{1,3}(?:,\d{3})*)/);
    let cifUsd = 0;
    if (cifUsdMatch) {
      cifUsd = parseFloat(cifUsdMatch[1].replace(/,/g, ''));
    }

    // Extract quantity
    const qtyMatch = sectionText.match(/42\s*환급물량\s*([\d,]+)\s*PC/);
    let quantity = 0;
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1].replace(/,/g, ''));
    }

    // Extract customs duty rate and amount
    let dutyRate = 0;
    let dutyAmount = 0;
    const dutyRateMatch = sectionText.match(/관\s*\n\s*([\d.]+)\s*\(/);
    if (dutyRateMatch) {
      dutyRate = parseFloat(dutyRateMatch[1]);
    }
    // Extract duty amount from the line after rate
    const dutyAmountMatch = sectionText.match(/관\s*\n\s*[\d.]+\s*\([^)]+\)\s*\n?\s*0\.00\s*(\d{1,3}(?:,\d{3})*)/);
    if (dutyAmountMatch) {
      dutyAmount = parseFloat(dutyAmountMatch[1].replace(/,/g, ''));
    }

    // Extract VAT amount
    let vatAmount = 0;
    const vatMatch = sectionText.match(/부\s*10\.00\s*\(A\)\s*0\.00\s*(\d{1,3}(?:,\d{3})*)/);
    if (vatMatch) {
      vatAmount = parseFloat(vatMatch[1].replace(/,/g, ''));
    }

    // Only add if not already present (avoid duplicates from multiple pages of same 란)
    if (!items.find(item => item.ranNo === section.ranNo)) {
      items.push({
        ranNo: section.ranNo,
        hsCode,
        productName,
        cifUsd,
        cifKrw,
        quantity,
        dutyRate,
        dutyAmount,
        vatAmount,
      });
    }
  }

  return items;
}

function parseInvoiceFromDeclaration(text) {
  // Check if the declaration file contains invoice data (first page)
  // Look for 운임내역 section which indicates an invoice
  if (!text.includes('운임내역')) return null;

  const costs = {};

  const costItems = [
    { key: 'purchasingFee', pattern: /구매대행\s*수수료\s*1%\s*CNY[\d,.]+[\d,.]+[\d,.]+\s*([\d,]+)/i },
    { key: 'oceanFreight', pattern: /(?:OCEAN\s*FREIGHT|해상운임).*?(?:USD[\d,.]+[\d,.]+[\d,.]+|KRW[\d,]+)\s*([\d,]+)/i },
    { key: 'documentFee', pattern: /DOCUMENT\s*FEE\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'originCertFee', pattern: /원산지증명서발급비용\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'customsClearanceFee', pattern: /통관수수료\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'domesticTransport', pattern: /(?:한국내륙운송료|국내운송료)\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'wharfage', pattern: /WHARFAGE\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'warehouseFee', pattern: /창고료\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'additionalCosts', pattern: /한국부대비용\s*KRW[\d,]+\s*([\d,]+)/i },
  ];

  for (const item of costItems) {
    const match = text.match(item.pattern);
    if (match) {
      costs[item.key] = parseFloat(match[1].replace(/,/g, ''));
    }
  }

  // Extract CNY exchange rate
  const cnyRateMatch = text.match(/구매대행\s*수수료\s*1%\s*CNY[\d,.]+[\d,.]+\s*([\d,.]+)/);
  let exchangeRateCNY = 0;
  if (cnyRateMatch) {
    exchangeRateCNY = parseFloat(cnyRateMatch[1].replace(/,/g, ''));
  }

  return Object.keys(costs).length > 0 ? { costs, exchangeRateCNY } : null;
}

module.exports = { parseDeclarationPdf };
