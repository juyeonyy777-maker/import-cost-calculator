import { NextResponse } from 'next/server';
import { parseExcel } from '@/lib/parsers/excel-parser';
import { parseInvoicePdf } from '@/lib/parsers/invoice-parser';
import { parseDeclarationPdf } from '@/lib/parsers/declaration-parser';
import { calculateImportCosts } from '@/lib/calculator';
import { PATHS } from '@/lib/paths';
import fs from 'fs';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const excelFile = formData.get('excel');
    const excelFile2 = formData.get('excel2');
    const declarationFile = formData.get('declaration');
    const exchangeRateInput = formData.get('exchangeRate');

    if (!excelFile) {
      return NextResponse.json({ error: '결제명세서 Excel 파일이 필요합니다.' }, { status: 400 });
    }

    const XLSX = require('xlsx');

    // 결제명세서 검증
    const excelBuf = Buffer.from(await excelFile.arrayBuffer());
    try {
      const wb = XLSX.read(excelBuf, { type: 'buffer' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const headers = data.slice(0, 5).map(r => (r || []).join(' ')).join(' ');
      const missing = ['SKU', '단가', '총금액', '환율'].filter(k => !headers.includes(k));
      if (missing.length > 0) {
        return NextResponse.json({ error: `결제명세서 형식 오류\n필수 항목 누락: ${missing.join(', ')}` }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: `결제명세서 읽기 실패: ${e.message}` }, { status: 400 });
    }

    // 출고내역 검증
    if (excelFile2 && excelFile2.size > 0) {
      const buf2 = Buffer.from(await excelFile2.arrayBuffer());
      try {
        const wb2 = XLSX.read(buf2, { type: 'buffer' });
        const data2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]], { header: 1 });
        const headers2 = data2.slice(0, 5).map(r => (r || []).join(' ')).join(' ');
        const missing2 = ['SKU', '출고수량'].filter(k => !headers2.includes(k));
        if (missing2.length > 0) {
          return NextResponse.json({ error: `출고내역 형식 오류\n필수 항목 누락: ${missing2.join(', ')}` }, { status: 400 });
        }
      } catch (e) {
        return NextResponse.json({ error: `출고내역 읽기 실패: ${e.message}` }, { status: 400 });
      }
    }

    // 청구서 PDF 검증 (다중 파일 지원)
    const invoiceFiles = formData.getAll('invoice');
    for (const invoiceFile of invoiceFiles) {
      if (!invoiceFile || invoiceFile.size === 0) continue;
      const invBuf = Buffer.from(await invoiceFile.arrayBuffer());
      try {
        const pdfParse = (await import('pdf-parse')).default;
        const pdf = await pdfParse(invBuf);
        const missing3 = ['KRW', 'TOTAL'].filter(k => !pdf.text.toUpperCase().includes(k));
        if (missing3.length > 0) {
          return NextResponse.json({ error: `청구서 PDF 형식 오류 (${invoiceFile.name})\n필수 항목 누락: ${missing3.join(', ')}` }, { status: 400 });
        }
      } catch (e) {
        return NextResponse.json({ error: `청구서 읽기 실패 (${invoiceFile.name}): ${e.message}` }, { status: 400 });
      }
    }

    // 엑셀 파싱
    const excelData = parseExcel(excelBuf);

    // 출고내역 파싱 → 수량/CBM 덮어쓰기
    if (excelFile2 && excelFile2.size > 0) {
      const buf2 = Buffer.from(await excelFile2.arrayBuffer());
      const excel2Data = parseExcel(buf2);

      const qtyMap = {};
      for (const item of excel2Data.rawItems) {
        const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
        qtyMap[item.sku] = (qtyMap[item.sku] || 0) + qty;
      }

      const boxMap = {};
      for (const item of excel2Data.rawItems) {
        const box = item.boxNo;
        if (!box) continue;
        const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
        if (!boxMap[box]) boxMap[box] = { cbm: item.boxCbm || item.cbm || 0, totalQty: 0 };
        boxMap[box].totalQty += qty;
        if ((item.boxCbm || item.cbm || 0) > boxMap[box].cbm) boxMap[box].cbm = item.boxCbm || item.cbm || 0;
      }

      const skuCbmTotal = {}, skuQtyTotal = {}, skuCbmConfirmed = {};
      for (const item of excel2Data.rawItems) {
        const box = item.boxNo;
        const qty = item.setQty > 0 ? item.setQty : item.shippedQty;
        if (!box || !boxMap[box] || boxMap[box].totalQty === 0) continue;
        const cbmPerUnit = boxMap[box].cbm / boxMap[box].totalQty;
        skuCbmTotal[item.sku] = (skuCbmTotal[item.sku] || 0) + cbmPerUnit * qty;
        skuQtyTotal[item.sku] = (skuQtyTotal[item.sku] || 0) + qty;
        // 출고내역 기준 cbmConfirmed: 개별 cbm이 0이면 추정
        if (item.cbmConfirmed === false) skuCbmConfirmed[item.sku] = false;
        if (skuCbmConfirmed[item.sku] === undefined) skuCbmConfirmed[item.sku] = item.cbmConfirmed !== false;
      }

      let newTotalQty = 0, newTotalCbm = 0;
      for (const item of excelData.items) {
        if (qtyMap[item.sku] !== undefined) item.shippedQty = qtyMap[item.sku];
        if (skuCbmTotal[item.sku] !== undefined) item.totalCbm = skuCbmTotal[item.sku];
        if (skuCbmConfirmed[item.sku] !== undefined) item.cbmConfirmed = skuCbmConfirmed[item.sku];
        newTotalQty += item.shippedQty;
        newTotalCbm += item.totalCbm || 0;
      }
      excelData.totals.totalQty = newTotalQty;
      excelData.totals.totalCbm = newTotalCbm;
      excelData.boxCount2 = excel2Data.boxCount;
    }

    // 청구서 PDF 파싱 (다중 파일 합산)
    let invoiceData = null;
    console.log('[청구서] 파일 수:', invoiceFiles.length, invoiceFiles.map(f => f?.name));
    for (const invFile of invoiceFiles) {
      if (!invFile || invFile.size === 0) continue;
      const pdfParse = (await import('pdf-parse')).default;
      const buf = Buffer.from(await invFile.arrayBuffer());
      const pdf = await pdfParse(buf);
      const parsed = parseInvoicePdf(pdf.text);

      console.log('[청구서] 파싱 결과:', invFile.name, 'costs:', Object.keys(parsed.costs), 'total:', parsed.totalAmount);
      if (!invoiceData) {
        invoiceData = parsed;
      } else {
        // 비용 항목 합산
        for (const [key, val] of Object.entries(parsed.costs)) {
          if (invoiceData.costs[key]) {
            invoiceData.costs[key].amount = (invoiceData.costs[key].amount || 0) + (val.amount || 0);
            invoiceData.costs[key].vatAmount = (invoiceData.costs[key].vatAmount || 0) + (val.vatAmount || 0);
          } else {
            invoiceData.costs[key] = { ...val };
          }
        }
        invoiceData.totalAmount += parsed.totalAmount || 0;
        invoiceData.totalVat += parsed.totalVat || 0;
        if (parsed.cbm > 0) invoiceData.cbm += parsed.cbm;
        if (parsed.weight > 0) invoiceData.weight += parsed.weight;
        if (parsed.packages > 0) invoiceData.packages = Math.max(invoiceData.packages, parsed.packages);
        if (!invoiceData.exchangeRateCNY && parsed.exchangeRateCNY) invoiceData.exchangeRateCNY = parsed.exchangeRateCNY;
      }
    }

    // 정산서 PDF 파싱
    let declarationData = null;
    if (declarationFile && declarationFile.size > 0) {
      const pdfParse = (await import('pdf-parse')).default;
      const buf = Buffer.from(await declarationFile.arrayBuffer());
      const pdf = await pdfParse(buf);
      declarationData = parseDeclarationPdf(pdf.text);
    }

    const exchangeRateCNY = exchangeRateInput ? parseFloat(exchangeRateInput) : 0;
    const result = calculateImportCosts({ excelData, invoiceData, declarationData, exchangeRateCNY });

    // 위안화 정보 엑셀 로드
    let yuanMap = {};
    try {
      if (fs.existsSync(PATHS.yuanInfo)) {
        const buf = fs.readFileSync(PATHS.yuanInfo);
        const wb = XLSX.read(buf, { type: 'buffer' });
        const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        for (let i = 1; i < sheet.length; i++) {
          const sku = sheet[i][5];
          const yuan = sheet[i][8];
          if (sku && yuan != null) yuanMap[String(sku)] = Number(yuan);
        }
      }
    } catch (e) {
      console.error('[위안화] 로드 실패:', e.message);
    }

    // SKU별 평균 원가 + 최근 5건 평균 비율
    let skuAvgCost = {};
    let skuShipCount = {};
    let recent5AvgRatio = null;
    try {
      if (fs.existsSync(PATHS.allData)) {
        const allData = JSON.parse(fs.readFileSync(PATHS.allData, 'utf8'));
        const skuCosts = {};
        for (const entry of Object.values(allData)) {
          if (!entry.rows) continue;
          const seenSkus = new Set();
          for (const r of entry.rows) {
            if (r.sku && r.costPerUnit) {
              if (!skuCosts[r.sku]) skuCosts[r.sku] = [];
              skuCosts[r.sku].push(r.costPerUnit);
              seenSkus.add(r.sku);
            }
          }
          for (const sku of seenSkus) {
            skuShipCount[sku] = (skuShipCount[sku] || 0) + 1;
          }
        }
        for (const [sku, costs] of Object.entries(skuCosts)) {
          skuAvgCost[sku] = Math.round(costs.reduce((s, c) => s + c, 0) / costs.length);
        }

        const shipments = Object.entries(allData)
          .map(([key, entry]) => {
            const dm = key.match(/\d{6}/);
            return { key, dateNum: dm ? parseInt(dm[0]) : 0, rows: entry.rows || [] };
          })
          .filter(s => s.dateNum > 0)
          .sort((a, b) => b.dateNum - a.dateNum)
          .slice(0, 5);

        let allTotalCost = 0, allTotalRaw = 0;
        const detail = [];
        for (const s of shipments) {
          let sCost = 0, sRaw = 0;
          for (const r of s.rows) {
            if (r.unitPriceRaw > 0 && r.costPerUnit > 0) {
              sCost += r.costPerUnit * r.shippedQty;
              sRaw += r.unitPriceRaw * r.shippedQty;
            }
          }
          if (sRaw > 0) {
            allTotalCost += sCost;
            allTotalRaw += sRaw;
            detail.push({ key: s.key, avg: Math.round(sCost / sRaw * 100) / 100 });
          }
        }
        if (allTotalRaw > 0) {
          recent5AvgRatio = {
            avg: Math.round(allTotalCost / allTotalRaw * 100) / 100,
            detail,
          };
        }
      }
    } catch (e) {
      console.error('[원가평균] 로드 실패:', e.message);
    }

    return NextResponse.json({
      success: true,
      data: result,
      yuanMap,
      skuAvgCost,
      skuShipCount,
      recent5AvgRatio,
      parsed: {
        excel: { itemCount: excelData.items.length, totals: excelData.totals, boxCount: excelData.boxCount, boxCount2: excelData.boxCount2, shipmentCode: excelData.shipmentCode },
        invoice: invoiceData ? {
          blNo: invoiceData.blNo, cbm: invoiceData.cbm, weight: invoiceData.weight,
          packages: invoiceData.packages, costs: invoiceData.costs,
          exchangeRateCNY: invoiceData.exchangeRateCNY, totalAmount: invoiceData.totalAmount,
        } : null,
        declaration: declarationData ? {
          declarationNo: declarationData.declarationNo, blNo: declarationData.blNo,
          exchangeRate: declarationData.exchangeRate,
          totalCustomsDuty: declarationData.totalCustomsDuty, totalVat: declarationData.totalVat,
          itemCount: declarationData.items.length,
        } : null,
      },
    });
  } catch (error) {
    console.error('Calculation error:', error);
    return NextResponse.json({ error: `계산 오류: ${error.message}` }, { status: 500 });
  }
}
