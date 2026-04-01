function parseDeclarationPdf(text) {
  const result = {
    declarationNo: '', blNo: '', exchangeRate: 0,
    totalCifUsd: 0, totalCifKrw: 0,
    totalCustomsDuty: 0, totalVat: 0, totalTax: 0,
    freight: 0, items: [], invoiceCosts: null,
  };

  const declMatch = text.match(/신고번호[^]*?(\d{5}-\d{2}-\d{6,}[A-Z]?)/);
  if (declMatch) result.declarationNo = declMatch[1];

  const blCnis = text.match(/(CNIS\d{6}[A-Z]\d{1,2})/i);
  if (blCnis) result.blNo = blCnis[1];
  else {
    const blMatch = text.match(/B\/L\s*NO\s*[:：]\s*([A-Z0-9]{6,})/i);
    if (blMatch) result.blNo = blMatch[1];
  }

  const rateMatch = text.match(/환\s*율\s*\n?\s*([\d,]+\.\d+)/);
  if (rateMatch) result.exchangeRate = parseFloat(rateMatch[1].replace(/,/g, ''));

  const cifUsdMatch = text.match(/55\s*총과세가격\s*\n?\s*\$(\d{1,3}(?:,\d{3})*)/);
  if (cifUsdMatch) result.totalCifUsd = parseFloat(cifUsdMatch[1].replace(/,/g, ''));

  const cifKrwMatch = text.match(/￦(\d{1,3}(?:,\d{3})*).*?58\s*보험료/s);
  if (cifKrwMatch) result.totalCifKrw = parseFloat(cifKrwMatch[1].replace(/,/g, ''));

  const freightMatch = text.match(/57\s*운\s*임\s*(\d{1,3}(?:,\d{3})*)/);
  if (freightMatch) result.freight = parseFloat(freightMatch[1].replace(/,/g, ''));

  const dutyMatch = text.match(/관\s*세\s*(\d{1,3}(?:,\d{3})*)/);
  if (dutyMatch) result.totalCustomsDuty = parseFloat(dutyMatch[1].replace(/,/g, ''));

  const vatMatch = text.match(/부가가치세\s*(\d{1,3}(?:,\d{3})*)/);
  if (vatMatch) result.totalVat = parseFloat(vatMatch[1].replace(/,/g, ''));

  const totalTaxMatch = text.match(/63\s*\n?\s*총세액합계\s*(\d{1,3}(?:,\d{3})*)/);
  if (totalTaxMatch) result.totalTax = parseFloat(totalTaxMatch[1].replace(/,/g, ''));

  result.items = parseItems(text);
  result.invoiceCosts = parseInvoiceSection(text);

  return result;
}

function parseItems(text) {
  const items = [];
  const pattern = /란번호\/총란수\s*[:：]\s*(\d{3})\/(\d{3})/g;
  const sections = [];
  let m;

  while ((m = pattern.exec(text)) !== null) {
    const ranNo = parseInt(m[1]);
    if (!sections.find(s => s.ranNo === ranNo)) {
      sections.push({ ranNo, position: m.index });
    }
  }

  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].position;
    const end = i + 1 < sections.length ? sections.find(s => s.ranNo === sections[i].ranNo + 1)?.position || text.length : text.length;
    const chunk = text.substring(start, end);

    const hsMatch = chunk.match(/38\s*세번부호\s*(\d{4}\.\d{2}-\d{4})/);
    if (!hsMatch) continue;

    const nameMatch = chunk.match(/30\s*\n\s*품\s*명\s*\n\s*([A-Z\s']+)/);
    const cifMatch = chunk.match(/￦(\d{1,3}(?:,\d{3})*)/);
    const cifUsdMatch = chunk.match(/39\s*과세가격\(CIF\)\s*\n?\$(\d{1,3}(?:,\d{3})*)/);
    const qtyMatch = chunk.match(/42\s*환급물량\s*([\d,]+)\s*PC/);
    const dutyRateMatch = chunk.match(/관\s*\n\s*([\d.]+)\s*\(/);

    if (!items.find(it => it.ranNo === sections[i].ranNo)) {
      items.push({
        ranNo: sections[i].ranNo,
        hsCode: hsMatch[1],
        productName: nameMatch ? nameMatch[1].trim() : '',
        cifUsd: cifUsdMatch ? parseFloat(cifUsdMatch[1].replace(/,/g, '')) : 0,
        cifKrw: cifMatch ? parseFloat(cifMatch[1].replace(/,/g, '')) : 0,
        quantity: qtyMatch ? parseInt(qtyMatch[1].replace(/,/g, '')) : 0,
        dutyRate: dutyRateMatch ? parseFloat(dutyRateMatch[1]) : 0,
      });
    }
  }

  return items;
}

function parseInvoiceSection(text) {
  if (!text.includes('운임내역')) return null;

  const costs = {};
  const patterns = [
    { key: 'purchasingFee', re: /구매대행\s*수수료\s*1%\s*CNY[\d,.]+[\d,.]+[\d,.]+\s*([\d,]+)/i },
    { key: 'oceanFreight', re: /(?:OCEAN\s*FREIGHT|해상운임).*?(?:USD[\d,.]+[\d,.]+[\d,.]+|KRW[\d,]+)\s*([\d,]+)/i },
    { key: 'documentFee', re: /DOCUMENT\s*FEE\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'originCertFee', re: /원산지증명서발급비용\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'customsClearanceFee', re: /통관수수료\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'domesticTransport', re: /(?:한국내륙운송료|국내운송료)\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'wharfage', re: /WHARFAGE\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'warehouseFee', re: /창고료\s*KRW[\d,]+\s*([\d,]+)/i },
    { key: 'additionalCosts', re: /한국부대비용\s*KRW[\d,]+\s*([\d,]+)/i },
  ];

  for (const p of patterns) {
    const match = text.match(p.re);
    if (match) costs[p.key] = parseFloat(match[1].replace(/,/g, ''));
  }

  const cnyRate = text.match(/구매대행\s*수수료\s*1%\s*CNY[\d,.]+[\d,.]+\s*([\d,.]+)/);
  const exchangeRateCNY = cnyRate ? parseFloat(cnyRate[1].replace(/,/g, '')) : 0;

  return Object.keys(costs).length > 0 ? { costs, exchangeRateCNY } : null;
}

module.exports = { parseDeclarationPdf };
