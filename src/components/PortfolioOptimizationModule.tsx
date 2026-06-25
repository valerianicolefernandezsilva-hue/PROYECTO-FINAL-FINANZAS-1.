/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, BarChart, Bar, Cell, LabelList, Label
} from 'recharts';
import { Layers, Sliders, CheckSquare, Square, RefreshCw, BarChart2, TrendingUp, Sparkles, Check, Info } from 'lucide-react';
import { ASSETS_DATABASE, DATES, AssetData } from '../data/refinitiv_data';
import { calculateReturns, MarkowitzOptimizer, PortfolioInstance } from '../lib/finance_math';

interface PortfolioOptimizationModuleProps {
  rfAnnual: number;
  assetsDb?: AssetData[];
  dates?: string[];
  periodsPerYear?: number;
  riskCoefficient?: number;
  riskScore?: number | null;
  portfolioTabSuggestion?: 'mvp' | 'tangent' | 'custom' | null;
  onOptimalPortfolioChange?: (portfolio: PortfolioInstance | null) => void;
  savedOptimalPortfolio?: PortfolioInstance | null;
  onNavigateToTab?: (tab: 'capm') => void;
  selectedAssetTickers?: string[];
  onSelectedAssetTickersChange?: (tickers: string[]) => void;
  onOptimizationResultsChange?: (results: any) => void;
}

