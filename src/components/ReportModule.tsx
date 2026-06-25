import React, { useRef, useState, useMemo } from 'react';
import { Download, FileText, PieChart, TrendingUp, AlertTriangle, CheckCircle, BarChart3, Shield, Loader2, Table } from 'lucide-react';
import { AssetData, BenchmarkData } from '../data/refinitiv_data';
import { PerformanceMetrics } from '../types';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  PieChart as RechartsPieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Bar, 
  Scatter, 
  ScatterChart,
  ZAxis,
  Label,
  ComposedChart,
  Line,
  ReferenceLine,
  LabelList
} from 'recharts';
import { MarkowitzOptimizer, calculateReturns } from '../lib/finance_math';

interface ReportModuleProps {
  metrics: PerformanceMetrics[];
  rfAnnual: number;
  assetsDb: AssetData[];
  benchmarkDb: BenchmarkData;
  periodsPerYear: number;
  riskScore: number | null;
  riskCoefficient: number;
  portfolioTabSuggestion: 'mvp' | 'tangent' | 'custom' | null;
  selectedAssetTickers?: string[];
  optimalPortfolio?: any;
  optimizationResults?: any;
  forecastResults?: any;
}

export default function ReportModule({
  metrics,
  rfAnnual,
  assetsDb,
  benchmarkDb,
  periodsPerYear,
  riskScore,
  riskCoefficient,
  portfolioTabSuggestion,
  selectedAssetTickers = [],
  optimalPortfolio,
  optimizationResults,
  forecastResults
}: ReportModuleProps) {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const donutChartRef = useRef<HTMLDivElement>(null);
  const smlChartRef = useRef<HTMLDivElement>(null);

  // Helper to find metric by ticker
  const getMetric = (ticker: string) => metrics.find(m => m.ticker === ticker);

  // Filtrar activos disponibles según los seleccionados en Módulo 0.5
  const filteredAssetsDb = useMemo(() => {
    if (selectedAssetTickers && selectedAssetTickers.length > 0) {
      return assetsDb.filter(a => selectedAssetTickers.includes(a.ticker));
    }
    return assetsDb.slice(0, Math.min(8, assetsDb.length));
  }, [assetsDb, selectedAssetTickers]);

  const { optimizer, minVarPortfolio, maxSharpePortfolio, efficientFrontierPoints, correlationMatrix } = useMemo(() => {
    if (optimizationResults) {
      return {
        optimizer: optimizationResults.optimizer,
        minVarPortfolio: optimizationResults.mcResult.minVarPortfolio,
        maxSharpePortfolio: optimizationResults.mcResult.maxSharpePortfolio,
        efficientFrontierPoints: optimizationResults.efPoints,
        correlationMatrix: optimizationResults.correlationMatrix
      };
    }
    
    if (filteredAssetsDb.length === 0) return { optimizer: null, minVarPortfolio: null, maxSharpePortfolio: null, efficientFrontierPoints: [], correlationMatrix: [] };
    const tickers = filteredAssetsDb.map(a => a.ticker);
    const returnsMatrix = filteredAssetsDb.map(a => calculateReturns(a.prices));
    
    // Fallback in case there are missing prices
    if (returnsMatrix.some(r => r.length < 2)) {
      return { optimizer: null, minVarPortfolio: null, maxSharpePortfolio: null, efficientFrontierPoints: [], correlationMatrix: [] };
    }

    const opt = new MarkowitzOptimizer(tickers, returnsMatrix, periodsPerYear);
    const sim = opt.runMonteCarlo(3000, rfAnnual);
    
    // Calcular Matriz de Correlación
    const size = tickers.length;
    const corrMatrix: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const retI = returnsMatrix[i];
        const retJ = returnsMatrix[j];
        
        // Pearson correlation
        const meanI = retI.reduce((a,b)=>a+b,0)/retI.length;
        const meanJ = retJ.reduce((a,b)=>a+b,0)/retJ.length;
        let num = 0;
        let denI = 0;
        let denJ = 0;
        for (let k = 0; k < retI.length; k++) {
          const diffI = retI[k] - meanI;
          const diffJ = retJ[k] - meanJ;
          num += diffI * diffJ;
          denI += diffI * diffI;
          denJ += diffJ * diffJ;
        }
        corrMatrix[i][j] = denI === 0 || denJ === 0 ? 0 : num / Math.sqrt(denI * denJ);
      }
    }
    
    return { 
      optimizer: opt, 
      minVarPortfolio: sim.minVarPortfolio, 
      maxSharpePortfolio: sim.maxSharpePortfolio,
      efficientFrontierPoints: sim.efficientFrontierPoints,
      correlationMatrix: corrMatrix
    };
  }, [filteredAssetsDb, periodsPerYear, rfAnnual, optimizationResults]);

  const recommendedPortfolio = useMemo(() => {
    if (optimalPortfolio) return optimalPortfolio;
    if (portfolioTabSuggestion === 'tangent' || riskCoefficient < 4) {
      return maxSharpePortfolio;
    }
    return minVarPortfolio;
  }, [maxSharpePortfolio, minVarPortfolio, portfolioTabSuggestion, riskCoefficient, optimalPortfolio]);

  // Generate weights array from optimal portfolio
  const weights = useMemo(() => {
    if (!recommendedPortfolio || !filteredAssetsDb) return [];
    return recommendedPortfolio.weights.map((w, idx) => ({
      ticker: filteredAssetsDb[idx].ticker,
      weight: w,
      type: w > 0.05 ? (portfolioTabSuggestion === 'tangent' || riskCoefficient < 4 ? 'Crecimiento' : 'Refugio') : 'Diversificación'
    })).filter(w => w.weight > 0.005).sort((a, b) => b.weight - a.weight);
  }, [recommendedPortfolio, filteredAssetsDb, portfolioTabSuggestion, riskCoefficient]);

  const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

  // Calcular rendimiento promedio del Benchmark de manera precisa
  const benchmarkReturnAnnualized = useMemo(() => {
    if (!benchmarkDb || !benchmarkDb.prices || benchmarkDb.prices.length < 2) return 0.08;
    const rets = [];
    for (let i = 1; i < benchmarkDb.prices.length; i++) {
      rets.push((benchmarkDb.prices[i] - benchmarkDb.prices[i - 1]) / benchmarkDb.prices[i - 1]);
    }
    const avg = rets.reduce((sum, val) => sum + val, 0) / rets.length;
    return avg * periodsPerYear;
  }, [benchmarkDb, periodsPerYear]);

  // Datos para graficar la Security Market Line (SML)
  const smlChartData = useMemo(() => {
    const scatterPoints = metrics.map(m => ({
      ticker: m.ticker,
      beta: m.beta,
      retorno: m.annualReturn * 100,
      alpha: m.alphaJensen * 100,
      isLine: false
    }));

    const maxBeta = Math.max(...metrics.map(m => m.beta), 1.5);
    const smlLinePoints = [
      { beta: 0, retorno: rfAnnual * 100, isLine: true },
      { beta: 1.0, retorno: benchmarkReturnAnnualized * 100, isLine: true },
      { beta: Number((maxBeta * 1.1).toFixed(2)), retorno: (rfAnnual + (maxBeta * 1.1) * (benchmarkReturnAnnualized - rfAnnual)) * 100, isLine: true }
    ];

    return { scatterPoints, smlLinePoints };
  }, [metrics, rfAnnual, benchmarkReturnAnnualized]);

  // Datos para gráfico de Alfas de Jensen
  const alphaChartData = useMemo(() => {
    return weights.map(w => {
      const metric = getMetric(w.ticker);
      const alphaVal = (metric?.alphaJensen || 0) * 100;
      return {
        ticker: w.ticker,
        alpha: Number(alphaVal.toFixed(3)),
        fill: alphaVal >= 0 ? '#10b981' : '#f43f5e'
      };
    });
  }, [weights, metrics]);

  // Datos unificados y coordinados para la Frontera de Eficiencia de Markowitz (escala 0-100)
  const frontierGraphicData = useMemo(() => {
    // 1. Puntos de la Frontera Eficiente (efPoints)
    let efPoints: { risk: number; return: number }[] = [];
    if (optimizationResults && optimizationResults.efPoints) {
      efPoints = optimizationResults.efPoints;
    } else if (efficientFrontierPoints) {
      efPoints = efficientFrontierPoints.map(p => ({
        risk: Number((p.risk * 100).toFixed(2)),
        return: Number((p.return * 100).toFixed(2))
      }));
    }

    // 2. Portafolios Clave (MVP y Tangente)
    const mvpPoint = minVarPortfolio ? [{
      risk: Number((minVarPortfolio.risk * 100).toFixed(2)),
      return: Number((minVarPortfolio.return * 100).toFixed(2)),
      sharpe: minVarPortfolio.sharpe,
      type: 'mvp'
    }] : [];

    const tangentPoint = maxSharpePortfolio ? [{
      risk: Number((maxSharpePortfolio.risk * 100).toFixed(2)),
      return: Number((maxSharpePortfolio.return * 100).toFixed(2)),
      sharpe: maxSharpePortfolio.sharpe,
      type: 'tangent'
    }] : [];

    const recommendedPoint = recommendedPortfolio ? [{
      risk: Number((recommendedPortfolio.risk * 100).toFixed(2)),
      return: Number((recommendedPortfolio.return * 100).toFixed(2)),
      sharpe: recommendedPortfolio.sharpe,
      type: 'recommended'
    }] : [];

    // 3. Activos individuales de la base de datos seleccionada
    const assetPoints = filteredAssetsDb.map(asset => {
      const metric = metrics.find(m => m.ticker === asset.ticker);
      return {
        ticker: asset.ticker,
        risk: Number(((metric?.annualVolatility || 0) * 100).toFixed(2)),
        return: Number(((metric?.annualReturn || 0) * 100).toFixed(2)),
        type: 'asset'
      };
    });

    // 4. Línea CML (Capital Market Line)
    let cmlPoints: { risk: number; return: number }[] = [];
    if (optimizationResults && optimizationResults.cmlPoints) {
      cmlPoints = optimizationResults.cmlPoints;
    } else if (maxSharpePortfolio) {
      const tp = maxSharpePortfolio;
      const maxRiskLimit = Math.max(...(efficientFrontierPoints?.map(p => p.risk) || [0.3])) * 1.35;
      for (let riskStep = 0; riskStep <= maxRiskLimit; riskStep += maxRiskLimit / 15) {
        cmlPoints.push({
          risk: Number((riskStep * 100).toFixed(2)),
          return: Number(((rfAnnual + tp.sharpe * riskStep) * 100).toFixed(2))
        });
      }
    }

    // 5. Curva de Indiferencia del Perfil de Cliente
    const indifferencePoints: { risk: number; return: number; type: string }[] = [];
    if (minVarPortfolio && maxSharpePortfolio) {
      const tp = maxSharpePortfolio;
      const mvp = minVarPortfolio;

      let targetReturnDec = tp.return;
      let targetRiskDec = tp.risk;

      if (portfolioTabSuggestion === 'mvp' || riskCoefficient >= 6.5) {
        targetReturnDec = mvp.return;
        targetRiskDec = mvp.risk;
      } else if (recommendedPortfolio) {
        targetReturnDec = recommendedPortfolio.return;
        targetRiskDec = recommendedPortfolio.risk;
      }

      const uOptima = targetReturnDec - 0.5 * riskCoefficient * Math.pow(targetRiskDec, 2);
      
      // Limitamos el rango de la curva de indiferencia para que sea local alrededor del portafolio recomendado,
      // evitando estirar los ejes del gráfico innecesariamente y amontonar los portafolios.
      const minVol = Math.max(0.01, targetRiskDec * 0.4);
      const maxVol = Math.min(0.60, targetRiskDec * 1.6);
      
      const pointsCount = 40;
      const step = (maxVol - minVol) / (pointsCount - 1);

      for (let i = 0; i < pointsCount; i++) {
        const volDec = minVol + i * step;
        const retDec = uOptima + 0.5 * riskCoefficient * Math.pow(volDec, 2);

        if (retDec >= -0.05 && retDec <= 0.85) {
          indifferencePoints.push({
            risk: Number((volDec * 100).toFixed(2)),
            return: Number((retDec * 100).toFixed(2)),
            type: 'indifference'
          });
        }
      }
    }

    return {
      efPoints,
      mvpPoint,
      tangentPoint,
      recommendedPoint,
      assetPoints,
      cmlPoints,
      indifferencePoints
    };
  }, [
    optimizationResults, 
    efficientFrontierPoints, 
    minVarPortfolio, 
    maxSharpePortfolio, 
    recommendedPortfolio, 
    filteredAssetsDb, 
    metrics, 
    portfolioTabSuggestion, 
    riskCoefficient, 
    rfAnnual
  ]);

  // Dominios enfocados para evitar que los puntos se amontonen en una esquina y se superpongan.
  // Nos enfocamos en la zona activa de riesgo y retorno donde residen los activos reales y portafolios clave.
  const chartDomains = useMemo(() => {
    const risks = [
      ...frontierGraphicData.assetPoints.map(p => p.risk),
      ...frontierGraphicData.efPoints.map(p => p.risk),
      ...(frontierGraphicData.recommendedPoint?.map(p => p.risk) || []),
      ...(frontierGraphicData.mvpPoint?.map(p => p.risk) || []),
      ...(frontierGraphicData.tangentPoint?.map(p => p.risk) || [])
    ].filter(v => typeof v === 'number' && !isNaN(v) && v > 0);

    const returns = [
      ...frontierGraphicData.assetPoints.map(p => p.return),
      ...frontierGraphicData.efPoints.map(p => p.return),
      ...(frontierGraphicData.recommendedPoint?.map(p => p.return) || []),
      ...(frontierGraphicData.mvpPoint?.map(p => p.return) || []),
      ...(frontierGraphicData.tangentPoint?.map(p => p.return) || [])
    ].filter(v => typeof v === 'number' && !isNaN(v));

    if (risks.length === 0 || returns.length === 0) {
      return {
        x: ['auto', 'auto'] as const,
        y: ['auto', 'auto'] as const
      };
    }

    const minRisk = Math.min(...risks);
    const maxRisk = Math.max(...risks);
    const minReturn = Math.min(...returns);
    const maxReturn = Math.max(...returns);

    const riskRange = maxRisk - minRisk;
    const returnRange = maxReturn - minReturn;

    // Ofrecemos un margen prudente alrededor de los puntos (15% del rango o mínimo un 2% de holgura)
    const xPadding = Math.max(1.5, riskRange * 0.15);
    const yPadding = Math.max(1.5, returnRange * 0.15);

    const xMin = Math.max(0.5, minRisk - xPadding);
    const xMax = maxRisk + xPadding;

    const yMin = minReturn - yPadding;
    const yMax = maxReturn + yPadding;

    return {
      x: [Number(xMin.toFixed(1)), Number(xMax.toFixed(1))],
      y: [Number(yMin.toFixed(1)), Number(yMax.toFixed(1))]
    };
  }, [frontierGraphicData]);

  const riskProfileName = riskScore === null ? 'No Evaluado' :
    riskScore >= 35 ? 'Agresivo' :
    riskScore >= 25 ? 'Moderado' : 'Conservador';

  const generatePDF = () => {
    setIsGeneratingPdf(true);
    
    // Defer execution slightly to allow UI spinner to mount
    setTimeout(() => {
      try {
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
        const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
        const margin = 15; // ~40pt
        const contentWidth = pageWidth - margin * 2; // 180mm

        let y = margin + 5;

        const checkPageBreak = (neededHeight: number) => {
          if (y + neededHeight > pageHeight - margin - 15) {
            doc.addPage();
            y = margin + 5;
          }
        };

        // --- 1. ENCABEZADO Y META-DATOS ---
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(30, 41, 59); // slate-800
        doc.text('Reporte Personalizado de Inversión', margin, y);

        doc.setFontSize(10);
        doc.setTextColor(79, 70, 229); // indigo-600
        const dateStr = `Fecha: ${new Date().toLocaleDateString()}`;
        doc.text(dateStr, pageWidth - margin - doc.getTextWidth(dateStr), y - 2);

        y += 7;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text('Resumen ejecutivo basado en su perfil de riesgo y análisis de mercado.', margin, y);

        doc.setFontSize(9);
        const emisorStr = 'Emisor: Generado por AI Studio';
        doc.text(emisorStr, pageWidth - margin - doc.getTextWidth(emisorStr), y);

        y += 6;
        doc.setDrawColor(226, 232, 240); // slate-200
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        // --- 2. SECCIÓN 1: PERFIL DEL INVERSOR ---
        checkPageBreak(45);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(79, 70, 229); // indigo-600
        doc.text('1. PERFIL DEL INVERSOR', margin, y);
        y += 6;

        doc.setFillColor(248, 250, 252); // slate-50
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, contentWidth, 20, 2, 2, 'FD');

        const colW = contentWidth / 4;
        const statsY = y + 6;

        // Stat 1: Perfil Asignado
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text('PERFIL ASIGNADO', margin + 5, statsY);
        doc.setFontSize(11.5);
        if (riskProfileName === 'Agresivo') doc.setTextColor(220, 38, 38);
        else if (riskProfileName === 'Moderado') doc.setTextColor(217, 119, 6);
        else doc.setTextColor(16, 185, 129);
        doc.text(riskProfileName, margin + 5, statsY + 6);

        // Stat 2: Puntaje Test
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('PUNTAJE TEST', margin + colW + 5, statsY);
        doc.setFontSize(11.5);
        doc.setTextColor(30, 41, 59);
        doc.text(riskScore !== null ? `${riskScore} / 40` : 'N/A', margin + colW + 5, statsY + 6);

        // Stat 3: Aversión (A)
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('AVERSIÓN (A)', margin + colW * 2 + 5, statsY);
        doc.setFontSize(11.5);
        doc.setTextColor(30, 41, 59);
        doc.text(riskCoefficient.toFixed(2), margin + colW * 2 + 5, statsY + 6);

        // Stat 4: Tasa Libre de Riesgo
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('TASA LIBRE RIESGO', margin + colW * 3 + 5, statsY);
        doc.setFontSize(11.5);
        doc.setTextColor(16, 185, 129);
        doc.text(`${(rfAnnual * 100).toFixed(2)}%`, margin + colW * 3 + 5, statsY + 6);

        y += 26;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105); // slate-600
        const summaryText = `Basado en su aversión al riesgo calibrada de A = ${riskCoefficient.toFixed(2)}, se recomienda estructurar el capital bajo un enfoque ${portfolioTabSuggestion === 'mvp' ? 'de Varianza Mínima (defensivo ante turbulencias)' : portfolioTabSuggestion === 'tangent' ? 'Tangente (maximización del ratio de Sharpe)' : 'Personalizado'}. Este perfil ${riskProfileName.toLowerCase()} busca proteger el capital reduciendo drawdowns severos y capturando retornos consistentes.`;
        const splitSummary = doc.splitTextToSize(summaryText, contentWidth);
        doc.text(splitSummary, margin, y);
        y += splitSummary.length * 4.5 + 8;

        // --- 3. SECCIÓN 2: DISTRIBUCIÓN DE PORTAFOLIO RECOMENDADA ---
        checkPageBreak(25 + weights.length * 7);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(79, 70, 229);
        doc.text('2. DISTRIBUCIÓN DE PORTAFOLIO RECOMENDADA', margin, y);
        y += 6;

        // Tabla Header
        doc.setFillColor(30, 41, 59); // slate-800
        doc.rect(margin, y, contentWidth, 7, 'F');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text('Activo / Ticker', margin + 4, y + 4.5);
        doc.text('Clase de Activo', margin + 55, y + 4.5);
        doc.text('Ponderación (%)', margin + 115, y + 4.5);
        doc.text('Retorno Esperado', margin + 148, y + 4.5);
        y += 7;

        weights.forEach((w, idx) => {
          checkPageBreak(7.5);
          if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, contentWidth, 7, 'F');
          }

          // Swatch de color
          const hex = COLORS[idx % COLORS.length];
          const r = parseInt(hex.slice(1, 3), 16);
          const g = parseInt(hex.slice(3, 5), 16);
          const b = parseInt(hex.slice(5, 7), 16);
          doc.setFillColor(r, g, b);
          doc.rect(margin + 4, y + 1.5, 3.5, 3.5, 'F');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(30, 41, 59);
          doc.text(w.ticker, margin + 10, y + 4.5);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(w.type || 'Equidad', margin + 55, y + 4.5);

          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 41, 59);
          doc.text(`${(w.weight * 100).toFixed(2)}%`, margin + 115, y + 4.5);

          const metric = getMetric(w.ticker);
          const retEst = metric ? `${(metric.annualReturn * 100).toFixed(2)}%` : 'N/A';
          doc.setTextColor(16, 185, 129);
          doc.text(retEst, margin + 148, y + 4.5);

          y += 7;
        });

        doc.setDrawColor(203, 213, 225);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        // --- 4. SECCIÓN 3: MÉTRICAS CUANTITATIVAS (CAPM) ---
        checkPageBreak(25 + weights.length * 7);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(79, 70, 229);
        doc.text('3. MÉTRICAS CUANTITATIVAS DE COMPONENTES PRINCIPALES', margin, y);
        y += 6;

        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, contentWidth, 7, 'F');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text('Ticker', margin + 4, y + 4.5);
        doc.text('Volatilidad Anual (σ)', margin + 35, y + 4.5);
        doc.text('Beta Sistemático (β)', margin + 75, y + 4.5);
        doc.text('Alfa Jensen (α)', margin + 115, y + 4.5);
        doc.text('Posición vs SML', margin + 148, y + 4.5);
        y += 7;

        weights.forEach((w, idx) => {
          checkPageBreak(7.5);
          if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, contentWidth, 7, 'F');
          }

          const m = getMetric(w.ticker);
          const vol = m ? `${(m.annualVolatility * 100).toFixed(2)}%` : 'N/A';
          const beta = m ? m.beta.toFixed(2) : '1.00';
          const alphaVal = m ? m.alphaJensen * 100 : 0;
          const alphaStr = `${alphaVal >= 0 ? '+' : ''}${alphaVal.toFixed(2)}%`;
          const diagStr = alphaVal >= 0 ? 'Sobre-renta (Eficiente)' : 'Sub-renta';

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(30, 41, 59);
          doc.text(w.ticker, margin + 4, y + 4.5);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(vol, margin + 35, y + 4.5);
          doc.text(beta, margin + 75, y + 4.5);

          if (alphaVal >= 0) doc.setTextColor(16, 185, 129);
          else doc.setTextColor(225, 29, 72);
          doc.setFont('helvetica', 'bold');
          doc.text(alphaStr, margin + 115, y + 4.5);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          doc.text(diagStr, margin + 148, y + 4.5);

          y += 7;
        });

        doc.setDrawColor(203, 213, 225);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        // --- 5. SECCIÓN 4: MÉTRICAS DE DESEMPEÑO Y RIESGO EXTREMO ---
        checkPageBreak(35 + weights.length * 7);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(79, 70, 229);
        doc.text('4. MÉTRICAS DE DESEMPEÑO Y RIESGO EXTREMO', margin, y);
        y += 6;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105);
        const riskSummaryText = `Análisis de la compensación riesgo-retorno y la exposición a pérdidas extremas. El Ratio de Sharpe mide el exceso de retorno por unidad de volatilidad, mientras que VaR y CVaR cuantifican las pérdidas potenciales en escenarios adversos (cola del 5%).`;
        const splitRiskSummary = doc.splitTextToSize(riskSummaryText, contentWidth);
        doc.text(splitRiskSummary, margin, y);
        y += splitRiskSummary.length * 4.5 + 4;

        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, contentWidth, 7, 'F');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text('Ticker', margin + 4, y + 4.5);
        doc.text('Ratio Sharpe', margin + 35, y + 4.5);
        doc.text('Ratio Sortino', margin + 65, y + 4.5);
        doc.text('Max Drawdown', margin + 100, y + 4.5);
        doc.text('VaR 95%', margin + 135, y + 4.5);
        doc.text('CVaR 95%', margin + 160, y + 4.5);
        y += 7;

        weights.forEach((w, idx) => {
          checkPageBreak(7.5);
          if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, contentWidth, 7, 'F');
          }

          const m = getMetric(w.ticker);
          const sharpe = m ? m.sharpeRatio.toFixed(2) : 'N/A';
          const sortino = m ? m.sortinoRatio.toFixed(2) : 'N/A';
          const dd = m ? `${(m.maxDrawdown * 100).toFixed(2)}%` : 'N/A';
          const var95 = m ? `${(m.var95 * 100).toFixed(2)}%` : 'N/A';
          const cvar95 = m ? `${(m.cvar95 * 100).toFixed(2)}%` : 'N/A';

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(30, 41, 59);
          doc.text(w.ticker, margin + 4, y + 4.5);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          
          if (m && m.sharpeRatio >= 1) doc.setTextColor(16, 185, 129);
          doc.text(sharpe, margin + 35, y + 4.5);
          
          doc.setTextColor(71, 85, 105);
          if (m && m.sortinoRatio >= 1) doc.setTextColor(16, 185, 129);
          doc.text(sortino, margin + 65, y + 4.5);

          doc.setTextColor(225, 29, 72);
          doc.text(dd, margin + 100, y + 4.5);
          doc.text(var95, margin + 135, y + 4.5);
          doc.text(cvar95, margin + 160, y + 4.5);

          y += 7;
        });

        doc.setDrawColor(203, 213, 225);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        // --- 6. SECCIÓN 5: TABLA CAPM VS HISTÓRICO ---
        checkPageBreak(30 + weights.length * 7);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(79, 70, 229);
        doc.text('5. EQUILIBRIO CAPM VS HISTÓRICO', margin, y);
        y += 6;

        doc.setFillColor(30, 41, 59);
        doc.rect(margin, y, contentWidth, 7, 'F');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text('Ticker', margin + 4, y + 4.5);
        doc.text('Beta', margin + 35, y + 4.5);
        doc.text('E[R] CAPM', margin + 65, y + 4.5);
        doc.text('Retorno Hist.', margin + 105, y + 4.5);
        doc.text('Alfa Jensen', margin + 145, y + 4.5);
        y += 7;

        weights.forEach((w, idx) => {
          checkPageBreak(7.5);
          if (idx % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, contentWidth, 7, 'F');
          }

          const m = getMetric(w.ticker);
          const capmExpected = m ? rfAnnual + m.beta * (benchmarkReturnAnnualized - rfAnnual) : 0;
          
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(30, 41, 59);
          doc.text(w.ticker, margin + 4, y + 4.5);

          doc.setFont('helvetica', 'normal');
          doc.setTextColor(71, 85, 105);
          doc.text(m ? m.beta.toFixed(2) : 'N/A', margin + 35, y + 4.5);
          doc.text(m ? `${(capmExpected * 100).toFixed(2)}%` : 'N/A', margin + 65, y + 4.5);
          doc.text(m ? `${(m.annualReturn * 100).toFixed(2)}%` : 'N/A', margin + 105, y + 4.5);

          if (m && m.alphaJensen >= 0) doc.setTextColor(16, 185, 129);
          else doc.setTextColor(225, 29, 72);
          doc.text(m ? `${(m.alphaJensen * 100).toFixed(2)}%` : 'N/A', margin + 145, y + 4.5);

          y += 7;
        });

        doc.setDrawColor(203, 213, 225);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        // --- 7. SECCIÓN 6: MATRIZ DE CORRELACIÓN ---
        if (optimizer && correlationMatrix) {
          checkPageBreak(30 + filteredAssetsDb.length * 7);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(79, 70, 229);
          doc.text('6. MATRIZ DE CORRELACIÓN', margin, y);
          y += 6;

          doc.setFillColor(30, 41, 59);
          doc.rect(margin, y, contentWidth, 7, 'F');
          doc.setFontSize(7.5);
          doc.setTextColor(255, 255, 255);
          doc.text('Ticker', margin + 2, y + 4.5);
          
          const colWidth = (contentWidth - 25) / filteredAssetsDb.length;
          filteredAssetsDb.forEach((a, i) => {
            doc.text(a.ticker.substring(0, 5), margin + 25 + (i * colWidth), y + 4.5);
          });
          y += 7;

          filteredAssetsDb.forEach((a, i) => {
            checkPageBreak(7.5);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(30, 41, 59);
            doc.text(a.ticker.substring(0, 5), margin + 2, y + 4.5);

            doc.setFont('helvetica', 'normal');
            filteredAssetsDb.forEach((_, j) => {
              const corrVal = correlationMatrix[i][j];
              const isDiagonal = i === j;
              const intensity = isDiagonal ? 1 : Math.abs(corrVal);
              
              let r = 255, g = 255, b = 255;
              if (corrVal > 0) {
                // Greens para positiva
                r = 255 - (255 - 16) * intensity * 0.7;
                g = 255 - (255 - 185) * intensity * 0.7;
                b = 255 - (255 - 129) * intensity * 0.7;
              } else if (corrVal < 0) {
                // Reds para negativa
                r = 255 - (255 - 244) * intensity * 0.7;
                g = 255 - (255 - 63) * intensity * 0.7;
                b = 255 - (255 - 94) * intensity * 0.7;
              }
              
              doc.setFillColor(Math.round(r), Math.round(g), Math.round(b));
              doc.rect(margin + 23 + (j * colWidth), y, colWidth, 7, 'F');
              
              if (intensity > 0.6) doc.setTextColor(255, 255, 255);
              else doc.setTextColor(30, 41, 59);
              
              if (isDiagonal) doc.setFont('helvetica', 'bold');
              else doc.setFont('helvetica', 'normal');
              
              doc.text(corrVal.toFixed(4), margin + 25 + (j * colWidth), y + 4.5);
            });

            y += 7;
          });

          doc.setDrawColor(203, 213, 225);
          doc.line(margin, y, pageWidth - margin, y);
          y += 10;
        }

        // --- 8. SECCIÓN 7: PRONÓSTICO (PROYECCIÓN GBM) ---
        if (recommendedPortfolio) {
          checkPageBreak(40);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(12);
          doc.setTextColor(79, 70, 229);
          doc.text('7. PRONÓSTICO A 3 MESES (GBM)', margin, y);
          y += 6;

          doc.setFillColor(30, 41, 59);
          doc.rect(margin, y, contentWidth, 7, 'F');
          doc.setFontSize(8.5);
          doc.setTextColor(255, 255, 255);
          doc.text('Horizonte', margin + 4, y + 4.5);
          doc.text('Pesimista (5%)', margin + 50, y + 4.5);
          doc.text('Esperado', margin + 100, y + 4.5);
          doc.text('Optimista (95%)', margin + 145, y + 4.5);
          y += 7;

          [1, 2, 3].forEach((month, idx) => {
            checkPageBreak(7.5);
            if (idx % 2 === 0) {
              doc.setFillColor(248, 250, 252);
              doc.rect(margin, y, contentWidth, 7, 'F');
            }

            const time = month / 12; // Fraction of a year
            const mu = recommendedPortfolio.return;
            const sigma = recommendedPortfolio.risk;
            const drift = (mu - 0.5 * sigma * sigma) * time;
            const diffusion = sigma * Math.sqrt(time);
            
            const z5 = -1.645;
            const z50 = 0;
            const z95 = 1.645;
            
            const p5 = Math.exp(drift + z5 * diffusion) - 1;
            const p50 = Math.exp(drift + z50 * diffusion) - 1;
            const p95 = Math.exp(drift + z95 * diffusion) - 1;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(30, 41, 59);
            doc.text(`Mes ${month}`, margin + 4, y + 4.5);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(225, 29, 72); // Rose
            doc.text(`${(p5 * 100).toFixed(2)}%`, margin + 50, y + 4.5);
            
            doc.setTextColor(30, 41, 59); // Normal
            doc.setFont('helvetica', 'bold');
            doc.text(`${(p50 * 100).toFixed(2)}%`, margin + 100, y + 4.5);
            
            doc.setTextColor(16, 185, 129); // Emerald
            doc.text(`${(p95 * 100).toFixed(2)}%`, margin + 145, y + 4.5);

            y += 7;
          });

          doc.setDrawColor(203, 213, 225);
          doc.line(margin, y, pageWidth - margin, y);
          y += 10;
        }

        // --- 9. SECCIÓN 8: CONCLUSIONES Y ESTRATEGIA RECOMENDADA ---
        checkPageBreak(40);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(79, 70, 229);
        doc.text('8. CONCLUSIONES Y ESTRATEGIA', margin, y);
        y += 6;

        doc.setFillColor(248, 250, 252); // slate-50
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, y, contentWidth, 30, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(30, 41, 59);
        doc.text('Síntesis del Análisis Multimódulo:', margin + 5, y + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        
        let insight = `El portafolio recomendado favorece activos con Alfas de Jensen positivos y ratios de Sharpe superiores, indicando una generación de valor consistente por encima de la tasa libre de riesgo de ${(rfAnnual * 100).toFixed(2)}%. `;
        insight += `En términos de riesgo extremo, se priorizan instrumentos que presentan un CVaR controlado, protegiendo el capital frente a volatilidades asimétricas (caídas). `;
        insight += `La asignación busca beneficiarse de la diversificación para reducir el impacto del Max Drawdown, optimizando así la frontera eficiente del inversor de perfil ${riskProfileName.toLowerCase()}.`;

        const splitInsight = doc.splitTextToSize(insight, contentWidth - 10);
        doc.text(splitInsight, margin + 5, y + 12);
        y += 40;

        // --- 7. PIE DE PÁGINA VECTORIAL EN TODAS LAS PÁGINAS ---
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(148, 163, 184);
          doc.text('Generado por AI Studio Financial Engine • Documento académico sin valor comercial de asesoría.', margin, pageHeight - 8);

          const pageStr = `Página ${i} de ${totalPages}`;
          doc.text(pageStr, pageWidth - margin - doc.getTextWidth(pageStr), pageHeight - 8);
        }

        doc.save(`Reporte_Personalizado_${new Date().toISOString().slice(0, 10)}.pdf`);
      } catch (error) {
        console.error('Error generating vector PDF:', error);
        alert('Hubo un error al exportar el documento digital vectorial.');
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 50);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* HEADER */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <FileText className="h-6 w-6 text-indigo-600" />
              Reporte Personalizado de Inversión
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Resumen ejecutivo basado en su perfil de riesgo y análisis de mercado.
            </p>
          </div>
          <button 
            onClick={generatePDF}
            disabled={isGeneratingPdf}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-70 shadow-sm cursor-pointer"
          >
            {isGeneratingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isGeneratingPdf ? 'Generando PDF Nativo...' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      {/* REPORTE PARA IMPRIMIR */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8" ref={reportRef}>
        {/* Cabecera del Reporte */}
        <div className="border-b border-slate-200 pb-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Reporte Ejecutivo</h1>
              <p className="text-slate-500 mt-1">Análisis de Portafolio y Riesgo</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-800">Fecha: {new Date().toLocaleDateString()}</p>
              <p className="text-xs text-slate-500">Generado por AI Studio</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* PERFIL DE RIESGO E INTERESES */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <Shield className="h-5 w-5 text-indigo-500" />
              Perfil del Inversor
            </h3>
            
            <div className="bg-indigo-50/50 rounded-xl p-5 border border-indigo-100">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Perfil Asignado</p>
                  <p className={`text-xl font-black ${
                    riskProfileName === 'Agresivo' ? 'text-red-600' : 
                    riskProfileName === 'Moderado' ? 'text-amber-500' : 'text-emerald-600'
                  }`}>
                    {riskProfileName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Puntaje Test</p>
                  <p className="text-xl font-black text-slate-800">{riskScore !== null ? `${riskScore} / 40` : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Aversión (A)</p>
                  <p className="text-lg font-bold text-slate-700">{riskCoefficient.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Tasa Libre de Riesgo</p>
                  <p className="text-lg font-bold text-slate-700">{(rfAnnual * 100).toFixed(2)}%</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
              <p className="text-sm text-slate-700 leading-relaxed">
                Basado en su aversión al riesgo de <strong className="text-slate-900">{riskCoefficient.toFixed(1)}</strong>, 
                le recomendamos un portafolio {portfolioTabSuggestion === 'mvp' ? 'de Varianza Mínima (defensivo)' : portfolioTabSuggestion === 'tangent' ? 'Tangente (maximizar Sharpe)' : 'Personalizado'}.
                Este perfil {riskProfileName.toLowerCase()} busca equilibrar sus objetivos de rentabilidad con su tolerancia a la volatilidad del mercado.
              </p>
            </div>
          </div>

          {/* DISTRIBUCIÓN RECOMENDADA */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2">
              <PieChart className="h-5 w-5 text-indigo-500" />
              Distribución de Portafolio Recomendada
            </h3>

            <div className="h-64 w-full" ref={donutChartRef}>
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={weights}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="weight"
                    nameKey="ticker"
                  >
                    {weights.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${(value * 100).toFixed(2)}%`} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {weights.map((w, i) => (
                <div key={w.ticker} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    <span className="font-bold text-slate-700">{w.ticker}</span>
                  </div>
                  <span className="font-mono text-slate-500">{(w.weight * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RESUMEN DE ACTIVOS (TOP) */}
        <div className="mt-8 pt-8 border-t border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2 mb-6">
            <BarChart3 className="h-5 w-5 text-indigo-500" />
            Métricas de Componentes Principales
          </h3>
          
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weights.map(w => ({
                ticker: w.ticker,
                retorno: (getMetric(w.ticker)?.annualReturn || 0) * 100,
                riesgo: (getMetric(w.ticker)?.annualVolatility || 0) * 100
              }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="ticker" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} label={{ value: '%', angle: -90, position: 'insideLeft', offset: -10, fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="retorno" name="Retorno Anualizado (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="riesgo" name="Volatilidad (%)" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* LÍNEA DEL MERCADO DE ACTIVOS (SML) - VALORACIÓN CAPM */}
        <div className="mt-8 pt-8 border-t border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2 mb-3">
            <TrendingUp className="h-5 w-5 text-indigo-500" />
            Línea del Mercado de Activos (SML) y Alfas de Jensen
          </h3>
          
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            La SML representa la rentabilidad esperada teórica según el modelo CAPM en función del riesgo sistemático (Beta).
            Los activos por <strong>encima de la línea</strong> tienen un <strong>Alfa de Jensen positivo</strong> (generan valor extraordinario para su nivel de riesgo), mientras que aquellos por debajo están sub-rentando respecto al equilibrio del mercado.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Gráfico 1: SML Scatter + Line */}
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3 relative">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block font-mono">
                  Mapa de Valoración CAPM (Rendimiento vs Beta)
                </span>
                {/* Leyenda de la SML idéntica a Módulo 3 */}
                <div className="bg-white/95 border border-slate-100 rounded-lg p-1.5 text-[8px] flex gap-2 font-medium shadow-xs">
                  <span className="flex items-center gap-1 text-emerald-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Alpha &gt; 0 (Subvalorado)
                  </span>
                  <span className="flex items-center gap-1 text-rose-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Alpha &lt; 0 (Sobrevalorado)
                  </span>
                </div>
              </div>
              <div className="h-72 w-full" ref={smlChartRef}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart margin={{ top: 20, right: 20, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" dataKey="beta" domain={[0, 'dataMax + 0.2']} tick={{ fontSize: 9 }}>
                      <Label value="Riesgo Sistemático (Beta β)" offset={-15} position="insideBottom" style={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                    </XAxis>
                    <YAxis type="number" tick={{ fontSize: 9 }} label={{ value: 'Retorno Anual (%)', angle: -90, position: 'insideLeft', offset: -10, style: { fontSize: 10, fill: '#64748b', fontWeight: 'bold' } }} />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }} 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          if (data.isLine) {
                            return (
                              <div className="bg-slate-900 text-white p-2.5 rounded-lg text-xs leading-relaxed border border-slate-700 shadow-md">
                                <p className="font-bold text-amber-400">Punto de la SML (CAPM)</p>
                                <hr className="my-1 border-slate-700" />
                                <p>Beta Sistemática: <span className="font-bold">{Number(data.beta).toFixed(2)}</span></p>
                                <p>Retorno Exigido CAPM: <span className="font-bold text-emerald-400">{Number(data.retorno).toFixed(2)}%</span></p>
                              </div>
                            );
                          }
                          const requiredReturn = rfAnnual * 100 + data.beta * (benchmarkReturnAnnualized * 100 - rfAnnual * 100);
                          const isUndervalued = data.alpha >= 0;
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-lg text-xs leading-relaxed max-w-[200px] border border-slate-700 shadow-md">
                              <p className="font-bold text-amber-400">{data.ticker}</p>
                              <hr className="my-1 border-slate-700" />
                              <p>Beta (Riesgo Sistemático): <span className="font-mono font-bold">{Number(data.beta).toFixed(3)}</span></p>
                              <p>Retorno Observado Histórico: <span className="font-bold text-blue-400">{Number(data.retorno).toFixed(2)}%</span></p>
                              <p>Retorno Exigido (CAPM): <span className="font-bold text-amber-300">{Number(requiredReturn).toFixed(2)}%</span></p>
                              <p>Alfa de Jensen (α): <span className={`font-bold ${isUndervalued ? 'text-emerald-400' : 'text-rose-400'}`}>{isUndervalued ? '+' : ''}{Number(data.alpha).toFixed(2)}%</span></p>
                              <hr className="my-1 border-slate-700" />
                              <p className="text-[10px]">
                                Veredicto: <strong className={isUndervalued ? 'text-emerald-400' : 'text-rose-400'}>
                                  {isUndervalued ? 'SUBVALORADO (Subpreciado / Compra)' : 'SOBREVALORADO (Sobrepreciado / Venta)'}
                                </strong>
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine x={1.0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <ReferenceLine y={rfAnnual * 100} stroke="#94a3b8" strokeDasharray="3 3" />
                    {/* SML Line - Amber Color like Module 3 */}
                    <Line 
                      name="SML (CAPM)" 
                      data={smlChartData.smlLinePoints} 
                      type="linear" 
                      dataKey="retorno" 
                      stroke="#f59e0b" 
                      strokeWidth={2.2} 
                      dot={{ r: 3, fill: '#f59e0b' }} 
                      activeDot={false} 
                    />
                    {/* Scatter points - Dynamically colored based on Alfa, matching Module 3 */}
                    <Scatter 
                      name="Activos Reales" 
                      data={smlChartData.scatterPoints} 
                    >
                      {smlChartData.scatterPoints.map((entry, index) => {
                        const isUndervalued = entry.alpha >= 0;
                        return (
                          <Cell 
                            key={`cell-${entry.ticker}-${index}`} 
                            fill={isUndervalued ? '#10b981' : '#f43f5e'} 
                            stroke="#fff"
                            strokeWidth={1}
                            r={5.5}
                          />
                        );
                      })}
                    </Scatter>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico 2: Alfas de Jensen de los componentes (Diverging Bar Chart) */}
            <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3">
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block font-mono">
                Distribución del Alfa de Jensen (Exceso de Retorno Ajustado)
              </span>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={alphaChartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="ticker" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} label={{ value: 'Alfa (%)', angle: -90, position: 'insideLeft', offset: -10, style: { fontSize: 10, fill: '#64748b', fontWeight: 'bold' } }} />
                    <Tooltip formatter={(value: number) => [`${value >= 0 ? '+' : ''}${value.toFixed(2)}%`, 'Alfa de Jensen']} />
                    <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
                    <Bar dataKey="alpha" radius={[3, 3, 0, 0]}>
                      {alphaChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* SECCIÓN 4: MÉTRICAS DE DESEMPEÑO Y RIESGO EXTREMO */}
        <div className="mt-8 pt-8 border-t border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-indigo-500" />
            Métricas de Desempeño y Riesgo Extremo
          </h3>
          
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Análisis de la compensación riesgo-retorno y la exposición a pérdidas extremas. El Ratio de Sharpe mide el exceso de retorno por unidad de volatilidad, mientras que VaR y CVaR cuantifican las pérdidas potenciales en escenarios adversos (cola del 5%).
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-800">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-medium text-white uppercase tracking-wider">Ticker</th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Ratio Sharpe</th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Ratio Sortino</th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Max Drawdown</th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">VaR 95%</th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">CVaR 95%</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {weights.map((w, idx) => {
                  const m = getMetric(w.ticker);
                  return (
                    <tr key={w.ticker} className={idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                      <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-slate-900">{w.ticker}</td>
                      <td className={`px-4 py-2 whitespace-nowrap text-xs text-right font-mono ${m && m.sharpeRatio >= 1 ? 'text-emerald-600 font-bold' : 'text-slate-600'}`}>
                        {m ? m.sharpeRatio.toFixed(2) : 'N/A'}
                      </td>
                      <td className={`px-4 py-2 whitespace-nowrap text-xs text-right font-mono ${m && m.sortinoRatio >= 1 ? 'text-emerald-600 font-bold' : 'text-slate-600'}`}>
                        {m ? m.sortinoRatio.toFixed(2) : 'N/A'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-rose-600">
                        {m ? `${(m.maxDrawdown * 100).toFixed(2)}%` : 'N/A'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-rose-600">
                        {m ? `${(m.var95 * 100).toFixed(2)}%` : 'N/A'}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-rose-600 font-bold">
                        {m ? `${(m.cvar95 * 100).toFixed(2)}%` : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECCIÓN X: FRONTERA DE EFICIENCIA */}
        {frontierGraphicData.efPoints && frontierGraphicData.efPoints.length > 0 && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Frontera de Eficiencia de Markowitz y Perfil de Inversor
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Representación visual del conjunto de portafolios óptimos del espacio de inversión. El gráfico incluye los activos individuales del estudio, la Línea del Mercado de Capitales (CML), y la curva de utilidad teórica basada en su aversión al riesgo y perfil estimado en el Módulo de Inducción.
            </p>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 flex flex-col gap-4">
              <div className="h-96 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 25, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis 
                      type="number" 
                      dataKey="risk" 
                      name="Riesgo Anualizado" 
                      unit="%" 
                      tickFormatter={(val) => `${val.toFixed(1)}%`}
                      domain={chartDomains.x}
                      tick={{ fontSize: 9 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="return" 
                      name="Retorno Esperado" 
                      unit="%" 
                      tickFormatter={(val) => `${val.toFixed(1)}%`}
                      domain={chartDomains.y}
                      tick={{ fontSize: 9 }}
                    />
                    <ZAxis type="number" range={[20, 20]} />
                    
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          if (data.type === 'asset') {
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border-none leading-relaxed">
                                <p className="font-bold text-blue-400">Activo: {data.ticker}</p>
                                <hr className="my-1 border-slate-700" />
                                <p>Rendimiento Esperado: <span className="font-bold text-slate-100">{data.return}%</span></p>
                                <p>Volatilidad Individual: <span className="font-bold text-slate-100">{data.risk}%</span></p>
                              </div>
                            );
                          }
                          if (data.type === 'indifference') {
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border border-orange-500/40 leading-relaxed">
                                <p className="font-bold text-orange-400">Curva de Indiferencia (Perfil Cliente)</p>
                                <hr className="my-1 border-slate-700" />
                                <p>Retorno Requerido: <span className="font-bold text-orange-300">{data.return}%</span></p>
                                <p>Volatilidad (Riesgo): <span className="font-bold text-slate-300">{data.risk}%</span></p>
                                <p>Aversión Teórica A: <span className="font-bold text-amber-300">{riskCoefficient.toFixed(1)}</span></p>
                              </div>
                            );
                          }
                          if (data.type === 'mvp') {
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border border-blue-500/40 leading-relaxed">
                                <p className="font-bold text-blue-400">Portafolio Mínima Varianza (MVP)</p>
                                <hr className="my-1 border-slate-700" />
                                <p>Rendimiento Esperado: <span className="font-bold text-emerald-400">{data.return}%</span></p>
                                <p>Riesgo (Volatilidad): <span className="font-bold text-orange-400">{data.risk}%</span></p>
                                <p>Ratio Sharpe: <span className="font-bold text-cyan-400">{data.sharpe ? data.sharpe.toFixed(3) : ''}</span></p>
                              </div>
                            );
                          }
                          if (data.type === 'tangent') {
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border border-red-500/40 leading-relaxed">
                                <p className="font-bold text-rose-400">Portafolio Tangente (Sharpe Máx)</p>
                                <hr className="my-1 border-slate-700" />
                                <p>Rendimiento Esperado: <span className="font-bold text-emerald-400">{data.return}%</span></p>
                                <p>Riesgo (Volatilidad): <span className="font-bold text-orange-400">{data.risk}%</span></p>
                                <p>Ratio Sharpe: <span className="font-bold text-cyan-400">{data.sharpe ? data.sharpe.toFixed(3) : ''}</span></p>
                              </div>
                            );
                          }
                          if (data.type === 'recommended') {
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border border-purple-500/40 leading-relaxed">
                                <p className="font-bold text-purple-400">Portafolio Recomendado</p>
                                <hr className="my-1 border-slate-700" />
                                <p>Rendimiento Esperado: <span className="font-bold text-emerald-400">{data.return}%</span></p>
                                <p>Riesgo (Volatilidad): <span className="font-bold text-orange-400">{data.risk}%</span></p>
                                <p>Ratio Sharpe: <span className="font-bold text-cyan-400">{data.sharpe ? data.sharpe.toFixed(3) : ''}</span></p>
                              </div>
                            );
                          }
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border-none leading-relaxed">
                              <p className="font-bold text-indigo-400">Portafolio Frontera</p>
                              <hr className="my-1 border-slate-700" />
                              <p>Rendimiento Esperado: <span className="font-bold text-emerald-400">{data.return}%</span></p>
                              <p>Riesgo (Volatilidad): <span className="font-bold text-orange-400">{data.risk}%</span></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />

                    {/* 1. Línea de la Frontera Eficiente en Verde */}
                    <Scatter 
                      name="Frontera Eficiente" 
                      data={frontierGraphicData.efPoints} 
                      fill="#10b981" 
                      line={{ stroke: '#10b981', strokeWidth: 2.5 }} 
                      r={0} 
                    />

                    {/* 2. Línea CML (Capital Market Line) en Rojo Discontinuo */}
                    {frontierGraphicData.cmlPoints && frontierGraphicData.cmlPoints.length > 0 && (
                      <Scatter 
                        name="CML (Capital Market Line)" 
                        data={frontierGraphicData.cmlPoints} 
                        fill="#ef4444" 
                        line={{ stroke: '#ef4444', strokeWidth: 1.5, strokeDasharray: '4 4' }} 
                        r={0} 
                        opacity={0.8}
                      />
                    )}

                    {/* 3. Curva de Indiferencia en Naranja Discontinuo */}
                    {frontierGraphicData.indifferencePoints && frontierGraphicData.indifferencePoints.length > 0 && (
                      <Scatter 
                        name="Curva de Indiferencia" 
                        data={frontierGraphicData.indifferencePoints} 
                        fill="#f97316" 
                        line={{ stroke: '#f97316', strokeWidth: 2.2, strokeDasharray: '6 6' }} 
                        r={0} 
                        opacity={0.95}
                      />
                    )}

                    {/* 4. Activos individuales de la base como puntos azules */}
                    <Scatter 
                      name="Activos Base" 
                      data={frontierGraphicData.assetPoints} 
                      fill="#4f46e5" 
                    >
                      <LabelList dataKey="ticker" position="top" style={{ fontSize: 9, fill: '#1e293b', fontWeight: 'bold' }} />
                    </Scatter>

                    {/* 5. Punto MVP de Riesgo Mínimo */}
                    {frontierGraphicData.mvpPoint && frontierGraphicData.mvpPoint.length > 0 && (
                      <Scatter 
                        name="Portafolio MVP" 
                        data={frontierGraphicData.mvpPoint} 
                        fill="#2563eb" 
                        r={6.5} 
                        stroke="#fff" 
                        strokeWidth={1.5} 
                      />
                    )}

                    {/* 6. Punto Tangente de Sharpe Máximo */}
                    {frontierGraphicData.tangentPoint && frontierGraphicData.tangentPoint.length > 0 && (
                      <Scatter 
                        name="Portafolio Tangencial" 
                        data={frontierGraphicData.tangentPoint} 
                        fill="#e11d48" 
                        r={6.5} 
                        stroke="#fff" 
                        strokeWidth={1.5} 
                      />
                    )}

                    {/* 7. Portafolio Recomendado Destacado en Morado */}
                    {frontierGraphicData.recommendedPoint && frontierGraphicData.recommendedPoint.length > 0 && (
                      <Scatter 
                        name="Portafolio Recomendado" 
                        data={frontierGraphicData.recommendedPoint} 
                        fill="#8b5cf6" 
                        r={8.5} 
                        stroke="#fff" 
                        strokeWidth={2} 
                      />
                    )}

                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Leyendas Coordinadas con Módulo 2 */}
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-5 h-0.5 bg-emerald-500 inline-block" />
                  <span>Frontera Eficiente</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-5 h-0.5 border-t border-dashed border-red-500 inline-block" />
                  <span>CML (Capital Market Line)</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-5 h-0.5 border-t border-dashed border-orange-500 inline-block" />
                  <span>Utilidad (A = {riskCoefficient.toFixed(1)})</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                  <span>MVP (Riesgo Mínimo)</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
                  <span>Tangente (Sharpe Máx)</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-bold bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-100">
                  <span className="w-3 h-3 rounded-full bg-purple-600 inline-block" />
                  <span>Portafolio Recomendado</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECCIÓN 5: TABLA DE EQUILIBRIO CAPM VS HISTÓRICO */}
        <div className="mt-8 pt-8 border-t border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
            <CheckCircle className="h-5 w-5 text-indigo-500" />
            Equilibrio CAPM vs Histórico
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-800">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-[10px] font-medium text-white uppercase tracking-wider">Ticker</th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Beta</th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Retorno Esperado CAPM</th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Retorno Histórico</th>
                  <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Alfa de Jensen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {weights.map((w, idx) => {
                  const m = getMetric(w.ticker);
                  if (!m) return null;
                  const capmExpected = rfAnnual + m.beta * (benchmarkReturnAnnualized - rfAnnual);
                  return (
                    <tr key={w.ticker} className={idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                      <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-slate-900">{w.ticker}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-slate-600">
                        {m.beta.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-slate-600">
                        {(capmExpected * 100).toFixed(2)}%
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-slate-600">
                        {(m.annualReturn * 100).toFixed(2)}%
                      </td>
                      <td className={`px-4 py-2 whitespace-nowrap text-xs text-right font-mono font-bold ${m.alphaJensen >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {(m.alphaJensen * 100).toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECCIÓN 6: MATRIZ DE CORRELACIÓN */}
        {optimizer && correlationMatrix && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
              <Table className="h-5 w-5 text-indigo-500" />
              Matriz de Correlación Cruzada (Selección Actual)
            </h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-800">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-[10px] font-medium text-slate-300 uppercase tracking-wider border-r border-slate-700">Ticker</th>
                    {filteredAssetsDb.map((a) => (
                      <th key={a.ticker} scope="col" className="px-4 py-3 text-center text-[10px] font-medium text-white uppercase tracking-wider border-r border-slate-700 last:border-0">{a.ticker}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {(() => {
                    return filteredAssetsDb.map((a, i) => (
                      <tr key={a.ticker} className="bg-white">
                        <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-slate-900 border-r border-slate-200">{a.ticker}</td>
                        {filteredAssetsDb.map((_, j) => {
                          const corrVal = correlationMatrix[i][j];
                          const isDiagonal = i === j;
                          const intensity = isDiagonal ? 1 : Math.abs(corrVal);
                          
                          const bgColor = corrVal >= 0 
                            ? `rgba(16, 185, 129, ${intensity * 0.7})` 
                            : `rgba(244, 63, 94, ${intensity * 0.7})`;
                            
                          const isDarkBg = intensity > 0.6;
                          const textColor = isDarkBg ? 'text-white font-bold' : (i === j ? 'text-slate-800 font-bold' : 'text-slate-600');

                          return (
                            <td 
                              key={j} 
                              className={`px-4 py-2 whitespace-nowrap text-xs text-center font-mono border-r border-slate-100 last:border-0 ${textColor}`}
                              style={{ backgroundColor: bgColor }}
                            >
                              {corrVal.toFixed(4)}
                            </td>
                          );
                        })}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECCIÓN 6.5: PRONÓSTICO (PROYECCIÓN GBM) */}
        {recommendedPortfolio && (
          <div className="mt-8 pt-8 border-t border-slate-200">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
              <TrendingUp className="h-5 w-5 text-indigo-500" />
              Pronóstico del Portafolio a 3 Meses
            </h3>
            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              {forecastResults 
                ? "Proyección del crecimiento esperado de capital basado en la simulación estocástica del modelo econométrico (ARIMA/GARCH) seleccionado en el módulo anterior."
                : "Proyección del crecimiento esperado de capital asumiendo reinversión continua, basado en el retorno y volatilidad del portafolio recomendado, utilizando la distribución teórica del Movimiento Browniano Geométrico (GBM)."
              }
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-800">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-[10px] font-medium text-white uppercase tracking-wider">Horizonte</th>
                    <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Escenario Pesimista (Cola 5%)</th>
                    <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Escenario Esperado (Mediana)</th>
                    <th scope="col" className="px-4 py-3 text-right text-[10px] font-medium text-white uppercase tracking-wider">Escenario Optimista (Cola 95%)</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {forecastResults ? (
                    forecastResults.periods.map((p: any, idx: number) => (
                      <tr key={p.period} className={idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                        <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-slate-900">{p.period}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-rose-600">
                          {p.ciLower.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-slate-600 font-bold">
                          {p.actualReturn.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-emerald-600">
                          {p.ciUpper.toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  ) : (
                    [1, 2, 3].map((month, idx) => {
                      const time = month / 12; // Fraction of a year
                      const mu = recommendedPortfolio.return;
                      const sigma = recommendedPortfolio.risk;
                      const drift = (mu - 0.5 * sigma * sigma) * time;
                      const diffusion = sigma * Math.sqrt(time);
                      
                      const z5 = -1.645;
                      const z50 = 0;
                      const z95 = 1.645;
                      
                      const p5 = Math.exp(drift + z5 * diffusion) - 1;
                      const p50 = Math.exp(drift + z50 * diffusion) - 1;
                      const p95 = Math.exp(drift + z95 * diffusion) - 1;
                      
                      return (
                        <tr key={month} className={idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                          <td className="px-4 py-2 whitespace-nowrap text-xs font-bold text-slate-900">Mes {month}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-rose-600">
                            {(p5 * 100).toFixed(2)}%
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-slate-600 font-bold">
                            {(p50 * 100).toFixed(2)}%
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-xs text-right font-mono text-emerald-600">
                            {(p95 * 100).toFixed(2)}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SECCIÓN 7: CONCLUSIONES */}
        <div className="mt-8 pt-8 border-t border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-2 mb-4">
            <FileText className="h-5 w-5 text-indigo-500" />
            Conclusiones y Estrategia Recomendada
          </h3>
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <h4 className="text-sm font-bold text-slate-900 mb-3">Síntesis del Análisis Multimódulo:</h4>
            <p className="text-sm text-slate-600 leading-relaxed text-justify">
              El portafolio recomendado favorece activos con Alfas de Jensen positivos y ratios de Sharpe superiores, indicando una generación de valor consistente por encima de la tasa libre de riesgo de <strong>{(rfAnnual * 100).toFixed(2)}%</strong>. 
              En términos de riesgo extremo, se priorizan instrumentos que presentan un CVaR controlado, protegiendo el capital frente a volatilidades asimétricas (caídas). 
              La asignación busca beneficiarse de la diversificación para reducir el impacto del Max Drawdown, optimizando así la frontera eficiente del inversor de perfil <strong>{riskProfileName.toLowerCase()}</strong>.
            </p>
          </div>
        </div>
        
        {/* FOOTER DEL PDF */}
        <div className="mt-12 pt-4 border-t border-slate-200 text-center">
          <p className="text-[10px] text-slate-400">
            Este reporte es generado de manera automática para fines académicos y no constituye asesoría financiera profesional.
            Los rendimientos pasados no garantizan resultados futuros.
          </p>
        </div>
      </div>
    </div>
  );
}
