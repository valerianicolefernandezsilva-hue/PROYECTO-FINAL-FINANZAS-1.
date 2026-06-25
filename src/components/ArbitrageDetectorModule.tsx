/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Percent, ArrowRight, ShieldCheck, Sparkles, HelpCircle, 
  RefreshCw, TrendingUp, AlertTriangle, Coins, Briefcase, Info, ListTodo
} from 'lucide-react';
import { AssetData, BenchmarkData } from '../data/refinitiv_data';
import { calculateReturns, covariance, standardDeviation, MarkowitzOptimizer, PortfolioInstance } from '../lib/finance_math';

interface ArbitrageDetectorProps {
  rfAnnual: number;
  assetsDb?: AssetData[];
  benchmarkDb?: BenchmarkData;
  periodsPerYear?: number;
  selectedAssetTickers?: string[];
  portfolioTabSuggestion?: 'mvp' | 'tangent' | 'custom' | null;
  riskCoefficient?: number;
  optimalPortfolio?: PortfolioInstance | null;
  onNavigateToTab?: (tab: 'forecast') => void;
}

export default function ArbitrageDetectorModule({ 
  rfAnnual,
  assetsDb,
  benchmarkDb,
  periodsPerYear = 12,
  selectedAssetTickers = [],
  portfolioTabSuggestion,
  riskCoefficient = 5,
  optimalPortfolio,
  onNavigateToTab
}: ArbitrageDetectorProps) {
  // --- MÓDULO DE 1 FACTOR ---
  const [rfOverride, setRfOverride] = useState<number>(rfAnnual);
  const [syncWithGlobal, setSyncWithGlobal] = useState<boolean>(true);

  // Sincronizar con el prop global si está habilitado
  const activeRf = syncWithGlobal ? rfAnnual : rfOverride;

  // Estados de Portafolios de 1 Factor
  const [portfolio1, setPortfolio1] = useState({ name: 'Mi Portafolio Recomendado', er: 0.14, beta: 1.2 });
  const [portfolio2, setPortfolio2] = useState({ name: 'Mercado (Benchmark)', er: 0.09, beta: 1.0 });
  const [arbitrageCapital, setArbitrageCapital] = useState<number>(100000);
  const [recommendedWeights, setRecommendedWeights] = useState<{ ticker: string; weight: number; name: string }[]>([]);

  // Efecto para inicializar el portafolio basado en las preferencias del usuario (Módulo 0, 0.5 y 1.5)
  React.useEffect(() => {
    if (!assetsDb || assetsDb.length === 0 || !benchmarkDb) return;

    let filteredAssetsDb = selectedAssetTickers.length > 0 
      ? assetsDb.filter(a => selectedAssetTickers.includes(a.ticker))
      : assetsDb.slice(0, Math.min(8, assetsDb.length));
      
    if (filteredAssetsDb.length === 0) return;

    try {
      const tickers = filteredAssetsDb.map(a => a.ticker);
      const returnsMatrix = filteredAssetsDb.map(a => calculateReturns(a.prices));
      const benchReturns = calculateReturns(benchmarkDb.prices);
      
      if (!returnsMatrix.some(r => r.length < 2) && benchReturns.length > 1) {
        let recommendedPortfolio = optimalPortfolio;

        if (!recommendedPortfolio) {
          const opt = new MarkowitzOptimizer(tickers, returnsMatrix, periodsPerYear);
          const sim = opt.runMonteCarlo(1000, activeRf);
          
          recommendedPortfolio = sim.minVarPortfolio;
          if (portfolioTabSuggestion === 'tangent' || riskCoefficient < 4) {
            recommendedPortfolio = sim.maxSharpePortfolio;
          }
        }
        
        if (recommendedPortfolio) {
          // Extraer pesos para mostrarlos
          const weightsList = recommendedPortfolio.weights.map((w, idx) => ({
            ticker: filteredAssetsDb[idx]?.ticker || tickers[idx],
            name: filteredAssetsDb[idx]?.name || tickers[idx],
            weight: w
          })).filter(w => w.weight > 0.001).sort((a, b) => b.weight - a.weight);
          
          setRecommendedWeights(weightsList);

          // Calcular Beta del portafolio recomendado
          // Beta = Cov(Port, Bench) / Var(Bench)
          const numPeriods = returnsMatrix[0].length;
          const portReturns: number[] = [];
          for (let t = 0; t < numPeriods; t++) {
            let ptRet = 0;
            recommendedPortfolio.weights.forEach((w, idx) => {
              ptRet += w * (returnsMatrix[idx] ? (returnsMatrix[idx][t] || 0) : 0);
            });
            portReturns.push(ptRet);
          }
          
          const covPB = covariance(portReturns, benchReturns);
          const varB = covariance(benchReturns, benchReturns);
          const beta = varB !== 0 ? covPB / varB : 1;
          const expectedReturn = recommendedPortfolio.return;
          
          setPortfolio1({
            name: 'Mi Portafolio Recomendado',
            er: Number(expectedReturn.toFixed(4)),
            beta: Number(beta.toFixed(2))
          });
          
          // Portafolio 2: Mercado o benchmark (ya lo podemos pre-poblar para 1 factor)
          let benchMean = benchReturns.reduce((a, b) => a + b, 0) / benchReturns.length;
          const benchAnnReturn = benchMean * periodsPerYear;
          setPortfolio2({
            name: 'Mercado (Benchmark)',
            er: Number(benchAnnReturn.toFixed(4)),
            beta: 1.0
          });
        }
      }
    } catch (e) {
      console.error("Error optimizando portafolio inicial", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsDb, benchmarkDb, selectedAssetTickers, periodsPerYear, portfolioTabSuggestion, riskCoefficient, optimalPortfolio]);

  // Cálculos de 1 Factor
  const singleFactorResults = useMemo(() => {
    const rf = activeRf;
    const er1 = portfolio1.er;
    const beta1 = portfolio1.beta;
    const er2 = portfolio2.er;
    const beta2 = portfolio2.beta;

    // Treynor Ratios (o rendimiento por unidad de riesgo sistemático)
    // TR = (E(R) - Rf) / Beta
    const tr1 = beta1 !== 0 ? (er1 - rf) / beta1 : 0;
    const tr2 = beta2 !== 0 ? (er2 - rf) / beta2 : 0;

    const diff = Math.abs(tr1 - tr2);
    const hasArbitrage = diff > 0.0001 && beta1 !== 0 && beta2 !== 0;

    // Construcción del portafolio de arbitraje con inversión neta cero y beta cero
    // Supongamos que compramos 1 unidad monetaria del subvalorado (mayor Treynor) 
    // y vendemos en corto el sobrevalorado (menor Treynor).
    // Queremos que Beta total = w_high * beta_high + w_low * beta_low = 0
    // w_high + w_low + w_rf = 0 (Inversión neta cero)
    
    let highP = portfolio1;
    let lowP = portfolio2;
    let highEr = er1, highBeta = beta1;
    let lowEr = er2, lowBeta = beta2;

    if (tr2 > tr1) {
      highP = portfolio2;
      lowP = portfolio1;
      highEr = er2;
      highBeta = beta2;
      lowEr = er1;
      lowBeta = beta1;
    }

    // Estrategia:
    // w_high = +1.0 (Largo en el portafolio con mayor Treynor)
    // Queremos w_high * beta_high + w_low * beta_low = 0 => 1 * beta_high + w_low * beta_low = 0 => w_low = - beta_high / beta_low (Corto en el de menor Treynor)
    // El remanente va a la tasa libre de riesgo: w_rf = - (w_high + w_low) = - (1 + w_low)
    const w_high = 1.0;
    const w_low = - highBeta / lowBeta;
    const w_rf = - (w_high + w_low);

    // Retorno esperado del portafolio de arbitraje por cada $1 invertido en el activo largo:
    // R_arb = w_high * highEr + w_low * lowEr + w_rf * rf
    const er_arb_unit = (w_high * highEr) + (w_low * lowEr) + (w_rf * rf);

    // Cantidades monetarias reales basadas en el capital nominal asignado
    const amountHigh = arbitrageCapital;
    const amountLow = arbitrageCapital * w_low;
    const amountRf = arbitrageCapital * w_rf;
    const totalProfit = arbitrageCapital * er_arb_unit;

    return {
      tr1,
      tr2,
      hasArbitrage,
      highP,
      lowP,
      w_high,
      w_low,
      w_rf,
      er_arb_unit,
      amountHigh,
      amountLow,
      amountRf,
      totalProfit,
      trDiff: diff
    };
  }, [portfolio1, portfolio2, activeRf, arbitrageCapital]);


  // --- MÓDULO DE 2 FACTORES (APT MULTIVARIABLE) ---
  const [pA, setPA] = useState({ name: 'Fondo de Crecimiento A', er: 0.16, beta1: 1.2, beta2: 0.5 });
  const [pB, setPB] = useState({ name: 'Fondo Industrial B', er: 0.12, beta1: 0.8, beta2: 1.5 });
  const [pC, setPC] = useState({ name: 'Fondo de Utilidades C', er: 0.08, beta1: 0.4, beta2: 0.2 });
  const [capital2F, setCapital2F] = useState<number>(250000);

  // Cálculos de 2 Factores APT:
  // Bajo APT, con una tasa libre de riesgo Rf, la rentabilidad esperada debe satisfacer:
  // E(R_i) = Rf + beta_i1 * lambda_1 + beta_i2 * lambda_2
  // Usamos el portafolio A y B para despejar las primas de riesgo factorial lambda_1 y lambda_2.
  // E(R_A) - Rf = beta_A1 * lambda_1 + beta_A2 * lambda_2
  // E(R_B) - Rf = beta_B1 * lambda_1 + beta_B2 * lambda_2
  // Sistema de 2x2:
  // | beta_A1  beta_A2 | | lambda_1 | = | E(R_A) - Rf |
  // | beta_B1  beta_B2 | | lambda_2 |   | E(R_B) - Rf |
  const twoFactorResults = useMemo(() => {
    const rf = activeRf;
    
    // Determinante de la matriz de betas de A y B
    const det = (pA.beta1 * pB.beta2) - (pA.beta2 * pB.beta1);
    
    if (Math.abs(det) < 0.0001) {
      return { 
        solvable: false, 
        hasArbitrage: false, 
        error: 'Los portafolios A y B tienen vectores de betas linealmente dependientes (no se puede despejar las primas sectoriales).' 
      };
    }

    // Resolver sistema por la regla de Cramer o inversa
    // lambda_1 = ( (erA - rf) * betaB2 - (erB - rf) * betaA2 ) / det
    // lambda_2 = ( betaA1 * (erB - rf) - betaB1 * (erA - rf) / det
    const erA_premium = pA.er - rf;
    const erB_premium = pB.er - rf;

    const lambda_1 = (erA_premium * pB.beta2 - erB_premium * pA.beta2) / det;
    const lambda_2 = (pA.beta1 * erB_premium - pB.beta1 * erA_premium) / det;

    // Rentabilidad teórica para el portafolio C según APT
    const theoreticalErC = rf + (pC.beta1 * lambda_1) + (pC.beta2 * lambda_2);
    const pricingError = pC.er - theoreticalErC; // Alfa de C

    const hasArbitrage = Math.abs(pricingError) > 0.0005;

    // Construcción del portafolio de arbitraje usando C y replicándolo con A, B y Rf.
    // Queremos replicar el riesgo sistemático de C usando A y B:
    // wA * beta_A1 + wB * beta_B1 = beta_C1
    // wA * beta_A2 + wB * beta_B2 = beta_C2
    // Resolvemos para wA y wB (las ponderaciones de réplica de riesgo):
    const replica_wA = (pC.beta1 * pB.beta2 - pC.beta2 * pB.beta1) / det;
    const replica_wB = (pA.beta1 * pC.beta2 - pA.beta2 * pC.beta1) / det;
    const replica_wRf = 1 - replica_wA - replica_wB;

    // Retorno del portafolio réplica:
    const replicaEr = (replica_wA * pA.er) + (replica_wB * pB.er) + (replica_wRf * rf);

    // Portafolio de Arbitraje:
    // Si C está subvalorado (pricingError < 0, es decir C da MENOS de lo que debería por su riesgo, o pricingError > 0 C da MÁS):
    // Si pricingError > 0 (C está subvalorado/barato, da un retorno esperado superior al de equilibrio):
    //   - Compramos C (peso +1)
    //   - Vendemos en corto la réplica (peso -1): vende A (peso -replica_wA), vende B (peso -replica_wB), vende Rf (peso -replica_wRf)
    // Si pricingError < 0 (C está sobrevalorado/caro, da un retorno esperado inferior al de equilibrio):
    //   - Vendemos C (peso -1)
    //   - Compramos la réplica (peso +1): compra A (peso replica_wA), compra B (peso replica_wB), compra Rf (peso replica_wRf)
    
    const direction = pricingError > 0 ? 1 : -1;
    
    const arb_wC = direction * 1.0;
    const arb_wA = -direction * replica_wA;
    const arb_wB = -direction * replica_wB;
    const arb_wRf = -direction * replica_wRf;

    // Retorno neto de arbitraje por cada $1 largo en el portafolio C:
    const er_arb_unit = (arb_wC * pC.er) + (arb_wA * pA.er) + (arb_wB * pB.er) + (arb_wRf * rf);

    // Pesos nominales de arbitraje
    const amountC = capital2F * arb_wC;
    const amountA = capital2F * arb_wA;
    const amountB = capital2F * arb_wB;
    const amountRf = capital2F * arb_wRf;
    const totalProfit = capital2F * Math.abs(pricingError);

    return {
      solvable: true,
      lambda_1,
      lambda_2,
      theoreticalErC,
      pricingError,
      hasArbitrage,
      replica_wA,
      replica_wB,
      replica_wRf,
      replicaEr,
      arb_wC,
      arb_wA,
      arb_wB,
      arb_wRf,
      er_arb_unit,
      amountC,
      amountA,
      amountB,
      amountRf,
      totalProfit
    };
  }, [pA, pB, pC, activeRf, capital2F]);

  return (
    <div className="space-y-8" id="arbitrage-module-container">
      
      {/* SECCIÓN EXPLICATIVA INICIAL DE TEORÍA APT */}
      <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-lg border border-indigo-805">
        <div className="max-w-3xl space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 px-2.5 py-1 rounded-full font-mono font-bold uppercase tracking-widest">
              Arbitrage Pricing Theory (APT)
            </span>
            <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 px-2.5 py-1 rounded-full font-mono font-bold uppercase tracking-widest">
              Inversión Neta Cero
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Detector de Arbitraje Factorial APT
          </h1>
          <p className="text-sm text-indigo-100/90 leading-relaxed">
            Una oportunidad de arbitraje puro existe cuando se puede estructurar una cartera con{' '}
            <strong className="text-white">inversión inicial neta cero</strong>,{' '}
            <strong className="text-white">riesgo factorial sistemático cero</strong> y un{' '}
            <strong className="text-white">rendimiento esperado positivo garantizado</strong>. 
            Este detector analiza desajustes de precios (mispricings) para formular carteras largas/cortas perfectas.
          </p>
        </div>

        {/* Sync con Tasa Libre de Riesgo Global */}
        <div className="mt-6 flex flex-wrap items-center gap-4 pt-4 border-t border-indigo-800/60 text-xs">
          <div className="flex items-center gap-2 text-indigo-200 font-medium">
            <Percent className="h-4 w-4 text-emerald-400" />
            <span>Tasa de Interés Libre de Riesgo activa:</span>
          </div>
          <div className="flex items-center gap-2 bg-slate-900/60 p-1.5 rounded-lg border border-indigo-700">
            <input 
              type="checkbox"
              id="sync-rf-arbitrage"
              checked={syncWithGlobal}
              onChange={(e) => {
                setSyncWithGlobal(e.target.checked);
                if (e.target.checked) setRfOverride(rfAnnual);
              }}
              className="rounded border-slate-700 text-indigo-500 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
            />
            <label htmlFor="sync-rf-arbitrage" className="cursor-pointer font-bold text-white pr-2">
              Sincronizar con el Módulo Central ({ (rfAnnual * 100).toFixed(2) }%)
            </label>
          </div>

          {!syncWithGlobal && (
            <div className="flex items-center gap-2 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-indigo-700">
              <span className="text-indigo-200">Manual Rf:</span>
              <input 
                type="number"
                step="0.01"
                min="0"
                max="0.2"
                value={rfOverride}
                onChange={(e) => setRfOverride(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-16 bg-slate-800 text-white text-center font-mono font-bold text-xs rounded border border-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 py-0.5"
              />
            </div>
          )}
        </div>
      </div>

      {/* COMPOSICIÓN DEL PORTAFOLIO RECOMENDADO (Si viene de los módulos anteriores) */}
      {recommendedWeights.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs" id="recommended-composition">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="bg-emerald-100 p-2 rounded-lg text-emerald-700">
              <Briefcase className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Composición de 'Mi Portafolio Recomendado'</h3>
              <p className="text-[11px] text-slate-500">Activos y ponderaciones generados por el modelo de optimización de Markowitz ({portfolioTabSuggestion === 'tangent' || riskCoefficient < 4 ? 'Portafolio Tangente de Máxima Eficiencia' : 'Portafolio de Mínima Varianza'}).</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            {recommendedWeights.map(w => (
              <div key={w.ticker} className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex flex-col items-center text-center justify-center relative overflow-hidden">
                <span className="text-[10px] font-bold text-slate-400 absolute top-2 right-2">{w.ticker}</span>
                <span className="text-xl font-bold text-slate-800 font-mono mt-3">{(w.weight * 100).toFixed(1)}%</span>
                <span className="text-[9px] text-slate-500 mt-1 truncate w-full px-1">{w.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REJILLA DE AMBOS MODELOS DE DETECCIÓN (1 FACTOR vs MULTIFACTOR) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" id="arbitrage-grids">

        {/* 1. MODELO DE 1 FACTOR (ESTILO TREYNOR / SML) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6 flex flex-col justify-between" id="one-factor-model">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                <TrendingUp className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">1. Arbitraje Uni-Factorial (Línea del Mercado de Activos)</h3>
                <p className="text-[11px] text-slate-500">Compara las primas de riesgo por unidad de Beta entre dos carteras diversificadas.</p>
              </div>
            </div>

            {/* Inputs de Portafolios */}
            <div className="grid grid-cols-2 gap-4">
              {/* Portafolio 1 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <span className="text-[10px] font-bold text-blue-600 tracking-wider uppercase font-mono block">Cartera Alfa (P1)</span>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Nombre:</label>
                  <input 
                    type="text" 
                    value={portfolio1.name} 
                    onChange={(e) => setPortfolio1({ ...portfolio1, name: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-md text-xs font-semibold px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Retorno Esperado E(R):</label>
                  <input 
                    type="number" 
                    step="0.005"
                    value={portfolio1.er} 
                    onChange={(e) => setPortfolio1({ ...portfolio1, er: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded-md text-xs font-mono px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Porcentaje: {(portfolio1.er * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Beta Factorial (β):</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={portfolio1.beta} 
                    onChange={(e) => setPortfolio1({ ...portfolio1, beta: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded-md text-xs font-mono px-2 py-1 focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Portafolio 2 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <span className="text-[10px] font-bold text-indigo-600 tracking-wider uppercase font-mono block">Cartera Beta (P2)</span>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Nombre:</label>
                  <input 
                    type="text" 
                    value={portfolio2.name} 
                    onChange={(e) => setPortfolio2({ ...portfolio2, name: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-md text-xs font-semibold px-2 py-1.5 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Retorno Esperado E(R):</label>
                  <input 
                    type="number" 
                    step="0.005"
                    value={portfolio2.er} 
                    onChange={(e) => setPortfolio2({ ...portfolio2, er: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded-md text-xs font-mono px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Porcentaje: {(portfolio2.er * 100).toFixed(1)}%</span>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Beta Factorial (β):</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={portfolio2.beta} 
                    onChange={(e) => setPortfolio2({ ...portfolio2, beta: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded-md text-xs font-mono px-2 py-1 focus:ring-1 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Configuración de Capital Nominales */}
            <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">Capital Asignado para Arbitraje:</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs font-mono">$</span>
                <input 
                  type="number" 
                  step="5000"
                  value={arbitrageCapital} 
                  onChange={(e) => setArbitrageCapital(Math.max(1000, parseInt(e.target.value) || 0))}
                  className="bg-white border border-slate-200 text-right rounded px-2.5 py-1 text-xs font-mono font-bold w-28 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Resultados Analíticos */}
            <div className="space-y-3.5 pt-2">
              <div className="flex justify-between text-xs pb-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Relación Premio/Riesgo (Treynor P1):</span>
                <span className="font-mono font-bold text-slate-850">
                  { (singleFactorResults.tr1 * 100).toFixed(3) }% por unidad de β
                </span>
              </div>
              <div className="flex justify-between text-xs pb-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Relación Premio/Riesgo (Treynor P2):</span>
                <span className="font-mono font-bold text-slate-850">
                  { (singleFactorResults.tr2 * 100).toFixed(3) }% por unidad de β
                </span>
              </div>

              {/* Tarjeta de Decisión */}
              {singleFactorResults.hasArbitrage ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" />
                    <span>¡Oportunidad de Arbitraje Detectada! (Dif: {(singleFactorResults.trDiff * 100).toFixed(3)}%)</span>
                  </div>
                  <p className="text-emerald-700 leading-relaxed">
                    Las primas de riesgo no están equilibradas. Podemos vender en corto{' '}
                    <strong>{singleFactorResults.lowP.name}</strong> (que está sobrevalorado relativamente) e invertir en{' '}
                    <strong>{singleFactorResults.highP.name}</strong> (que está subvalorado relativamente), equilibrando las betas con la tasa libre de riesgo.
                  </p>

                  {/* Boleto de Transacciones de Arbitraje */}
                  <div className="bg-white/80 rounded-lg p-3 border border-emerald-100 space-y-2 text-slate-800">
                    <div className="font-bold text-emerald-950 flex items-center gap-1.5 pb-1 border-b border-emerald-100">
                      <Coins className="h-4 w-4" />
                      <span>Estrategia de Ejecución Operativa</span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-[11px] font-mono">
                      <div className="bg-emerald-100/30 p-2 rounded">
                        <div className="text-emerald-900 font-bold uppercase text-[9px] tracking-wider mb-0.5">COMPRAR (LARGO)</div>
                        <div className="text-slate-900 font-bold">{singleFactorResults.highP.name}</div>
                        <div className="text-indigo-600 font-bold text-xs mt-1">
                          +${singleFactorResults.amountHigh.toLocaleString()}
                        </div>
                        <div className="text-slate-400 text-[9px]">Peso: {(singleFactorResults.w_high * 100).toFixed(0)}%</div>
                      </div>

                      <div className="bg-red-50 p-2 rounded">
                        <div className="text-red-900 font-bold uppercase text-[9px] tracking-wider mb-0.5">VENDER EN CORTO</div>
                        <div className="text-slate-900 font-bold">{singleFactorResults.lowP.name}</div>
                        <div className="text-red-600 font-bold text-xs mt-1">
                          -${Math.abs(singleFactorResults.amountLow).toLocaleString()}
                        </div>
                        <div className="text-slate-400 text-[9px]">Peso: {(singleFactorResults.w_low * 100).toFixed(0)}%</div>
                      </div>

                      <div className="bg-blue-50 p-2 rounded">
                        <div className="text-blue-900 font-bold uppercase text-[9px] tracking-wider mb-0.5">
                          {singleFactorResults.amountRf > 0 ? 'PRESTAR (COLOCAR)' : 'TOMAR PRESTADO'}
                        </div>
                        <div className="text-slate-900 font-bold">Tasa Libre ({ (activeRf*100).toFixed(1) }%)</div>
                        <div className={`text-xs font-bold mt-1 ${singleFactorResults.amountRf > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {singleFactorResults.amountRf > 0 ? '+' : ''}${singleFactorResults.amountRf.toLocaleString()}
                        </div>
                        <div className="text-slate-400 text-[9px]">Peso: {(singleFactorResults.w_rf * 100).toFixed(0)}%</div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-emerald-100 flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-600">Inversión Inicial Total:</span>
                      <strong className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
                        $0 (Autofinanciable)
                      </strong>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-600">Beta del Portafolio Resultante:</span>
                      <strong className="font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                        0.00 (Sin Riesgo Factorial)
                      </strong>
                    </div>

                    <div className="flex justify-between items-center text-xs font-bold pt-1 text-emerald-900">
                      <span>Beneficio Arbitraje Esperado:</span>
                      <span className="font-mono text-emerald-600 text-sm">
                        +${Math.round(singleFactorResults.totalProfit).toLocaleString()} / período
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs flex items-center gap-2 text-slate-600">
                  <Info className="h-5 w-5 text-slate-400 shrink-0" />
                  <span>No existe oportunidad de arbitraje materializable (las primas de riesgo sistemáticas están equilibradas).</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="pt-4 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Condición de no-arbitraje: (E(R1) - Rf) / β1 = (E(R2) - Rf) / β2.</span>
          </div>
        </div>


        {/* 2. MODELO DE 2 FACTORES (APT MULTIVARIABLE CON REPLICACIÓN) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6 flex flex-col justify-between" id="two-factor-model">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="bg-indigo-100 p-2 rounded-lg text-indigo-700">
                <Briefcase className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">2. Arbitraje Multi-Factorial (2 Factores APT)</h3>
                <p className="text-[11px] text-slate-500">Usa A y B para calibrar las primas sectoriales y diagnosticar desajustes en el Portafolio C.</p>
              </div>
            </div>

            {/* Inputs de 2 Factores */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Activo A */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                <span className="text-[9px] font-bold text-indigo-700 tracking-wider uppercase font-mono block">Portafolio A</span>
                <div>
                  <label className="block text-[9px] text-slate-400">E(R):</label>
                  <input 
                    type="number" 
                    step="0.005"
                    value={pA.er} 
                    onChange={(e) => setPA({ ...pA, er: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400">Beta Factor 1:</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={pA.beta1} 
                    onChange={(e) => setPA({ ...pA, beta1: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400">Beta Factor 2:</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={pA.beta2} 
                    onChange={(e) => setPA({ ...pA, beta2: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono outline-none"
                  />
                </div>
              </div>

              {/* Activo B */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                <span className="text-[9px] font-bold text-violet-700 tracking-wider uppercase font-mono block">Portafolio B</span>
                <div>
                  <label className="block text-[9px] text-slate-400">E(R):</label>
                  <input 
                    type="number" 
                    step="0.005"
                    value={pB.er} 
                    onChange={(e) => setPB({ ...pB, er: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400">Beta Factor 1:</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={pB.beta1} 
                    onChange={(e) => setPB({ ...pB, beta1: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-400">Beta Factor 2:</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={pB.beta2} 
                    onChange={(e) => setPB({ ...pB, beta2: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono outline-none"
                  />
                </div>
              </div>

              {/* Activo C (Analizado) */}
              <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100 space-y-2">
                <span className="text-[9px] font-bold text-amber-700 tracking-wider uppercase font-mono block">Portafolio C (Bajo Análisis)</span>
                <div>
                  <label className="block text-[9px] text-amber-600">E(R) Real:</label>
                  <input 
                    type="number" 
                    step="0.005"
                    value={pC.er} 
                    onChange={(e) => setPC({ ...pC, er: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-amber-200 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-amber-600">Beta Factor 1:</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={pC.beta1} 
                    onChange={(e) => setPC({ ...pC, beta1: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-amber-200 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-amber-600">Beta Factor 2:</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={pC.beta2} 
                    onChange={(e) => setPC({ ...pC, beta2: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-amber-200 rounded px-1.5 py-0.5 text-xs font-mono outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Configuración de Capital Nominales */}
            <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">Capital Asignado para Arbitraje:</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs font-mono">$</span>
                <input 
                  type="number" 
                  step="10000"
                  value={capital2F} 
                  onChange={(e) => setCapital2F(Math.max(1000, parseInt(e.target.value) || 0))}
                  className="bg-white border border-slate-200 text-right rounded px-2.5 py-1 text-xs font-mono font-bold w-28 outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Resultados Analíticos */}
            <div className="space-y-2 text-xs">
              {twoFactorResults.solvable ? (
                <>
                  <div className="flex justify-between pb-1 border-b border-slate-50">
                    <span className="text-slate-500">Primas de Riesgo Factoriales Despejadas:</span>
                    <span className="font-mono text-indigo-900 font-bold">
                      λ₁ = { (twoFactorResults.lambda_1 * 100).toFixed(2) }%, λ₂ = { (twoFactorResults.lambda_2 * 100).toFixed(2) }%
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-slate-50">
                    <span className="text-slate-500">Retorno Teórico de C según APT:</span>
                    <span className="font-mono font-bold text-slate-800">
                      { (twoFactorResults.theoreticalErC * 100).toFixed(2) }%
                    </span>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-slate-50">
                    <span className="text-slate-500">Desvío de Equilibrio (Mispricing / Alfa de C):</span>
                    <span className={`font-mono font-bold ${Math.abs(twoFactorResults.pricingError) > 0.001 ? 'text-rose-600' : 'text-slate-500'}`}>
                      { (twoFactorResults.pricingError * 100).toFixed(2) }% { twoFactorResults.pricingError > 0 ? '(Subvalorado)' : '(Sobrevalorado)' }
                    </span>
                  </div>

                  {/* Tarjeta de Decisión */}
                  {twoFactorResults.hasArbitrage ? (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-indigo-900 font-bold">
                        <Sparkles className="h-4.5 w-4.5 text-indigo-600" />
                        <span>¡Oportunidad de Arbitraje de 2 Factores Detectada!</span>
                      </div>
                      <p className="text-indigo-800 text-[11px] leading-relaxed">
                        El Portafolio C ofrece un rendimiento real de <strong>{(pC.er * 100).toFixed(2)}%</strong> frente al equilibrio teórico de <strong>{(twoFactorResults.theoreticalErC * 100).toFixed(2)}%</strong>. 
                        Podemos construir un portafolio de arbitraje con inversión neta cero y riesgo factorial neto cero.
                      </p>

                      {/* Ticket */}
                      <div className="bg-white rounded-lg p-3 border border-indigo-100 space-y-2 text-slate-800 text-[11px]">
                        <div className="font-bold text-indigo-950 flex items-center gap-1 border-b border-indigo-50 pb-1 font-sans">
                          <ListTodo className="h-4 w-4 text-indigo-600" />
                          <span>Estrategia de Réplica Cruzada (APT Arbitrage)</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 font-mono">
                          <div className="p-2 rounded bg-indigo-50/50">
                            <div className="text-[9px] text-indigo-800 font-bold uppercase mb-0.5">COMPRA/VENTA C</div>
                            <div className="font-bold text-indigo-900">
                              {twoFactorResults.arb_wC > 0 ? 'COMPRAR (LARGO)' : 'VENDER (CORTO)'}
                            </div>
                            <div className="text-indigo-600 font-bold text-xs mt-1">
                              {twoFactorResults.arb_wC > 0 ? '+' : '-'}${Math.abs(twoFactorResults.amountC).toLocaleString()}
                            </div>
                            <div className="text-slate-400 text-[9px]">Peso: {(twoFactorResults.arb_wC * 100).toFixed(0)}%</div>
                          </div>

                          <div className="p-2 rounded bg-indigo-50/50">
                            <div className="text-[9px] text-indigo-800 font-bold uppercase mb-0.5">POSICIÓN REPLICADORA DE FACTOR A</div>
                            <div className="font-bold text-indigo-900">
                              {twoFactorResults.arb_wA > 0 ? 'COMPRAR A' : 'VENDER EN CORTO A'}
                            </div>
                            <div className={`font-bold text-xs mt-1 ${twoFactorResults.arb_wA > 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                              {twoFactorResults.arb_wA > 0 ? '+' : '-'}${Math.abs(twoFactorResults.amountA).toLocaleString()}
                            </div>
                            <div className="text-slate-400 text-[9px]">Peso: {(twoFactorResults.arb_wA * 100).toFixed(1)}%</div>
                          </div>

                          <div className="p-2 rounded bg-indigo-50/50">
                            <div className="text-[9px] text-indigo-800 font-bold uppercase mb-0.5">POSICIÓN REPLICADORA DE FACTOR B</div>
                            <div className="font-bold text-indigo-900">
                              {twoFactorResults.arb_wB > 0 ? 'COMPRAR B' : 'VENDER EN CORTO B'}
                            </div>
                            <div className={`font-bold text-xs mt-1 ${twoFactorResults.arb_wB > 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
                              {twoFactorResults.arb_wB > 0 ? '+' : '-'}${Math.abs(twoFactorResults.amountB).toLocaleString()}
                            </div>
                            <div className="text-slate-400 text-[9px]">Peso: {(twoFactorResults.arb_wB * 100).toFixed(1)}%</div>
                          </div>

                          <div className="p-2 rounded bg-indigo-50/50">
                            <div className="text-[9px] text-indigo-800 font-bold uppercase mb-0.5">TASA LIBRE DE RIESGO</div>
                            <div className="font-bold text-indigo-900">
                              {twoFactorResults.arb_wRf > 0 ? 'PRESTAR (COLOCAR)' : 'TOMAR PRESTADO'}
                            </div>
                            <div className={`font-bold text-xs mt-1 ${twoFactorResults.arb_wRf > 0 ? 'text-indigo-600' : 'text-amber-600'}`}>
                              {twoFactorResults.arb_wRf > 0 ? '+' : '-'}${Math.abs(twoFactorResults.amountRf).toLocaleString()}
                            </div>
                            <div className="text-slate-400 text-[9px]">Peso: {(twoFactorResults.arb_wRf * 100).toFixed(1)}%</div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-indigo-100 flex justify-between items-center">
                          <span className="text-slate-500 font-medium">Inversión Neta de la Estrategia:</span>
                          <strong className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">
                            $0 (Sin Capital Requerido)
                          </strong>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 font-medium">Riesgo Factorial 1 y 2 Resultantes:</span>
                          <strong className="font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                            0.00 (Perfectamente Cubierto)
                          </strong>
                        </div>

                        <div className="flex justify-between items-center text-xs font-bold pt-1 text-indigo-950">
                          <span>Beneficio Esperado de Arbitraje Puro:</span>
                          <span className="font-mono text-emerald-600 text-sm">
                            +${Math.round(twoFactorResults.totalProfit).toLocaleString()} / período
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs flex items-center gap-2 text-slate-600">
                      <Info className="h-5 w-5 text-slate-400 shrink-0" />
                      <span>El Portafolio C está valorado correctamente respecto a A y B. No hay arbitraje.</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                  <span>{twoFactorResults.error}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Condición de Arbitraje Multifactorial: E(Rc) = Rf + βc1·λ1 + βc2·λ2.</span>
          </div>
        </div>

      </div>

      {/* COMPENDIO ACADÉMICO / AYUDA MATEMÁTICA */}
      <div className="bg-slate-100/60 rounded-2xl border border-slate-200/60 p-6 space-y-4" id="apt-academic-guide">
        <h4 className="text-xs font-bold text-slate-850 uppercase tracking-wider flex items-center gap-1.5">
          <Info className="h-4 w-4 text-indigo-600" />
          Fundamentos del Arbitraje y la Teoría APT (Stephen Ross, 1976)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-600 leading-relaxed">
          <div className="space-y-2">
            <h5 className="font-bold text-slate-900">¿Qué es el APT?</h5>
            <p>
              A diferencia del CAPM que asume una sola cartera de mercado, la <strong>Teoría de Valoración por Arbitraje (APT)</strong> sostiene que el rendimiento de un activo depende de múltiples factores económicos o sectoriales (crecimiento del PIB, inflación, tasas de interés) ponderados por sus respectivas sensibilidades (Betas).
            </p>
          </div>
          <div className="space-y-2">
            <h5 className="font-bold text-slate-900">El Proceso de Arbitraje Factorial</h5>
            <p>
              Si un activo ofrece un rendimiento esperado superior al de una cartera sintética que replica exactamente su riesgo sistemático, los inversores comprarán masivamente el activo subvalorado y venderán en corto el portafolio de réplica. Este flujo equilibra los precios casi instantáneamente.
            </p>
          </div>
          <div className="space-y-2">
            <h5 className="font-bold text-slate-900">Inversión Neta Cero y Riesgo Cero</h5>
            <p>
              La belleza del arbitraje APT es que es <strong>autofinanciable</strong>. Los fondos obtenidos por vender en corto las carteras sobrevaloradas financian exactamente la compra de los activos subvalorados, cancelando a su vez todo el riesgo factorial y dejando una ganancia segura.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={() => {
            if (onNavigateToTab) {
              onNavigateToTab('forecast');
            }
          }}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-200"
        >
          Guardar y Continuar (Módulo 5: Simulación)
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>

    </div>
  );
}