export default function PortfolioOptimizationModule({ 
  rfAnnual, 
  assetsDb = ASSETS_DATABASE,
  dates = DATES,
  periodsPerYear = 12,
  riskCoefficient = 5.0,
  riskScore = null,
  portfolioTabSuggestion = null,
  onOptimalPortfolioChange,
  savedOptimalPortfolio,
  onNavigateToTab,
  selectedAssetTickers = [],
  onSelectedAssetTickersChange,
  onOptimizationResultsChange
}: PortfolioOptimizationModuleProps) {
  const dbAssets = assetsDb;

  // Activos seleccionados específicamente para optimizar
  const [activeTickers, setActiveTickers] = useState<string[]>(selectedAssetTickers.length > 0 ? selectedAssetTickers : []);

  useEffect(() => {
    if (onSelectedAssetTickersChange) {
      onSelectedAssetTickersChange(activeTickers);
    }
  }, [activeTickers, onSelectedAssetTickersChange]);

  const [optimizerSearch, setOptimizerSearch] = useState('');
  const [simSize, setSimSize] = useState<number>(4500);
  const [activeTab, setActiveTab] = useState<'mvp' | 'tangent' | 'custom'>('tangent');
  const [isComputing, setIsComputing] = useState(false);

  const [customWeights, setCustomWeights] = useState<{ [ticker: string]: number }>({});
  const [histogramGroup, setHistogramGroup] = useState<'individual' | 'type' | 'sector'>('individual');
  
  // Toggles para visibilidad en el gráfico
  const [showEF, setShowEF] = useState(true);
  const [showIndifference, setShowIndifference] = useState(true);
  const [showMVP, setShowMVP] = useState(true);
  const [showTangent, setShowTangent] = useState(true);
  
  // Initialize custom weights when tickers change
  useEffect(() => {
    if (activeTickers.length > 0) {
      const eqWeight = Number((100 / activeTickers.length).toFixed(1));
      const initW: { [t: string]: number } = {};
      let sum = 0;
      activeTickers.forEach((t, i) => {
        if (i === activeTickers.length - 1) {
          initW[t] = Number((100 - sum).toFixed(1));
        } else {
          initW[t] = eqWeight;
          sum += eqWeight;
        }
      });
      setCustomWeights(initW);
    }
  }, [activeTickers]);

  // Sincronizar tickers seleccionados por defecto cuando cambia la base de datos
  useEffect(() => {
    if (dbAssets.length > 0) {
      // Tomar hasta 8 activos iniciales disponibles para el optimizador
      setActiveTickers(dbAssets.slice(0, Math.min(8, dbAssets.length)).map(a => a.ticker));
    }
  }, [dbAssets]);

  // Sincronizar automáticamente la pestaña de composición recomendada por el diagnóstico
  useEffect(() => {
    if (portfolioTabSuggestion) {
      setActiveTab(portfolioTabSuggestion);
    }
  }, [portfolioTabSuggestion]);

  // Recalcular optimizador al cambiar activos, simSize, o Rf
  const optimizationResults = useMemo(() => {
    if (activeTickers.length < 2) return null;
    
    // Matriz de retornos para los seleccionados
    const returnsMatrix: number[][] = [];
    activeTickers.forEach(ticker => {
      const asset = dbAssets.find(a => a.ticker === ticker);
      if (asset) {
        returnsMatrix.push(calculateReturns(asset.prices));
      }
    });

    const optimizer = new MarkowitzOptimizer(activeTickers, returnsMatrix, periodsPerYear);
    const result = optimizer.runMonteCarlo(simSize, rfAnnual);

    // Calcular Matriz de Correlación
    const size = activeTickers.length;
    const correlationMatrix: number[][] = Array(size).fill(0).map(() => Array(size).fill(0));
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
        correlationMatrix[i][j] = denI === 0 || denJ === 0 ? 0 : num / Math.sqrt(denI * denJ);
      }
    }

    // Puntos de la CML (Línea del Mercado de Capitales)
    // Pasa por (0, Rf) y por el portafolio tangente (tp.risk, tp.return)
    // E(Rp) = Rf + Sharpe * risk
    const tp = result.maxSharpePortfolio;
    const cmlPoints: { risk: number; return: number }[] = [];
    const maxRiskLimit = Math.max(...result.portfolios.map(p => p.risk)) * 1.25;
    
    for (let riskStep = 0; riskStep <= maxRiskLimit; riskStep += maxRiskLimit / 15) {
      cmlPoints.push({
        risk: Number((riskStep * 100).toFixed(2)),
        return: Number(((rfAnnual + tp.sharpe * riskStep) * 100).toFixed(2))
      });
    }

    // Frontera Eficiente Aproximada (Límite superior de Simulación)
    const mvpRisk = result.minVarPortfolio.risk;
    const candidates = result.portfolios
      .filter(p => p.risk >= mvpRisk)
      .sort((a,b) => a.risk - b.risk);
    
    const efPoints: {risk: number, return: number}[] = [];
    let maxReturnSeen = -Infinity;
    
    const bins = 40;
    const maxCandidateRisk = Math.max(...candidates.map(p => p.risk), mvpRisk + 0.01);
    const step = (maxCandidateRisk - mvpRisk) / bins;
    
    for (let i = 0; i <= bins; i++) {
        const binStart = mvpRisk + i * step;
        const binEnd = mvpRisk + (i + 1) * step;
        const inBin = candidates.filter(p => p.risk >= binStart && p.risk < binEnd);
        if (inBin.length > 0) {
            const bestInBin = inBin.reduce((prev, current) => (prev.return > current.return) ? prev : current);
            if (bestInBin.return >= maxReturnSeen) {
                efPoints.push({
                    risk: Number((bestInBin.risk * 100).toFixed(2)),
                    return: Number((bestInBin.return * 100).toFixed(2))
                });
                maxReturnSeen = bestInBin.return;
            }
        }
    }

    // Smooth EF slightly
    const smoothedEf = efPoints.filter((pt, index, arr) => {
        if (index === 0 || index === arr.length - 1) return true;
        return pt.return > arr[index-1].return;
    });

    return {
      optimizer,
      mcResult: result,
      correlationMatrix,
      cmlPoints,
      efPoints: smoothedEf
    };
  }, [activeTickers, simSize, rfAnnual, periodsPerYear]);

  useEffect(() => {
    if (onOptimizationResultsChange && optimizationResults) {
      onOptimizationResultsChange(optimizationResults);
    }
  }, [optimizationResults, onOptimizationResultsChange]);

  const customPortfolioMetrics = useMemo(() => {
    if (!optimizationResults || activeTickers.length === 0) return null;
    const weightsArr = activeTickers.map(t => (customWeights[t] || 0) / 100);
    const sumW = weightsArr.reduce((a, b) => a + b, 0);
    const normWeights = sumW > 0 ? weightsArr.map(w => w / sumW) : weightsArr;

    return optimizationResults.optimizer.evaluatePortfolio(normWeights, rfAnnual);
  }, [optimizationResults, activeTickers, customWeights, rfAnnual]);

  // 2. Cálculo Paramétrico de la Curva de Indiferencia (Perfil Cliente A dinámico)
  const userIndifferenceCurve = useMemo(() => {
    if (!optimizationResults) return [];

    // Paso A: Evaluar Portafolio Óptimo en la fórmula U_optima = RetornoTangente - 0.5 * A * (VolatilidadTangente ^ 2)
    const tp = optimizationResults.mcResult.maxSharpePortfolio;
    const mvp = optimizationResults.mcResult.minVarPortfolio;

    let targetReturnDec = tp.return;
    let targetRiskDec = tp.risk;

    if (activeTab === 'mvp') {
      targetReturnDec = mvp.return;
      targetRiskDec = mvp.risk;
    } else if (activeTab === 'custom' && customPortfolioMetrics) {
      targetReturnDec = customPortfolioMetrics.return;
      targetRiskDec = customPortfolioMetrics.risk;
    }

    const uOptima = targetReturnDec - 0.5 * riskCoefficient * Math.pow(targetRiskDec, 2);
    
    // Paso B: Generar puntos para que la curva inicie en 0 y se extienda hasta un poco después del activo más riesgoso
    const minVol = 0;
    const maxAssetRisk = Math.max(...optimizationResults.mcResult.portfolios.map(p => p.risk));
    const maxVol = maxAssetRisk * 1.25; // Misma longitud visual que la CML
    
    const pointsCount = 60;
    const step = (maxVol - minVol) / (pointsCount - 1);
    const points: { risk: number; return: number; type: string }[] = [];

    for (let i = 0; i < pointsCount; i++) {
      const volDec = minVol + i * step;
      // Despejando para eje Y: Retorno = U_optima + 0.5 * A * (Volatilidad ^ 2)
      const retDec = uOptima + 0.5 * riskCoefficient * Math.pow(volDec, 2);

      if (retDec >= -0.05 && retDec <= 1.50) {
        points.push({
          risk: Number((volDec * 100).toFixed(2)),
          return: Number((retDec * 100).toFixed(2)),
          type: 'indifference'
        });
      }
    }

    return points;
  }, [optimizationResults, activeTab, customPortfolioMetrics, riskCoefficient]);

  const toggleTicker = (ticker: string) => {
    if (activeTickers.includes(ticker)) {
      if (activeTickers.length > 2) {
        setActiveTickers(activeTickers.filter(t => t !== ticker));
      }
    } else {
      setActiveTickers([...activeTickers, ticker]);
    }
  };

  const selectAllAssetClass = (type: string) => {
    const classTickers = dbAssets.filter(a => a.type === type).map(a => a.ticker);
    const added = Array.from(new Set([...activeTickers, ...classTickers]));
    setActiveTickers(added);
  };

  const selectAll = () => {
    setActiveTickers(dbAssets.map(a => a.ticker));
  };

  const deselectAll = () => {
    if (dbAssets.length >= 2) {
      setActiveTickers([dbAssets[0].ticker, dbAssets[1].ticker]);
    } else if (dbAssets.length > 0) {
      setActiveTickers([dbAssets[0].ticker]);
    }
  };

  // Convertir puntos de simulación en datos gráficos listos para Recharts
  const pScatterDataset = useMemo(() => {
    if (!optimizationResults) return { mcPoints: [], assetPoints: [] };
    
    // 1. Portafolios de Monte Carlo
    const portfoliosSorted = [...optimizationResults.mcResult.portfolios].sort((a,b) => a.sharpe - b.sharpe);
    const minSharpe = portfoliosSorted[0]?.sharpe || 0;
    const maxSharpe = portfoliosSorted[portfoliosSorted.length - 1]?.sharpe || 1;
    const rangeSharpe = maxSharpe - minSharpe || 1;

    const mcPoints = optimizationResults.mcResult.portfolios.map((p, idx) => ({
      risk: Number((p.risk * 100).toFixed(2)),
      return: Number((p.return * 100).toFixed(2)),
      sharpe: p.sharpe,
      // Normalizar sharpe para coloración de 0 a 100
      colorFactor: Math.min(100, Math.max(0, ((p.sharpe - minSharpe) / rangeSharpe) * 100)),
      type: 'simulated'
    }));

    // 2. Activos individuales
    const assetPoints = activeTickers.map(ticker => {
      const idx = optimizationResults.optimizer.tickers.indexOf(ticker);
      const ret = optimizationResults.optimizer.expectedReturns[idx];
      const monthlyRets = optimizationResults.optimizer.returnsMatrix[idx];
      
      // Calculate individual variance and risk
      let varMonthly = 0;
      const m = monthlyRets.reduce((a,b)=>a+b,0)/monthlyRets.length;
      monthlyRets.forEach(r => {
        varMonthly += Math.pow(r - m, 2);
      });
      varMonthly /= (monthlyRets.length - 1);
      const risk = Math.sqrt(varMonthly * periodsPerYear);

      return {
        ticker,
        risk: Number((risk * 100).toFixed(2)),
        return: Number((ret * 100).toFixed(2)),
        type: 'asset'
      };
    });

    return { mcPoints, assetPoints };
  }, [optimizationResults, activeTickers]);

  // Pesos para el portafolio activo seleccionado
  const currentPortfolioWeights = useMemo(() => {
    if (!optimizationResults) return [];

    if (activeTab === 'custom') {
      return activeTickers.map((ticker, idx) => ({
        ticker,
        name: dbAssets.find(a => a.ticker === ticker)?.name || ticker,
        weight: Number(customWeights[ticker] || 0),
        color: getChartBarColor(idx)
      })).sort((a,b) => b.weight - a.weight);
    }

    const p = activeTab === 'mvp' 
      ? optimizationResults.mcResult.minVarPortfolio 
      : optimizationResults.mcResult.maxSharpePortfolio;

    return activeTickers.map((ticker, idx) => ({
      ticker,
      name: dbAssets.find(a => a.ticker === ticker)?.name || ticker,
      weight: Number((p.weights[idx] * 100).toFixed(2)),
      color: getChartBarColor(idx)
    })).sort((a,b) => b.weight - a.weight);
  }, [optimizationResults, activeTab, activeTickers, dbAssets, customWeights]);

  // Exportar el portafolio óptimo activo
  useEffect(() => {
    if (onOptimalPortfolioChange && optimizationResults && activeTickers.length > 1) {
      if (activeTab === 'custom') {
        const weights = activeTickers.map(t => Number(customWeights[t] || 0) / 100);
        const p: PortfolioInstance = {
          weights,
          return: customPortfolioMetrics?.return || 0,
          risk: customPortfolioMetrics?.risk || 0,
          sharpe: customPortfolioMetrics?.sharpe || 0
        };
        onOptimalPortfolioChange(p);
      } else {
        const p = activeTab === 'mvp' 
          ? optimizationResults.mcResult.minVarPortfolio 
          : optimizationResults.mcResult.maxSharpePortfolio;
        onOptimalPortfolioChange(p);
      }
    }
  }, [optimizationResults, activeTab, activeTickers, customWeights, customPortfolioMetrics, onOptimalPortfolioChange]);

  // Agrupar pesos para los histogramas alternativos (empresa, tipo de activo, sector)
  const groupedHistogramData = useMemo(() => {
    if (histogramGroup === 'individual') {
      return currentPortfolioWeights;
    }
    
    const Map: { [key: string]: { ticker: string, name: string, weight: number, color: string } } = {};
    
    currentPortfolioWeights.forEach((w) => {
      const asset = dbAssets.find(a => a.ticker === w.ticker);
      const key = histogramGroup === 'type' 
        ? (asset?.type || 'Otros') 
        : (asset?.sector || 'Otros');
        
      if (!Map[key]) {
        Map[key] = {
          ticker: key,
          name: key,
          weight: 0,
          color: w.color
        };
      }
      Map[key].weight += w.weight;
    });
    
    return Object.values(Map)
      .map(item => ({ ...item, weight: Number(item.weight.toFixed(2)) }))
      .sort((a, b) => b.weight - a.weight);
  }, [currentPortfolioWeights, histogramGroup, dbAssets]);

  // Generador de color para pesos
  function getChartBarColor(index: number) {
    const colors = [
      '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd',
      '#10b981', '#34d399', '#6ee7b7', '#a7f3d0',
      '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe',
      '#f59e0b', '#fbbf24', '#fcd34d', '#fef3c7'
    ];
    return colors[index % colors.length];
  }

  // Estilo de color de celda de correlación
  const getCorrelationColor = (val: number) => {
    if (val > 0) {
      // De azul claro a azul oscuro fuerte (0 a 1)
      const pct = Math.round(val * 100);
      return `rgba(37, 99, 235, ${val * 0.95})`; // Base blue-600
    } else {
      // De rojo claro a rojo oscuro fuerte (-1 a 0)
      const absVal = Math.abs(val);
      return `rgba(225, 29, 72, ${absVal * 0.95})`; // Base rose-600
    }
  };

  const filteredSearchAssets = useMemo(() => {
    return dbAssets.filter(asset => 
      asset.ticker.toLowerCase().includes(optimizerSearch.toLowerCase()) || 
      asset.name.toLowerCase().includes(optimizerSearch.toLowerCase())
    );
  }, [optimizerSearch, dbAssets]);

  return (
    <div className="space-y-8" id="portfolio-optimization-module">
      
      {/* Explicación Teórica */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Layers className="text-indigo-600 h-6 w-6" />
          Módulo 2: Optimización de Portafolios según la Teoría de Harry Markowitz
        </h2>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          La <strong>Teoría Moderna de Portafolios (MPT)</strong> de Harry Markowitz demuestra que un inversor puede construir carteras de activos diversificadas que maximicen el retorno esperado para un nivel dado de riesgo, mediante la explotación de coeficientes de correlación no perfectos (<span className="font-mono">r &lt; 1</span>). Al cambiar la selección de activos abajo, el motor de optimización recalculará todos los pesos en microsegundos y renderizará la nube de portafolios factibles con su respectiva frontera del mercado.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        
        {/* Panel de Configuración y Selección de Activos para la optimización */}
        <div className="xl:col-span-1 bg-white rounded-xl shadow-xs border border-gray-100 p-5 flex flex-col h-[700px] justify-between">
          <div>
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest mb-3 flex items-center gap-1">
              <Sliders className="h-4 w-4 text-indigo-600" /> Configuración de Activos
            </h3>
            
            {/* Accesos rápidos de clases */}
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              <button onClick={() => selectAllAssetClass('Acción')} className="flex-1 text-[10px] bg-indigo-50 text-indigo-700 font-semibold p-1.5 rounded-md hover:bg-indigo-100 transition-all text-center">
                + Acciones
              </button>
              <button onClick={() => selectAllAssetClass('Bono')} className="flex-1 text-[10px] bg-amber-50 text-amber-700 font-semibold p-1.5 rounded-md hover:bg-amber-100 transition-all text-center">
                + Bonos R.F.
              </button>
              <button onClick={() => selectAllAssetClass('ETF')} className="flex-1 text-[10px] bg-emerald-50 text-emerald-700 font-semibold p-1.5 rounded-md hover:bg-emerald-100 transition-all text-center">
                + ETFs
              </button>
            </div>
            <div className="flex gap-1.5 mb-3.5">
              <button onClick={selectAll} className="flex-1 text-[10px] bg-slate-100 text-slate-700 font-semibold p-1.5 rounded-md hover:bg-slate-200 transition-all text-center">
                Seleccionar todo
              </button>
              <button onClick={deselectAll} className="flex-1 text-[10px] bg-slate-100 text-slate-700 font-semibold p-1.5 rounded-md hover:bg-slate-200 transition-all text-center">
                Limpiar
              </button>
            </div>

            <div className="relative mb-3">
              <input 
                type="text" 
                placeholder="Filtro de activos..." 
                value={optimizerSearch}
                onChange={(e) => setOptimizerSearch(e.target.value)}
                className="w-full bg-slate-50 border border-gray-200 rounded-lg pl-3 pr-3 py-1.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              />
            </div>

            {/* Listado interactivo con Checkboxes */}
            <div className="overflow-y-auto space-y-1 h-[320px] pr-1 scrollbar-thin">
              {filteredSearchAssets.map((asset) => {
                const checked = activeTickers.includes(asset.ticker);
                return (
                  <button
                    key={asset.ticker}
                    onClick={() => toggleTicker(asset.ticker)}
                    className={`w-full text-left p-1.5 rounded-md text-xs flex items-center gap-2 border transition-all ${
                      checked 
                        ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900 font-medium' 
                        : 'bg-transparent border-transparent text-gray-600 hover:bg-slate-50'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare className="h-4 w-4 text-indigo-600 shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-gray-300 shrink-0" />
                    )}
                    <div className="truncate text-left leading-tight w-full flex justify-between items-center pr-2">
                      <div>
                        <span className="font-mono font-semibold block">{asset.ticker}</span>
                        <span className="text-[9px] text-gray-400 truncate block max-w-[120px]">{asset.name}</span>
                      </div>
                      <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                        asset.type === 'Acción' ? 'bg-indigo-100 text-indigo-700' :
                        asset.type === 'Bono' ? 'bg-amber-100 text-amber-700' :
                        asset.type === 'ETF' ? 'bg-emerald-100 text-emerald-700' :
                        (asset.type === 'Oro' || asset.type === 'Commodity' || asset.type === 'Materia Prima') ? 'bg-yellow-100 text-yellow-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {asset.type}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Panel de métricas de activos activos (Slider Monte Carlo de simSize oculto de la UI por requerimiento) */}
          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-100 flex justify-between items-center">
            <span className="text-[11px] text-gray-500 font-medium">
              Activos seleccionados para el portafolio:
            </span>
            <strong className="text-indigo-700 bg-indigo-100/50 px-2 py-0.5 rounded-md font-mono text-xs">
              {activeTickers.length}
            </strong>
          </div>
        </div>

        {/* Nube del Portafolio y Frontera Eficiente Markowitz / CML */}
        <div className="xl:col-span-3 space-y-6">
          <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Frontera de Eficiencia de Markowitz y CML</h3>
                <p className="text-xs text-gray-500">Espacio de riesgo-rendimiento con Capital Market Line (CML)</p>
              </div>

              {/* Leyenda Interactiva de Portafolios Encontrados */}
              <div className="flex flex-wrap gap-2.5">
                <button 
                  onClick={() => setShowEF(!showEF)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs leading-none flex items-center gap-1.5 font-medium border transition-colors ${showEF ? 'bg-emerald-100 text-emerald-900 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                >
                  <span className={`w-4 h-[2px] inline-block ${showEF ? 'bg-emerald-600' : 'bg-gray-400'}`} />
                  Frontera Eficiente
                </button>
                <button 
                  onClick={() => setShowIndifference(!showIndifference)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs leading-none flex items-center gap-1.5 font-medium border transition-colors ${showIndifference ? 'bg-orange-100 text-orange-900 border-orange-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                >
                  <span className={`w-4 h-[2px] border-t-2 border-dashed inline-block ${showIndifference ? 'border-orange-500' : 'border-gray-400'}`} />
                  Curva Indiferencia (A = {riskCoefficient.toFixed(1)})
                </button>
                <button 
                  onClick={() => setShowMVP(!showMVP)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs leading-none flex items-center gap-1.5 font-medium border transition-colors ${showMVP ? 'bg-blue-100 text-blue-900 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full inline-block ${showMVP ? 'bg-blue-600' : 'bg-gray-400'}`} />
                  MVP: Riesgo Mínimo
                </button>
                <button 
                  onClick={() => setShowTangent(!showTangent)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs leading-none flex items-center gap-1.5 font-medium border transition-colors ${showTangent ? 'bg-indigo-100 text-indigo-900 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full inline-block ${showTangent ? 'bg-red-600' : 'bg-gray-400'}`} />
                  Tangente: Sharpe Máx (CML)
                </button>
              </div>
            </div>

            {/* Scatter Chart del Espacio de Frontera Markowitz */}
            {optimizationResults ? (
              <div className="h-[380px] w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 30, left: 25, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis 
                      type="number" 
                      dataKey="risk" 
                      name="Riesgo" 
                      unit="%" 
                      domain={[0, 'auto']}
                      tick={{ fontSize: 10 }}
                      label={{ value: 'Riesgo Anualizado (Volatilidad %)', position: 'insideBottom', offset: -5, fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="return" 
                      name="Retorno" 
                      unit="%" 
                      tick={{ fontSize: 10 }}
                    >
                      <Label 
                        value="Rendimiento Anualizado (%)" 
                        angle={-90} 
                        position="left" 
                        style={{ textAnchor: 'middle', fill: '#64748b', fontSize: 11 }} 
                      />
                    </YAxis>
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }} 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          if (data.type === 'asset') {
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border-none">
                                <p className="font-bold text-blue-400">Activo: {data.ticker}</p>
                                <hr className="my-1 border-slate-700" />
                                <p>Rendimiento Esperado: <span className="font-bold">{data.return}%</span></p>
                                <p>Volatilidad Individual: <span className="font-bold">{data.risk}%</span></p>
                              </div>
                            );
                          }
                          if (data.type === 'indifference') {
                            return (
                              <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border border-orange-500/40">
                                <p className="font-bold text-orange-400">Curva de Indiferencia (Perfil Cliente)</p>
                                <hr className="my-1 border-slate-700" />
                                <p>Retorno Requerido: <span className="font-bold text-orange-300">{data.return}%</span></p>
                                <p>Volatilidad (Riesgo): <span className="font-bold text-slate-300">{data.risk}%</span></p>
                                <p>Aversión Teórica A: <span className="font-bold text-amber-300">{riskCoefficient.toFixed(1)}</span></p>
                              </div>
                            );
                          }
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-lg text-xs shadow-md border-none">
                              <p className="font-bold text-indigo-400">Portafolio Simulado</p>
                              <hr className="my-1 border-slate-700" />
                              <p>Retorno Portafolio: <span className="font-bold text-emerald-400">{data.return}%</span></p>
                              <p>Riesgo Portafolio: <span className="font-bold text-orange-400">{data.risk}%</span></p>
                              <p> Sharpe Ratio: <span className="font-bold text-cyan-400">{data.sharpe ? data.sharpe.toFixed(3) : ''}</span></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />

                    {/* 1. Nube de Portafolios de Monte Carlo (OCULTA POR REQUERIMIENTO) */}
                    {/* El data de la simulación sigue calculado para mantener estadísticas pero no se dibuja */}

                    {/* 2. Activos Individuales */}
                    <Scatter name="Activos Base" data={pScatterDataset.assetPoints} fill="#4f46e5">
                      <LabelList dataKey="ticker" position="top" style={{ fontSize: 9, fill: '#1e293b', fontWeight: 'bold' }} />
                    </Scatter>

                    {/* 3. Línea del Mercado de Capitales (CML) */}
                    <Scatter name="Línea CML (Capital Market Line)" data={showTangent ? optimizationResults.cmlPoints : []} fill="#ef4444" line={{ stroke: '#ef4444', strokeWidth: 1.5, strokeDasharray: '4 4' }} opacity={0.8} r={0} />

                    {/* 4. Línea de Frontera Eficiente de Markowitz */}
                    <Scatter name="Frontera Eficiente" data={showEF ? optimizationResults.efPoints : []} fill="#10b981" line={{ stroke: '#10b981', strokeWidth: 2.5 }} opacity={1} r={0} />

                    {/* 4.5. Curva de Indiferencia (Perfil Cliente) */}
                    <Scatter name="Curva de Indiferencia (Perfil Cliente)" data={showIndifference ? userIndifferenceCurve : []} fill="#f97316" line={{ stroke: '#f97316', strokeWidth: 2.5, strokeDasharray: '6 6' }} opacity={0.95} r={0} />

                    {/* 5. Portafolios Óptimos de Referencia (Se muestran SIEMPRE para evitar que "desaparezcan" y dar total protagonismo y claridad) */}
                    {showMVP && (
                      <Scatter 
                        name="Portafolio MVP" 
                        data={[{
                          risk: Number((optimizationResults.mcResult.minVarPortfolio.risk * 100).toFixed(2)),
                          return: Number((optimizationResults.mcResult.minVarPortfolio.return * 100).toFixed(2)),
                          sharpe: optimizationResults.mcResult.minVarPortfolio.sharpe,
                          type: 'mvp'
                        }]} 
                        fill="#2563eb" 
                        r={activeTab === 'mvp' ? 10.5 : 6.5} 
                        stroke="#fff" 
                        strokeWidth={activeTab === 'mvp' ? 2.5 : 1.2} 
                      />
                    )}

                    {showTangent && (
                      <Scatter 
                        name="Portafolio Tangencial" 
                        data={[{
                          risk: Number((optimizationResults.mcResult.maxSharpePortfolio.risk * 100).toFixed(2)),
                          return: Number((optimizationResults.mcResult.maxSharpePortfolio.return * 100).toFixed(2)),
                          sharpe: optimizationResults.mcResult.maxSharpePortfolio.sharpe,
                          type: 'tangent'
                        }]} 
                        fill="#e11d48" 
                        r={activeTab === 'tangent' ? 10.5 : 6.5} 
                        stroke="#fff" 
                        strokeWidth={activeTab === 'tangent' ? 2.5 : 1.2} 
                      />
                    )}

                    {/* 6. MARCADOR: Portafolio Personalizado (Punto Morado) */}
                    {customPortfolioMetrics && activeTab === 'custom' && (
                      <Scatter 
                        name="Portafolio Personalizado" 
                        data={[{
                          risk: Number((customPortfolioMetrics.risk * 100).toFixed(2)),
                          return: Number((customPortfolioMetrics.return * 100).toFixed(2)),
                          sharpe: customPortfolioMetrics.sharpe,
                          type: 'custom'
                        }]} 
                        fill="#8b5cf6" 
                        r={11} 
                        stroke="#fff" 
                        strokeWidth={2.5} 
                      />
                    )}



                  </ScatterChart>
                </ResponsiveContainer>
                
                {/* Tasa libre de riesgo flotante decorativa en eje Y */}
                <div className="absolute left-[54px] bottom-[28px] bg-red-50 text-red-700 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-red-100">
                  Rf: {(rfAnnual * 100).toFixed(2)}%
                </div>
              </div>
            ) : null}

            <div className="p-3.5 bg-indigo-50 rounded-lg border border-indigo-100 text-[11px] text-indigo-900 mt-2">
              💡 <strong>Interpretación de la Línea del Mercado de Capitales (CML):</strong> La línea discontinua representa la <strong>Capital Market Line (CML)</strong>. Esta traza la frontera óptima de inversión al combinar analíticamente la Tasa Libre de Riesgo (Rf) configurada con el <strong>Portafolio Tangente (Máximo Sharpe)</strong>. Cualquier combinación sobre la CML optimiza el rendimiento de la frontera eficiente estática al incorporar la posibilidad de apalancamiento o préstamo de capital a dicha tasa libre de riesgo.
            </div>

          </div>
        </div>

      </div>

      {/* Matriz de Correlación Interactiva y Asignación de Pesos Óptimos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Matriz de Correlación Heatmap */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-base mb-4">Matriz de Correlación Cruzada</h3>

            {optimizationResults ? (
              <div className="border border-gray-100 rounded-xl overflow-hidden p-3 bg-slate-50/50">
                <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${activeTickers.length + 1}, minmax(0, 1fr))` }}>
                  {/* Celda vacía esquina superior izquierda */}
                  <div className="text-[10px] font-bold text-slate-400 flex items-center justify-center h-8 bg-white rounded-sm font-mono">–</div>
                  
                  {/* Cabecera superior activos */}
                  {activeTickers.map(t => (
                    <div key={`col-${t}`} className="text-[10px] font-bold text-slate-700 bg-white flex items-center justify-center p-1 h-8 rounded-sm font-mono truncate">
                      {t}
                    </div>
                  ))}

                  {/* Filas */}
                  {activeTickers.map((tickerI, idxI) => (
                    <React.Fragment key={`row-${tickerI}`}>
                      {/* Cabecera izquierda activo */}
                      <div className="text-[10px] font-bold text-slate-700 bg-white flex items-center justify-start px-2 h-8 rounded-sm font-mono truncate">
                        {tickerI}
                      </div>

                      {/* Celdas de correlación de la fila */}
                      {activeTickers.map((tickerJ, idxJ) => {
                        const val = optimizationResults.correlationMatrix[idxI][idxJ];
                        const isDiagonal = idxI === idxJ;
                        return (
                          <div
                            key={`cell-${tickerI}-${tickerJ}`}
                            title={`Correlación ${tickerI} vs ${tickerJ}: ${val.toFixed(4)}`}
                            style={{ backgroundColor: getCorrelationColor(val) }}
                            className={`text-[9px] font-mono font-bold h-8 flex items-center justify-center rounded-sm transition-all hover:scale-105 cursor-pointer relative group ${
                              val > 0.4 ? 'text-white' : val < -0.4 ? 'text-white' : 'text-slate-800'
                            }`}
                          >
                            <span>{val.toFixed(2)}</span>
                            
                            {/* Tooltip flotante con detalles en celular/desktop */}
                            <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute z-50 bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] py-1 px-2 rounded-md shadow-lg truncate shrink-0 max-w-[140px] leading-tight">
                              {tickerI} ↔ {tickerJ}
                              <br/>
                              Coef: {val.toFixed(4)}
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500">
            <div className="flex gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 inline-block bg-blue-600 opacity-80 rounded-sm" /> Positiva (R &gt; 0)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 inline-block bg-rose-600 opacity-80 rounded-sm" /> Negativa (R &lt; 0)
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 inline-block bg-white border border-gray-200 rounded-sm" /> Neutra (R = 0)
              </span>
            </div>
            <p className="text-right text-[10px] text-gray-400">
              *La diagonal simétrica es siempre 1.00 por definición.
            </p>
          </div>
        </div>

        {/* Asignación de Pesos Óptimos */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Asignación Óptima de Capital</h3>
                <p className="text-xs text-gray-500">Pesos calculados por optimización formal de fronteras</p>
              </div>

              {/* Toggle de Selección de Portafolio Óptimo */}
              <div className="bg-slate-100 p-0.5 rounded-lg flex text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('tangent')}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    activeTab === 'tangent' 
                      ? 'bg-white text-indigo-950 shadow-xs' 
                      : 'text-gray-500 hover:text-indigo-900'
                  }`}
                >
                  Portafolio Tangente
                </button>
                <button
                  onClick={() => setActiveTab('mvp')}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    activeTab === 'mvp' 
                      ? 'bg-white text-indigo-950 shadow-xs' 
                      : 'text-gray-500 hover:text-indigo-900'
                  }`}
                >
                  Mínima Varianza
                </button>
                <button
                  onClick={() => setActiveTab('custom')}
                  className={`px-3 py-1.5 rounded-md transition-all ${
                    activeTab === 'custom' 
                      ? 'bg-white text-indigo-950 shadow-xs' 
                      : 'text-gray-500 hover:text-indigo-900'
                  }`}
                >
                  Personalizado
                </button>
              </div>
            </div>

            {optimizationResults ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                
                {/* Tabla de Pesos */}
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 p-2.5 border-b border-gray-200 flex justify-between text-[11px] font-bold text-slate-800">
                    <span>Activo</span>
                    <span>Asignación (%)</span>
                  </div>
                  <div className="divide-y divide-gray-100 max-h-[220px] overflow-y-auto scrollbar-thin">
                    {currentPortfolioWeights.map((w, index) => (
                      <div key={w.ticker} className="p-2 flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: w.color }} />
                          <span className="font-mono font-bold text-slate-900">{w.ticker}</span>
                          <span className="text-[10px] text-gray-400 truncate max-w-[90px]">{w.name}</span>
                        </div>
                        {activeTab === 'custom' ? (
                          <input 
                            type="number"
                            min="0"
                            max="100"
                            value={customWeights[w.ticker] ?? 0}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(100, Number(e.target.value)));
                              setCustomWeights(prev => ({ ...prev, [w.ticker]: val }));
                            }}
                            className="w-16 p-1 text-right font-mono text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                          />
                        ) : (
                          <span className="font-mono font-semibold text-slate-950">{w.weight}%</span>
                        )}
                      </div>
                    ))}
                    {/* Fila totalizadora */}
                    <div className="p-2.5 bg-slate-50/50 flex justify-between items-center text-xs font-bold border-t border-gray-100 text-slate-800">
                      <span>Total Asignado</span>
                      <span className={`font-mono ${activeTab === 'custom' && Math.abs(currentPortfolioWeights.reduce((sum, item) => sum + item.weight, 0) - 100) > 0.1 ? 'text-red-500' : ''}`}>
                        {currentPortfolioWeights.reduce((sum, item) => sum + item.weight, 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Gráfico de Barras Horizontal (Histograma Independizado con 3 vistas) */}
                <div className="flex flex-col gap-2.5 bg-slate-50/50 rounded-lg border border-slate-100 p-2.5">
                  {/* Selector de Agrupación de Histograma */}
                  <div className="flex justify-between items-center bg-slate-100 p-0.5 rounded-md text-xs font-semibold gap-1">
                    <button
                      type="button"
                      onClick={() => setHistogramGroup('individual')}
                      className={`flex-1 py-1 rounded transition-all text-[10px] ${
                        histogramGroup === 'individual'
                          ? 'bg-white text-indigo-950 shadow-xs'
                          : 'text-gray-500 hover:text-slate-800'
                      }`}
                    >
                      Empresa
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistogramGroup('type')}
                      className={`flex-1 py-1 rounded transition-all text-[10px] ${
                        histogramGroup === 'type'
                          ? 'bg-white text-indigo-950 shadow-xs'
                          : 'text-gray-500 hover:text-slate-800'
                      }`}
                    >
                      Tipo Activo
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistogramGroup('sector')}
                      className={`flex-1 py-1 rounded transition-all text-[10px] ${
                        histogramGroup === 'sector'
                          ? 'bg-white text-indigo-950 shadow-xs'
                          : 'text-gray-500 hover:text-slate-800'
                      }`}
                    >
                      Sector
                    </button>
                  </div>

                  <div className="h-[240px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={groupedHistogramData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                        <XAxis type="number" unit="%" tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" domain={[0, 100]} />
                        <YAxis dataKey="ticker" type="category" tick={{ fontSize: 9, fontFamily: 'monospace', fontWeight: 'bold', fill: '#334155' }} stroke="none" width={histogramGroup === 'individual' ? 65 : 105} />
                        <Tooltip 
                          cursor={{fill: '#f1f5f9'}}
                          contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Asignación']}
                        />
                        <Bar dataKey="weight" radius={[0, 4, 4, 0]} barSize={20}>
                          {groupedHistogramData.map((entry, index) => (
                            <Cell key={`cell-weight-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            ) : null}
          </div>

          {optimizationResults ? (
            <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-900">
               📈 <strong>Indicador Clave de Diversificación:</strong> El Portafolio <strong>{activeTab === 'tangent' ? 'Tangente (Máximo Sharpe)' : activeTab === 'mvp' ? 'de Mínima Varianza (MVP)' : 'Personalizado'}</strong> ofrece actualmente una rentabilidad esperada anual de <strong className="text-indigo-950">{(activeTab === 'tangent' ? optimizationResults.mcResult.maxSharpePortfolio.return * 100 : activeTab === 'mvp' ? optimizationResults.mcResult.minVarPortfolio.return * 100 : (customPortfolioMetrics?.return || 0) * 100).toFixed(2)}%</strong> y un riesgo (volatilidad) de <strong className="text-indigo-950">{(activeTab === 'tangent' ? optimizationResults.mcResult.maxSharpePortfolio.risk * 100 : activeTab === 'mvp' ? optimizationResults.mcResult.minVarPortfolio.risk * 100 : (customPortfolioMetrics?.risk || 0) * 100).toFixed(2)}%</strong>, resultando en un Sharpe Ratio de <strong className="text-indigo-950">{(activeTab === 'tangent' ? optimizationResults.mcResult.maxSharpePortfolio.sharpe : activeTab === 'mvp' ? optimizationResults.mcResult.minVarPortfolio.sharpe : (customPortfolioMetrics?.sharpe || 0)).toFixed(3)}</strong>.
            </div>
          ) : null}

          {riskScore !== null && (
            <div className={`mt-3 p-3.5 border rounded-lg text-[11px] leading-relaxed flex flex-col gap-1.5 ${
              riskScore <= 20 
                ? 'bg-blue-50 border-blue-200 text-blue-900' 
                : riskScore <= 31 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950' 
                  : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}>
              <div>
                <strong className="font-bold">Ajuste de Cartera por Diagnóstico Heurístico de Riesgo (Módulo 0):</strong>
                <span className="block mt-1 font-medium">
                  {riskScore <= 20 ? (
                    <span>Usted tiene un <strong>Perfil Conservador Estricto</strong> (Coeficiente de Aversión A = 9.0). Se ha preseleccionado y sugerido ver el <strong>Portafolio de Mínima Varianza (MVP)</strong>, el cual minimiza la desviación estándar agregada para proteger su capital de caídas sistemáticas.</span>
                  ) : riskScore <= 31 ? (
                    <span>Usted tiene un <strong>Perfil Moderado / Balanceado</strong> (Coeficiente de Aversión A = 5.0). El sistema ha dirigido la selección hacia el <strong>Portafolio Tangente de Máximo Sharpe</strong> en el espacio de Markowitz, maximizando su retorno excedente por unidad de riesgo asumido.</span>
                  ) : (
                    <span>Usted tiene un <strong>Perfil Dinámico / Agresivo</strong> (Coeficiente de Aversión A = 2.0). Se ha habilitado la extrapolación interactiva de la <strong>Capital Market Line (CML)</strong> sobre el gráfico Scatter. Su baja aversión teórica permite explorar carteras apalancadas situadas a la derecha del punto tangente.</span>
                  )}
                </span>
              </div>
            </div>
          )}

        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={() => {
              if (onNavigateToTab) {
                onNavigateToTab('capm');
              }
            }}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-200"
          >
            Guardar y Continuar (Módulo 3: CAPM)
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        </div>

      </div>

    </div>
  );
}
