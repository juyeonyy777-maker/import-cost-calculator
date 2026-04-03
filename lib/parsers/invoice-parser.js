const COST_ITEMS = [
  { key: 'purchasingFee', names: ['구매대행 수수료 1%', '구매대행수수료'], allocation: 'value', foreign: true },
  { key: 'oceanFreight', names: ['OCEAN FREIGHT', '해상운임'], allocation: 'cbm' },
  { key: 'documentFee', names: ['DOCUMENT FEE'], allocation: 'quantity' },
  { key: 'originCertFee', names: ['원산지증명서발급비용'], allocation: 'quantity' },
  { key: 'customsClearanceFee', names: ['통관수수료'], allocation: 'quantity' },
  { key: 'customsDuty', names: ['관세'], allocation: 'value' },
  { key: 'vat', names: ['부가세'], allocation: 'value' },
  { key: 'domesticTransport', names: ['한국내륙운송료', '국내운송료'], allocation: 'cbm' },
  { key: 'wharfage', names: ['WHARFAGE'], allocation: 'cbm' },
  { key: 'warehouseFee', names: ['창고료'], allocation: 'cbm' },
  { key: 'additionalCosts', names: ['한국부대비용'], allocation: 'cbm' },
];

function extractKrwNumbers(text) {
  const matches = text.match(/\d{1,3}(?:,\d{3})*(?!\.\d)/g) || [];
  return matches.map(m => parseFloat(m.replace(/,/g, '')));
}

function parseKrwConcat(text) {
  const m = text.match(/^([1-9]\d{0,2}(?:,\d{3})*)([1-9]\d{0,2}(?:,\d{3})*)?$/);
  if (m) return { total: parseInt(m[1].replace(/,/g, '')), vat: m[2] ? parseInt(m[2].replace(/,/g, '')) : 0 };
  return null;
}

function parseCnyLine(str) {
  const dots = [];
  for (let i = 0; i < str.length; i++) if (str[i] === '.') dots.push(i);
  if (dots.length < 3) return null;

  const rateDot = dots[2];
  for (const dec of [2, 4]) {
    const rateEnd = rateDot + 1 + dec;
    if (rateEnd > str.length) continue;
    const krw = parseKrwConcat(str.substring(rateEnd));
    if (krw && krw.total > 0) {
      const rateStart = Math.max(0, rateDot - 3);
      return { exchangeRate: parseFloat(str.substring(rateStart, rateEnd)), krwTotal: krw.total, vatAmount: krw.vat };
    }
  }
  return null;
}

function parseUsdLine(str) {
  const rateMatch = str.match(/1,\d{3}\.\d{2,4}/);
  if (!rateMatch) return null;
  const afterRate = str.substring(str.indexOf(rateMatch[0]) + rateMatch[0].length);
  const krw = parseKrwConcat(afterRate);
  return { exchangeRate: parseFloat(rateMatch[0].replace(/,/g, '')), krwTotal: krw?.total || 0, vatAmount: krw?.vat || 0 };
}

function findCostAmount(text, itemNames) {
  for (const name of itemNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped + '((?:KRW|CNY|USD)[^\\n]{0,200})', 'i');
    const match = text.match(regex);
    if (!match) continue;

    const after = match[1];
    if (/CNY/i.test(after)) {
      const parsed = parseCnyLine(after.replace(/^.*?CNY/i, ''));
      if (parsed) return { ...parsed, currency: 'CNY' };
    }
    if (/USD/i.test(after)) {
      const parsed = parseUsdLine(after.replace(/^.*?USD/i, ''));
      if (parsed) return { ...parsed, currency: 'USD' };
    }

    const krwPart = after.replace(/^.*?KRW/i, '');
    const nums = extractKrwNumbers(krwPart);
    if (nums.length === 0) continue;

    return {
      krwTotal: nums.length >= 2 ? nums[1] : nums[0],
      vatAmount: nums.length >= 3 ? nums[2] : 0,
      exchangeRate: 0,
      currency: 'KRW',
    };
  }
  return null;
}

function parseInvoicePdf(text) {
  const result = {
    blNo: '', weight: 0, cbm: 0, packages: 0,
    exchangeRateCNY: 0, exchangeRateUSD: 0,
    costs: {}, totalAmount: 0, totalVat: 0,
  };

  const blMatch = text.match(/B\/L\s*NO\s*[:：]\s*([A-Z0-9]+)/i);
  if (blMatch) result.blNo = blMatch[1];

  const weightMatch = text.match(/WEIGHT\s*[:：]?\s*([\d,.]+)\s*KG/i);
  if (weightMatch) result.weight = parseFloat(weightMatch[1].replace(/,/g, ''));

  const cbmMatch = text.match(/MEASUREMENT\s*[:：]?\s*([\d,.]+)\s*CBM/i);
  if (cbmMatch) result.cbm = parseFloat(cbmMatch[1].replace(/,/g, ''));

  const pkgMatch = text.match(/PKG[''\u2019]?S\s*[:：]?\s*(\d+)\s*CTN/i);
  if (pkgMatch) result.packages = parseInt(pkgMatch[1]);

  for (const item of COST_ITEMS) {
    const found = findCostAmount(text, item.names);
    if (found) {
      result.costs[item.key] = { amount: found.krwTotal, vatAmount: found.vatAmount, allocation: item.allocation };
      if (found.currency === 'CNY' && found.exchangeRate > 0) result.exchangeRateCNY = found.exchangeRate;
      if (found.currency === 'USD' && found.exchangeRate > 0) result.exchangeRateUSD = found.exchangeRate;
    }
  }

  const totalMatch = text.match(/TOTAL\s*KRW\s*(\d{1,3}(?:,\d{3})+)/m);
  if (totalMatch) result.totalAmount = parseFloat(totalMatch[1].replace(/,/g, ''));
  if (!result.totalAmount) {
    result.totalAmount = Object.values(result.costs).reduce((s, c) => s + (c.amount || 0) + (c.vatAmount || 0), 0);
  }

  return result;
}

module.exports = { parseInvoicePdf };
