/**
 * 청구서 (CNINSIDER Invoice) PDF Parser
 * Extracts cost items from the invoice PDF text.
 */

const COST_ITEM_PATTERNS = [
  { key: 'purchasingFee', names: ['구매대행 수수료 1%', '구매대행수수료'], allocation: 'value', foreign: true },
  { key: 'oceanFreight', names: ['OCEAN FREIGHT', '해상운임'], allocation: 'cbm', foreign: 'maybe' },
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

/**
 * Extract comma-formatted KRW numbers from text.
 * Pattern: 1-3 digits followed by groups of ,XXX
 */
function extractKrwNumbers(text) {
  const pattern = /\d{1,3}(?:,\d{3})*(?!\.\d)/g;
  const matches = text.match(pattern) || [];
  return matches.map(m => parseFloat(m.replace(/,/g, '')));
}

/**
 * Parse concatenated KRW numbers from a string (no delimiters).
 * Returns { total, vat } if valid.
 */
function parseKrwFromConcat(text) {
  // One or two concatenated KRW numbers: total[vat]
  const match = text.match(/^([1-9]\d{0,2}(?:,\d{3})*)([1-9]\d{0,2}(?:,\d{3})*)?$/);
  if (match) {
    return {
      total: parseInt(match[1].replace(/,/g, '')),
      vat: match[2] ? parseInt(match[2].replace(/,/g, '')) : 0,
    };
  }
  return null;
}

/**
 * Parse a CNY cost item line (e.g., 구매대행 수수료).
 * Numbers are concatenated: {unitCNY}{foreignCNY}{exchangeRate}{krwTotal}{vat}
 * Uses the 3-dot approach to find the exchange rate boundary.
 */
function parseCnyLine(afterCurrency) {
  const dotPositions = [];
  for (let i = 0; i < afterCurrency.length; i++) {
    if (afterCurrency[i] === '.') dotPositions.push(i);
  }

  if (dotPositions.length < 3) return null;

  const rateDotPos = dotPositions[2];

  // Try exchange rate with 2 decimal places first
  for (const decimals of [2, 4]) {
    const rateEnd = rateDotPos + 1 + decimals;
    if (rateEnd > afterCurrency.length) continue;

    const remainder = afterCurrency.substring(rateEnd);
    const krwNums = parseKrwFromConcat(remainder);
    if (krwNums && krwNums.total > 0) {
      const rateStartIdx = Math.max(0, rateDotPos - 3);
      const rateStr = afterCurrency.substring(rateStartIdx, rateEnd);
      return {
        exchangeRate: parseFloat(rateStr),
        krwTotal: krwNums.total,
        vatAmount: krwNums.vat,
      };
    }
  }

  return null;
}

/**
 * Parse a USD cost item line (e.g., OCEAN FREIGHT in USD).
 * Has USD exchange rate like 1,389.1600
 */
function parseUsdLine(afterCurrency) {
  const rateMatch = afterCurrency.match(/1,\d{3}\.\d{2,4}/);
  if (!rateMatch) return null;

  const rateIdx = afterCurrency.indexOf(rateMatch[0]);
  const afterRate = afterCurrency.substring(rateIdx + rateMatch[0].length);
  const krwNums = parseKrwFromConcat(afterRate);

  return {
    exchangeRate: parseFloat(rateMatch[0].replace(/,/g, '')),
    krwTotal: krwNums ? krwNums.total : 0,
    vatAmount: krwNums ? krwNums.vat : 0,
  };
}

/**
 * Find and extract a cost item's KRW amount from invoice text.
 */
function findCostItemAmount(text, itemNames, isForeign) {
  for (const name of itemNames) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Require currency code (KRW/CNY/USD) and digits after the item name
    const regex = new RegExp(escapedName + '((?:KRW|CNY|USD)[^\\n]{0,200})', 'i');
    const match = text.match(regex);
    if (!match) continue;

    const afterName = match[1];
    const hasCNY = /CNY/i.test(afterName);
    const hasUSD = /USD/i.test(afterName);

    // Foreign currency: use specialized parsers
    if (hasCNY) {
      const cnyPart = afterName.replace(/^.*?CNY/i, '');
      const parsed = parseCnyLine(cnyPart);
      if (parsed) {
        return { ...parsed, currency: 'CNY' };
      }
    }

    if (hasUSD) {
      const usdPart = afterName.replace(/^.*?USD/i, '');
      const parsed = parseUsdLine(usdPart);
      if (parsed) {
        return { ...parsed, currency: 'USD' };
      }
    }

    // KRW item: extract comma-formatted numbers
    const krwPart = afterName.replace(/^.*?KRW/i, '');
    const numbers = extractKrwNumbers(krwPart);

    if (numbers.length === 0) continue;

    let krwTotal = 0;
    let vatAmount = 0;

    if (numbers.length >= 3) {
      krwTotal = numbers[1];
      vatAmount = numbers[2];
    } else if (numbers.length >= 2) {
      krwTotal = numbers[1];
    } else {
      krwTotal = numbers[0];
    }

    return { krwTotal, exchangeRate: 0, vatAmount, currency: 'KRW' };
  }
  return null;
}

