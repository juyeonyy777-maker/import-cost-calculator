import { NextResponse } from 'next/server';
import { parseExcel } from '@/lib/parsers/excel-parser';
import { parseInvoicePdf } from '@/lib/parsers/invoice-parser';
import { calculateImportCosts } from '@/lib/calculator';
import fs from 'fs';

export async function GET() {
  const dir = '/mnt/c/Users/user/Desktop/클로드 전용 260320/! 260207-28박스(청구서 2장 맞음)/';
  const files = fs.readdirSync(dir);

  const excelFile = files.find(f => f.endsWith('.xlsx') && !f.includes('출고내역'));
  const excel2File = files.find(f => f.endsWith('.xlsx') && f.includes('출고내역'));
  const pdfFiles = files.filter(f => f.endsWith('.pdf'));

  // 엑셀 파싱
  const excelData = parseExcel(fs.readFileSync(dir + excelFile));
  const excel2Data = parseExcel(fs.readFileSync(dir + excel2File));

  // 출고내역 적용
  const qtyMap = {};
  for (const item of excel2Data.rawItems) {
    const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
    qtyMap[item.sku] = (qtyMap[item.sku] || 0) + qty;
  }
  const boxMap = {};
  for (const item of excel2Data.rawItems) {
    const box = item.boxNo; if (!box) continue;
    const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
    if (!boxMap[box]) boxMap[box] = { cbm: item.boxCbm || item.cbm || 0, totalQty: 0 };
    boxMap[box].totalQty += qty;
    if ((item.boxCbm || item.cbm || 0) > boxMap[box].cbm) boxMap[box].cbm = item.boxCbm || item.cbm || 0;
  }
  const skuCbmTotal = {};
  for (const item of excel2Data.rawItems) {
    const box = item.boxNo;
    const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
    if (!box || !boxMap[box] || boxMap[box].totalQty === 0) continue;
    const cbmPerUnit = boxMap[box].cbm / boxMap[box].totalQty;
    skuCbmTotal[item.sku] = (skuCbmTotal[item.sku] || 0) + cbmPerUnit * qty;
  }
  let newTotalQty = 0, newTotalCbm = 0;
  for (const item of excelData.items) {
    if (qtyMap[item.sku] !== undefined) item.shippedQty = qtyMap[item.sku];
    if (skuCbmTotal[item.sku] !== undefined) item.totalCbm = skuCbmTotal[item.sku];
    newTotalQty += item.shippedQty; newTotalCbm += item.totalCbm || 0;
  }
  excelData.totals.totalQty = newTotalQty;
  excelData.totals.totalCbm = newTotalCbm;

  // 청구서 2장 합산
  const pdfParse = (await import('pdf-parse')).default;
  let invoiceData = null;
  for (const f of pdfFiles) {
    const buf = fs.readFileSync(dir + f);
    const pdf = await pdfParse(buf);
    const parsed = parseInvoicePdf(pdf.text);
    if (!invoiceData) {
      invoiceData = parsed;
    } else {
      for (const [key, val] of Object.entries(parsed.costs)) {
        if (invoiceData.costs[key]) {
          invoiceData.costs[key].amount += val.amount || 0;
          invoiceData.costs[key].vatAmount += val.vatAmount || 0;
        } else {
          invoiceData.costs[key] = { ...val };
        }
      }
      invoiceData.totalAmount += parsed.totalAmount || 0;
    }
  }

  const result = calculateImportCosts({ excelData, invoiceData, declarationData: null, exchangeRateCNY: 0 });

  const costKeys = ['purchasingFee','oceanFreight','documentFee','originCertFee','customsClearanceFee','customsDuty','vat','domesticTransport'];
  const costLabels = ['수수료1%','해상운임','DOC','원산지','통관','관세','부가세','내륙운송'];

  const actualCosts = {};
  for (let i = 0; i < costKeys.length; i++) {
    const c = invoiceData.costs[costKeys[i]];
    actualCosts[costLabels[i]] = c ? (c.amount || 0) + (c.vatAmount || 0) : 0;
  }

  const allocCosts = {};
  for (let i = 0; i < costKeys.length; i++) {
    allocCosts[costLabels[i]] = result.results.reduce((s, r) => s + (r.costs?.[costKeys[i]]?.total || 0), 0);
  }

  const allocTotal = Object.values(allocCosts).reduce((s, v) => s + v, 0);

  return NextResponse.json({
    pdfCount: pdfFiles.length,
    pdfNames: pdfFiles,
    청구서: invoiceData.totalAmount,
    배분합: allocTotal,
    오차: allocTotal - invoiceData.totalAmount,
    실제비용: actualCosts,
    배분총합: allocCosts,
  });
}
