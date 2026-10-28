import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatUzs, formatCompact } from './utils';

export interface GroupedCartItem {
  model: string;
  displayName: string;
  is2Sort?: boolean;
  sizes: Record<string, number>;
  totalQty: number;
  price: number;
}

export interface ChiqimReceiptData {
  sana: string;
  kimga: string;
  cart: any[];
  totalQty: number;
  totals: { sale: number; profit: number };
  discount?: number;
  originalSale?: number;
  oldBalance?: number;
  shipmentTotal?: number;
  totalDue?: number;
  paidAmount?: number;
  remainingDebt?: number;
  paymentMethod?: string;
}

export interface InvoicePdfOptions {
  receiptData: ChiqimReceiptData;
  groupedCartItems: GroupedCartItem[];
  currentOmbor: string;
  currentUser?: { ism?: string; rol?: string } | null;
  customer?: { tel?: string; manzil?: string } | null;
  mode?: 'standard' | 'thermal';
}

/**
 * Generates an ultra-sharp, publication-quality vector PDF for standard A4 invoice
 */
export async function generateA4InvoicePdf({
  receiptData,
  groupedCartItems,
  currentOmbor,
  currentUser,
  customer,
}: InvoicePdfOptions): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 12;
  const contentWidth = pageWidth - (marginX * 2); // 186mm
  const docNumber = Date.now().toString().slice(-6);

  // 1. HEADER (Left: Xaridor card, Right: YUK XATI meta card)
  const metaCardW = 58;
  const metaCardX = pageWidth - marginX - metaCardW;
  const headerCardH = 14;
  const headerY = 12;

  // Left: Customer (Xaridor) Card
  const clientCardW = contentWidth - metaCardW - 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(marginX, headerY, clientCardW, headerCardH, 2, 2, 'FD');

  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('XARIDOR (QABUL QILUVCHI)', marginX + 3.5, headerY + 4);

  const clientName = receiptData.kimga || 'Noma\'lum mijoz';
  const clientSub = customer?.tel ? `Tel: ${customer.tel}` : 'Amal turi: Sotuv / Chiqim';

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const cleanMain = doc.splitTextToSize(clientName, clientCardW - 8)[0] || clientName;
  doc.text(cleanMain, marginX + 3.5, headerY + 8.2);

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const cleanSub = doc.splitTextToSize(clientSub, clientCardW - 8)[0] || clientSub;
  doc.text(cleanSub, marginX + 3.5, headerY + 11.8);

  // Right: Document Meta Card (YUK XATI)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(metaCardX, headerY, metaCardW, headerCardH, 2, 2, 'FD');

  // YUK XATI badge
  doc.setFillColor(255, 241, 242);
  doc.setDrawColor(254, 205, 211);
  doc.roundedRect(metaCardX + 2.5, headerY + 2.2, 20, 4.5, 1, 1, 'FD');
  doc.setTextColor(225, 29, 72);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('YUK XATI', metaCardX + 12.5, headerY + 5.5, { align: 'center' });

  // Date
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(receiptData.sana, metaCardX + metaCardW - 3, headerY + 5.5, { align: 'right' });

  // Document No
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`No. CH-${docNumber}`, metaCardX + metaCardW - 3, headerY + 11.5, { align: 'right' });

  // Horizontal divider
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.line(marginX, 28, pageWidth - marginX, 28);

  // 2. PRODUCTS TABLE
  const tableRows = groupedCartItems.map((item, idx) => {
    const sizeDetails = Object.entries(item.sizes)
      .filter(([, qty]) => Number(qty) > 0)
      .map(([sz, qty]) => `${sz}: ${qty}`)
      .join(', ');
    const rowSum = item.totalQty * item.price;
    return [
      String(idx + 1),
      item.displayName,
      sizeDetails,
      `${item.totalQty} juft`,
      formatCompact(item.price),
      `${formatUzs(rowSum)} UZS`,
    ];
  });

  autoTable(doc, {
    startY: 32,
    margin: { left: marginX, right: marginX },
    head: [['#', 'Model nomi', 'O\'lchamlar taqsimoti', 'Miqdori', 'Narxi', 'Summa']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [51, 65, 85],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    styles: {
      fontSize: 7.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      cellPadding: 2.2,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', textColor: [148, 163, 184] },
      1: { cellWidth: 44, fontStyle: 'bold', textColor: [15, 23, 42] },
      2: { cellWidth: 60, fontStyle: 'normal' },
      3: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 30, halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] },
    },
    didDrawPage: (data) => {
      // Print page footer on each page
      const pNum = data.pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('OmborPro - Poyabzal ombori va ishlab chiqarish tizimi', marginX, pageHeight - 8);
      doc.text(`Sahifa ${pNum}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    }
  });

  // 4. FINANCIAL SUMMARY CARD
  const tableEndY = (doc as any).lastAutoTable?.finalY || 100;
  let summaryY = tableEndY + 5;

  // If summary + signatures exceed bottom threshold, add new page cleanly
  const requiredBottomSpace = 65; // mm
  if (summaryY + requiredBottomSpace > pageHeight - 15) {
    doc.addPage();
    summaryY = 18;
  }

  // Left Note
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Chiqim qilingan vaqt: ${receiptData.sana}`, marginX, summaryY + 5);

  // Right Summary Table
  const sumW = 92;
  const sumX = pageWidth - marginX - sumW;
  let curRowY = summaryY;

  const drawRow = (
    label: string, 
    val: string, 
    options?: { isBold?: boolean; isHighlight?: boolean; isDark?: boolean; isEmerald?: boolean; isRose?: boolean }
  ) => {
    const rowH = 6;
    if (options?.isDark) {
      doc.setFillColor(15, 23, 42); // dark background
      doc.roundedRect(sumX, curRowY, sumW, 8.5, 1.5, 1.5, 'F');
      doc.setTextColor(241, 245, 249);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(label.toUpperCase() + ':', sumX + 3.5, curRowY + 5.6);
      doc.setTextColor(253, 164, 175);
      doc.setFontSize(9.5);
      doc.text(val, sumX + sumW - 3.5, curRowY + 5.6, { align: 'right' });
      curRowY += 9.5;
      return;
    }

    if (options?.isHighlight) {
      doc.setFillColor(241, 245, 249);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(sumX, curRowY, sumW, rowH, 1, 1, 'FD');
    } else if (options?.isEmerald) {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
      doc.roundedRect(sumX, curRowY, sumW, rowH, 1, 1, 'FD');
    } else if (options?.isRose) {
      doc.setFillColor(255, 241, 242);
      doc.setDrawColor(254, 205, 211);
      doc.roundedRect(sumX, curRowY, sumW, rowH, 1, 1, 'FD');
    }

    doc.setFont('helvetica', options?.isBold ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    if (options?.isEmerald) {
      doc.setTextColor(6, 95, 70);
    } else if (options?.isRose) {
      doc.setTextColor(190, 18, 60);
    } else {
      doc.setTextColor(71, 85, 105);
    }
    doc.text(label + ':', sumX + 3.5, curRowY + 4.2);

    doc.setFont('helvetica', 'bold');
    if (options?.isEmerald) {
      doc.setTextColor(5, 150, 105);
    } else if (options?.isRose) {
      doc.setTextColor(225, 29, 72);
    } else {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(val, sumX + sumW - 3.5, curRowY + 4.2, { align: 'right' });

    curRowY += rowH + 1;
  };

  // 1. Jami Miqdor
  drawRow('JAMI MIQDOR', `${receiptData.totalQty} juft`, { isBold: true, isHighlight: true });

  // Discount breakdown if applicable
  if (receiptData.discount && receiptData.discount > 0) {
    const origSale = receiptData.originalSale || (receiptData.totals.sale + receiptData.discount);
    drawRow('ASL TOVAR SUMMASI', `${formatUzs(origSale)} UZS`);
    drawRow('CHEGIRMA', `-${formatUzs(receiptData.discount)} UZS`, { isBold: true, isRose: true });
  }

  // 2. Berilayotgan yuk puli
  const shipmentTotal = receiptData.shipmentTotal ?? receiptData.totals.sale;
  drawRow('BERILAYOTGAN YUK PULI', `${formatUzs(shipmentTotal)} UZS`, { isBold: true, isHighlight: true });

  // 3. Avvalgi qarz
  const oldBalance = receiptData.oldBalance ?? 0;
  drawRow('AVVALGI QARZ', `${formatUzs(oldBalance)} UZS`);

  // 4. Qabul qilingan to'lov
  const paidAmount = receiptData.paidAmount ?? 0;
  if (paidAmount > 0) {
    const payMethodName = receiptData.paymentMethod || 'Naqd';
    drawRow(`QABUL QILINDI (${payMethodName})`, `-${formatUzs(paidAmount)} UZS`, { isBold: true, isEmerald: true });
  }

  // 5. Qoldiq qarz
  const totalDue = receiptData.totalDue ?? (oldBalance + shipmentTotal);
  const remainingDebt = receiptData.remainingDebt ?? (totalDue - paidAmount);
  drawRow('QOLDIQ QARZ', `${formatUzs(remainingDebt)} UZS`, { isDark: true });

  // 5. SIGNATURES (Topshirdi / Qabul qildi)
  const sigY = curRowY + 8;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, sigY - 4, pageWidth - marginX, sigY - 4);

  const sigBoxW = 65;
  // Left: Omborchi
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOPSHIRDI (OMBORCHI):', marginX, sigY);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(marginX, sigY + 8, marginX + sigBoxW, sigY + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Imzo / F.I.SH', marginX, sigY + 12);

  // Right: Xaridor
  const rightSigX = pageWidth - marginX - sigBoxW;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('QABUL QILDI (XARIDOR):', rightSigX, sigY);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(rightSigX, sigY + 8, rightSigX + sigBoxW, sigY + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Imzo / F.I.SH', rightSigX, sigY + 12);

  // Trigger download
  const safeName = (receiptData.kimga || 'Mijoz').replace(/\s+/g, '_');
  const fileName = `Faktura_${safeName}_${docNumber}.pdf`;
  doc.save(fileName);
}

/**
 * Generates an 80mm thermal receipt vector PDF
 */
export async function generateThermalReceiptPdf({
  receiptData,
  groupedCartItems,
  currentOmbor,
}: InvoicePdfOptions): Promise<void> {
  const thermalW = 80; // mm
  const margin = 4;
  const printW = thermalW - (margin * 2); // 72mm

  // Estimate required height dynamically
  const baseH = 80;
  const itemsH = groupedCartItems.length * 10;
  const summaryH = 45;
  const totalH = Math.max(120, baseH + itemsH + summaryH);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [thermalW, totalH],
    compress: true,
  });

  let y = 8;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('OMBOR PRO', thermalW / 2, y, { align: 'center' });
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(60, 60, 60);
  doc.text('Poyabzal ishlab chiqarish va ombori', thermalW / 2, y, { align: 'center' });
  y += 4;

  // Dashed line
  doc.setLineDashPattern([1, 1], 0);
  doc.setDrawColor(150, 150, 150);
  doc.line(margin, y, thermalW - margin, y);
  y += 4;

  // Meta info
  const drawMetaRow = (label: string, val: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(val, thermalW - margin, y, { align: 'right' });
    y += 4;
  };

  drawMetaRow('Xaridor:', receiptData.kimga);
  drawMetaRow('Sana:', receiptData.sana);
  drawMetaRow('Ombor:', (currentOmbor || 'Tepa').toUpperCase());

  // Dashed line
  doc.line(margin, y, thermalW - margin, y);
  y += 4;

  // Items
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('MAHSULOTLAR:', margin, y);
  y += 4;

  groupedCartItems.forEach((item, i) => {
    const szStr = Object.entries(item.sizes)
      .filter(([, q]) => Number(q) > 0)
      .map(([sz, q]) => `${sz}:${q}`)
      .join(' ');
    const rowSum = item.totalQty * item.price;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`${i + 1}. ${item.displayName}`, margin, y);
    doc.text(formatCompact(rowSum), thermalW - margin, y, { align: 'right' });
    y += 3.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`(${szStr})  ${item.totalQty} juft x ${formatCompact(item.price)}`, margin + 2, y);
    y += 4.5;
  });

  // Dashed line
  doc.line(margin, y, thermalW - margin, y);
  y += 4;

  // Totals
  const drawThermalSumRow = (label: string, val: string, isBold = false) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text(label, margin, y);
    doc.text(val, thermalW - margin, y, { align: 'right' });
    y += 4;
  };

  drawThermalSumRow('JAMI JUFT:', `${receiptData.totalQty} juft`, true);

  const shipmentTotal = receiptData.shipmentTotal ?? receiptData.totals.sale;
  drawThermalSumRow('YUK PULI:', `${formatUzs(shipmentTotal)} UZS`, true);

  const oldBal = receiptData.oldBalance ?? 0;
  drawThermalSumRow('AVVALGI QARZ:', `${formatUzs(oldBal)} UZS`);

  const paidAmount = receiptData.paidAmount ?? 0;
  if (paidAmount > 0) {
    drawThermalSumRow(`TO'LOV (${receiptData.paymentMethod || 'Naqd'}):`, `-${formatUzs(paidAmount)} UZS`, true);
  }

  const totalDue = receiptData.totalDue ?? (oldBal + shipmentTotal);
  const remDebt = receiptData.remainingDebt ?? (totalDue - paidAmount);
  y += 1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('QOLDIQ QARZ:', margin, y);
  doc.text(`${formatUzs(remDebt)} UZS`, thermalW - margin, y, { align: 'right' });
  y += 6;

  // Dashed line
  doc.line(margin, y, thermalW - margin, y);
  y += 4;

  // Footer greeting
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Xaridingiz uchun rahmat!', thermalW / 2, y, { align: 'center' });

  const safeName = (receiptData.kimga || 'Mijoz').replace(/\s+/g, '_');
  const fileName = `Chek_${safeName}_${Date.now().toString().slice(-6)}.pdf`;
  doc.save(fileName);
}