function parseInvoicePdf(text) {
  const result = {
    blNo: '',
    weight: 0,
    cbm: 0,
    packages: 0,
    exchangeRateCNY: 0,
    exchangeRateUSD: 0,
    costs: {},
    totalAmount: 0,
    totalVat: 0,
  };

  // Extract B/L NO
  const blMatch = text.match(/B\/L\s*NO\s*[:：]\s*([A-Z0-9]+)/i);
  if (blMatch) result.blNo = blMatch[1];

  // Extract WEIGHT
  const weightMatch = text.match(/WEIGHT\s*[:：]?\s*([\d,.]+)\s*KG/i);
  if (weightMatch) result.weight = parseFloat(weightMatch[1].replace(/,/g, ''));

  // Extract CBM (MEASUREMENT)
  const cbmMatch = text.match(/MEASUREMENT\s*[:：]?\s*([\d,.]+)\s*CBM/i);
  if (cbmMatch) result.cbm = parseFloat(cbmMatch[1].replace(/,/g, ''));

  // Extract PKG'S
  const pkgMatch = text.match(/PKG[''\u2019]?S\s*[:：]?\s*(\d+)\s*CTN/i);
  if (pkgMatch) result.packages = parseInt(pkgMatch[1]);

  // Extract each cost item
  for (const item of COST_ITEM_PATTERNS) {
    const found = findCostItemAmount(text, item.names, item.foreign);
    if (found) {
      result.costs[item.key] = {
        amount: found.krwTotal,
        vatAmount: found.vatAmount,
        allocation: item.allocation,
      };
      if (found.currency === 'CNY' && found.exchangeRate > 0) {
        result.exchangeRateCNY = found.exchangeRate;
      }
      if (found.currency === 'USD' && found.exchangeRate > 0) {
        result.exchangeRateUSD = found.exchangeRate;
      }
    }
  }

  // TOTAL KRW = 실제 지출 총액 (총금액 + 부가세 포함)
  // 청구서 하단의 "TOTALKRW" 행에서 추출 (KRW 필수)
  const totalKrwMatch = text.match(/TOTAL\s*KRW\s*(\d{1,3}(?:,\d{3})+)/m);
  if (totalKrwMatch) {
    result.totalAmount = parseFloat(totalKrwMatch[1].replace(/,/g, ''));
  }

  // fallback: 개별 항목 합산 (amount + vatAmount)
  if (!result.totalAmount) {
    result.totalAmount = Object.values(result.costs).reduce(
      (sum, c) => sum + (c.amount || 0) + (c.vatAmount || 0), 0
    );
  }

  return result;
}

module.exports = { parseInvoicePdf };
