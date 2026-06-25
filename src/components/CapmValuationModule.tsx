/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Cell
} from 'recharts';
import { Award, Zap, BarChart2, TrendingUp, Info, Scale, CheckCircle } from 'lucide-react';
import { ASSETS_DATABASE, BENCHMARK_DATABASE, AssetData, BenchmarkData } from '../data/refinitiv_data';
import { calculateReturns, estimateOLS, mean } from '../lib/finance_math';
import { PerformanceMetrics } from '../types';
import { useEffect } from 'react';

interface CapmValuationModuleProps {
  metrics: PerformanceMetrics[];
  rfAnnual: number;
  assetsDb?: AssetData[];
  benchmarkDb?: BenchmarkData;
  periodsPerYear?: number;
  riskCoefficient?: number;
  riskScore?: number | null;
  selectedAssetTickers?: string[];
  onNavigateToTab?: (tab: 'arbitrage') => void;
}

export default function CapmValuationModule({ 
  metrics, 
  rfAnnual, 
  assetsDb = ASSETS_DATABASE, 
  benchmarkDb = BENCHMARK_DATABASE,
  periodsPerYear = 12,
  riskCoefficient = 5.0,
  riskScore = null,
  selectedAssetTickers = [],
  onNavigateToTab
}: CapmValuationModuleProps) {
  const dbAssets = assetsDb;
  const dbBenchmark = benchmarkDb;

  const [selectedAsset, setSelectedAsset] = useState<string>('');
  const [valuationFilter, setValuationFilter] = useState<'todos' | 'subvalorados' | 'sobrevalorados'>('todos');

  // Sincronizar ticker de regresión cuando cargamos otra base de datos
  useEffect(() => {
    if (selectedAssetTickers.length > 0 && dbAssets.some(a => a.ticker === selectedAssetTickers[0])) {
      setSelectedAsset(selectedAssetTickers[0]);
    } else if (dbAssets.length > 0) {
      setSelectedAsset(dbAssets[0].ticker);
    }
  }, [dbAssets, selectedAssetTickers]);

  // Calcular retornos mensuales del Benchmark y del activo seleccionado y emparejarlos
  const olesRegressionDataset = useMemo(() => {
    const asset = dbAssets.find(a => a.ticker === selectedAsset);
    if (!asset) return null;

    const assetReturns = calculateReturns(asset.prices);
    const marketReturns = calculateReturns(dbBenchmark.prices);

    // Formatear pares de retornos para el scatter plot
    const pairs = assetReturns.map((assetRet, idx) => ({
      marketReturn: Number((marketReturns[idx] * 100).toFixed(4)),
      assetReturn: Number((assetRet * 100).toFixed(4)),
      index: idx + 1
    }));

    // Parámetros OLS
    const stats = estimateOLS(assetReturns, marketReturns, periodsPerYear);

    // Calcular puntos para la línea regresión OLS fits
    const minMkt = Math.min(...pairs.map(p => p.marketReturn));
    const maxMkt = Math.max(...pairs.map(p => p.marketReturn));
    
    // Convertir el alpha mensual al porcentaje gráfico
    const regressionLine = [
      {
        marketReturn: minMkt,
        fittedReturn: Number((stats.alphaMonthly * 100 + stats.beta * minMkt).toFixed(4))
      },
      {
        marketReturn: maxMkt,
        fittedReturn: Number((stats.alphaMonthly * 100 + stats.beta * maxMkt).toFixed(4))
      }
    ];

    return {
      pairs,
      regressionLine,
      coefs: stats,
      assetName: asset.name
    };
  }, [selectedAsset, dbAssets, dbBenchmark, periodsPerYear]);

  // Retornos acumulados del Benchmark para la SML
  const benchmarkReturnAnn = useMemo(() => {
    const mReturns = calculateReturns(dbBenchmark.prices);
    return mean(mReturns) * periodsPerYear;
  }, [dbBenchmark, periodsPerYear]);

  // Datos para la Línea del Mercado de Títulos (SML - Security Market Line)
  // E(Ri) = Rf + Beta * (Rm - Rf)
  const smlDataset = useMemo(() => {
    const maxBetaValue = Math.max(...metrics.map(m => m.beta), 1.5) * 1.15;
    const points: { beta: number; requiredReturn: number }[] = [];
    
    for (let bValue = 0; bValue <= maxBetaValue; bValue += maxBetaValue / 10) {
      points.push({
        beta: Number(bValue.toFixed(2)),
        // CAPM Formula: Rf + Beta * Prima_Riesgo
        requiredReturn: Number(((rfAnnual + bValue * (benchmarkReturnAnn - rfAnnual)) * 100).toFixed(2))
      });
    }
    return {
      smlLine: points,
      assetsPoints: metrics.map(m => ({
        ticker: m.ticker,
        name: m.name,
        beta: Number(m.beta.toFixed(3)),
        actualReturn: Number((m.annualReturn * 100).toFixed(2)),
        // expected return CAPM
        requiredReturn: Number(((rfAnnual + m.beta * (benchmarkReturnAnn - rfAnnual)) * 100).toFixed(2)),
        alpha: Number((m.alphaJensen * 100).toFixed(2)),
        isUndervalued: m.alphaJensen > 0,
        pValBeta: m.pValBeta,
        pValAlpha: m.pValAlpha,
        tStatBeta: m.tStatBeta,
        tStatAlpha: m.tStatAlpha
      }))
    };
  }, [metrics, rfAnnual, benchmarkReturnAnn]);

  // Filtrar la tabla de valoración comparativa
  const filteredValuations = useMemo(() => {
    const data = smlDataset.assetsPoints;
    if (valuationFilter === 'subvalorados') {
      return data.filter(item => item.isUndervalued);
    }
    if (valuationFilter === 'sobrevalorados') {
      return data.filter(item => !item.isUndervalued);
    }
    return data;
  }, [smlDataset, valuationFilter]);

  return (
    <div className="space-y-8" id="capm-valuation-module">
      
      {/* Intro Teórica de CAPM */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Award className="text-amber-600 h-6 w-6" />
          Módulo 3: Modelo de Valoración de Activos de Capital (CAPM)
        </h2>
        <p className="mt-2 text-sm text-gray-600 leading-relaxed">
          El <strong>Capital Asset Pricing Model (CAPM)</strong> descompone el riesgo de un activo en riesgo sistemático (no diversificable, medido por su coeficiente <strong className="text-gray-900">Beta (β)</strong>) y riesgo no sistemático (diversificable). El modelo postula que la rentabilidad exigida de cualquier activo financiero es igual a la tasa libre de riesgo más una prima proporcional a su riesgo sistemático.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Estimación de Beta por Regresión OLS */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Regresión OLS del Activo vs {benchmarkDb.ticker.split(' (')[0]}</h3>
                <p className="text-xs text-gray-500">Estimación de Beta (β) mediante emparejamiento de retornos mensuales</p>
              </div>

              {/* Selector Asset para regresión */}
              <select
                value={selectedAsset}
                onChange={(e) => setSelectedAsset(e.target.value)}
                className="bg-slate-50 border border-gray-200 rounded-lg p-2 text-xs font-mono font-bold focus:ring-1 focus:ring-amber-500 max-w-[125px]"
              >
                {metrics.map(m => (
                  <option key={m.ticker} value={m.ticker} className="font-mono">{m.ticker}</option>
                ))}
              </select>
            </div>

            {/* Métricas OLS */}
            {olesRegressionDataset && 'coefs' in olesRegressionDataset ? (
              <div className="grid grid-cols-3 gap-3 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono text-center">
                <div className="bg-white p-2 rounded-md shadow-xs">
                  <span className="text-[10px] text-gray-400 block uppercase">Beta Sistemática (Slope)</span>
                  <span className="text-base font-bold text-indigo-700">{olesRegressionDataset.coefs.beta.toFixed(3)}</span>
                </div>
                <div className="bg-white p-2 rounded-md shadow-xs">
                  <span className="text-[10px] text-gray-400 block uppercase">Coef. Determinación R²</span>
                  <span className="text-base font-bold text-slate-800">{olesRegressionDataset.coefs.rSquared.toFixed(4)}</span>
                </div>
                <div className="bg-white p-2 rounded-md shadow-xs font-sans">
                  <span className="text-[10px] text-gray-400 block uppercase font-mono">Alfa Periódico OLS</span>
                  <span className="text-sm font-bold text-emerald-600">{(olesRegressionDataset.coefs.alphaMonthly * 100).toFixed(3)}%</span>
                </div>
              </div>
            ) : null}

            {/* Validación de Datos frente a Yahoo Finance */}
            <div className="text-[10px] text-slate-600 bg-slate-50/80 p-3 rounded-lg mb-4 border border-indigo-100 flex items-start gap-2.5 shadow-xs">
              <Info className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="space-y-1.5 leading-relaxed">
                <strong className="text-indigo-900 block text-[11px] uppercase tracking-wide">
                  Validación de Datos: Metodología Local vs. Yahoo Finance
                </strong>
                <p>
                  <strong>1. Cálculo de Beta (β):</strong> Yahoo Finance calcula la <em>"Beta (5Y Monthly)"</em> usando exactamente 60 meses de retornos cerrados estrictamente a fin de mes frente al S&P 500 (^GSPC). Aquí, tu Beta se recalcula en tiempo real usando los <strong>{olesRegressionDataset?.pairs?.length || 0} periodos</strong> cargados y la frecuencia seleccionada en los controles maestros.
                </p>
                <p>
                  <strong>2. Tasa Libre de Riesgo (Risk-Free Rate):</strong> Para el modelo CAPM, el estándar industrial (y de Yahoo Finance) es utilizar el rendimiento de los <strong>Bonos del Tesoro de EE.UU. a 13 semanas (Ticker: ^IRX)</strong>. El modelo actual está corrigiendo la valoración de todos los activos usando una Tasa Libre de Riesgo (Rf) del <strong className="text-emerald-700 bg-emerald-100 px-1 rounded font-mono">{(rfAnnual * 100).toFixed(2)}%</strong>. 
                </p>
              </div>
            </div>

            {/* Regression Chart */}
            <div className="h-[280px] w-full">
              {olesRegressionDataset && 'pairs' in olesRegressionDataset ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis 
                      type="number" 
                      dataKey="marketReturn" 
                      name="Retorno Mercado" 
                      unit="%" 
                      tick={{ fontSize: 9 }}
                      domain={['auto', 'auto']}
                      label={{ value: `Retorno de Mercado ${benchmarkDb.ticker.split(' (')[0]} (%)`, position: 'insideBottom', offset: 1, fontSize: 10, fill: '#64748b' }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="assetReturn" 
                      name="Retorno Activo" 
                      unit="%" 
                      tick={{ fontSize: 9 }}
                      domain={['auto', 'auto']}
                      label={{ value: `Retorno Histórico de ${selectedAsset} (%)`, angle: -90, position: 'insideLeft', offset: 15, fontSize: 10, fill: '#64748b' }}
                    />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          if ('fittedReturn' in data) {
                            return (
                              <div className="bg-indigo-950 text-white p-2 rounded-lg text-xs">
                                <p className="font-semibold">Fitted (Línea Regresión)</p>
                                <p>{benchmarkDb.ticker.split(' (')[0]}: {data.marketReturn.toFixed(2)}%</p>
                                <p>Predicción {selectedAsset}: {data.fittedReturn.toFixed(2)}%</p>
                              </div>
                            );
                          }
                          return (
                            <div className="bg-slate-900 text-white p-2.5 rounded-lg text-xs leading-relaxed">
                              <p className="font-bold text-amber-400">Punto de Retorno Mes {data.index}</p>
                              <hr className="my-1 border-slate-700" />
                              <p>Retorno {benchmarkDb.ticker.split(' (')[0]}: <span className="font-semibold">{data.marketReturn.toFixed(3)}%</span></p>
                              <p>Retorno {selectedAsset}: <span className="font-semibold">{data.assetReturn.toFixed(3)}%</span></p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />

                    {/* 1. Nube de Retornos de Regresión */}
                    <Scatter name="Retornos Mensuales" data={olesRegressionDataset.pairs} fill="#1e293b" opacity={0.7} r={4} />

                    {/* 2. Recta de Regresión OLS */}
                    <Scatter 
                      name="Recta Regresión OLS" 
                      data={olesRegressionDataset.regressionLine} 
                      fill="#4f46e5" 
                      line={{ stroke: '#4f46e5', strokeWidth: 1.8 }} 
                      r={0} 
                    />

                  </ScatterChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>

          {olesRegressionDataset && 'coefs' in olesRegressionDataset ? (
            <div className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-[11px] text-indigo-900 leading-snug">
              📝 <strong>Fórmula de Regresión Resultante:</strong> 
              <span className="font-mono block mt-1 font-bold">
                Retorno({selectedAsset}) = {(olesRegressionDataset.coefs.alphaMonthly * 100).toFixed(4)}% + {olesRegressionDataset.coefs.beta.toFixed(3)} * Retorno({benchmarkDb.ticker.split(' (')[0]})
              </span>
              El coeficiente de determinación <strong className="text-indigo-950">R² = {olesRegressionDataset.coefs.rSquared.toFixed(3)}</strong> indica que el <strong className="text-indigo-950">{(olesRegressionDataset.coefs.rSquared * 100).toFixed(1)}%</strong> de la varianza del activo se explica por fluctuaciones del mercado en general (Riesgo Sistemático).
            </div>
          ) : null}

        </div>

        {/* Security Market Line (SML - CAPM) Chart */}
        <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-base">La Línea del Mercado de Títulos (SML — CAPM)</h3>
            <p className="text-xs text-gray-500 mb-4">Ubicación de los activos según su Beta sistemática vs. Retorno acumulado</p>

            {/* SML Chart */}
            <div className="h-[280px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 15, right: 20, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    type="number" 
                    dataKey="beta" 
                    name="Beta" 
                    tick={{ fontSize: 9 }}
                    domain={[0, 'auto']}
                    label={{ value: 'Riesgo Sistemático (Volatilidad Beta)', position: 'insideBottom', offset: 1, fontSize: 10, fill: '#64748b' }}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="actualReturn" 
                    name="Retorno Real" 
                    unit="%" 
                    tick={{ fontSize: 9 }}
                    label={{ value: 'Retorno Rendimiento Anualizado (%)', angle: -90, position: 'insideLeft', offset: 15, fontSize: 10, fill: '#64748b' }}
                  />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }} 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        if ('requiredReturn' in data && !('actualReturn' in data)) {
                          return (
                            <div className="bg-amber-950 text-white p-2 rounded-lg text-xs">
                              <p className="font-semibold text-yellow-400">Punto de la SML</p>
                              <p>Beta: {data.beta}</p>
                              <p>Retorno Exigido (CAPM): {data.requiredReturn}%</p>
                            </div>
                          );
                        }
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-lg text-xs leading-relaxed max-w-[190px]">
                            <p className="font-bold text-amber-400">{data.ticker} - {data.name}</p>
                            <hr className="my-1 border-slate-700" />
                            <p>Riesgo Sistemático (Beta): <span className="font-bold font-mono">{data.beta}</span></p>
                            <p>Retorno Observado Histórico: <span className="font-bold text-blue-400">{data.actualReturn}%</span></p>
                            <p>Retorno Exigido (CAPM): <span className="font-bold text-amber-300">{data.requiredReturn}%</span></p>
                            <p>Alfa de Jensen: <span className={`font-bold ${data.alpha > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{data.alpha}%</span></p>
                            <p className="mt-1">
                              Fallo: <strong className={data.alpha > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {data.alpha > 0 ? 'Subvalorado (Barato)' : 'Sobrevalorado (Caro)'}
                              </strong>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* 1. Línea SML (CAPM) */}
                  <Scatter 
                    name="SML (Security Market Line)" 
                    data={smlDataset.smlLine.map(p => ({ beta: p.beta, actualReturn: p.requiredReturn, requiredReturn: p.requiredReturn }))} 
                    fill="#f59e0b" 
                    line={{ stroke: '#f59e0b', strokeWidth: 1.8 }} 
                    r={0} 
                  />

                  {/* 2. Activos representados en coordenadas (Beta, Retorno) */}
                  <Scatter name="Activos frente a SML" data={smlDataset.assetsPoints}>
                    {smlDataset.assetsPoints.map((entry, index) => (
                      <Cell 
                        key={`cell-${entry.ticker}`} 
                        fill={entry.actualReturn >= entry.requiredReturn ? '#10b981' : '#f43f5e'} 
                        stroke="#fff"
                        strokeWidth={1}
                        r={4.5}
                      />
                    ))}
                  </Scatter>

                </ScatterChart>
              </ResponsiveContainer>
              
              {/* Leyenda de la SML */}
              <div className="absolute right-3.5 top-3 bg-white/80 backdrop-blur-xs p-1.5 rounded-lg text-[9px] border border-gray-100 space-y-1.5 shadow-sm font-medium">
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Arriba SML: Subvalorado (Alpha &gt; 0)
                </span>
                <span className="flex items-center gap-1.5 text-rose-600">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> Abajo SML: Sobrevalorado (Alpha &lt; 0)
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3.5 bg-amber-50 rounded-lg border border-amber-100 text-[11px] text-amber-900 leading-snug">
            🔍 <strong>Análisis e Interpretación Gráfica de la SML:</strong> 
            El gráfico posiciona todos los activos del estudio. Los activos ubicados en la zona <strong>verde (sobre la SML)</strong> rinden por encima del nivel exigido para su riesgo sistemático; demuestran <strong className="text-emerald-800">Alfa de Jensen Positivo</strong> (Subvalorados en el mercado, atractivos para comprar). Las zonas <strong>rojas (debajo de la SML)</strong> tienen un Alfa de Jensen negativo (Sobrevalorados, caros para el riesgo asumido).
          </div>
        </div>

      </div>

      {/* Tabla CAPM vs Historial (Métricas Rubrica D3) */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Tabla de Valoración de Equilibrio CAPM vs. Histórico</h3>
            <p className="text-xs text-gray-500">Determinación de Alfa de de Jensen y veredicto de valuación para la cartera</p>
          </div>

          {/* Filtros de Tabla */}
          <div className="bg-slate-100 p-0.5 rounded-lg flex text-xs">
            <button
              onClick={() => setValuationFilter('todos')}
              className={`px-3 py-1.5 rounded-md transition-all ${valuationFilter === 'todos' ? 'bg-white font-medium text-slate-900 shadow-xs' : 'text-gray-500 hover:text-slate-800'}`}
            >
              Todos ({smlDataset.assetsPoints.length})
            </button>
            <button
              onClick={() => setValuationFilter('subvalorados')}
              className={`px-3 py-1.5 rounded-md transition-all ${valuationFilter === 'subvalorados' ? 'bg-white font-medium text-emerald-800 shadow-xs' : 'text-gray-500 hover:text-emerald-700'}`}
            >
              Subvalorados ({smlDataset.assetsPoints.filter(a => a.isUndervalued).length})
            </button>
            <button
              onClick={() => setValuationFilter('sobrevalorados')}
              className={`px-3 py-1.5 rounded-md transition-all ${valuationFilter === 'sobrevalorados' ? 'bg-white font-medium text-rose-800 shadow-xs' : 'text-gray-500 hover:text-rose-700'}`}
            >
              Sobrevalorados ({smlDataset.assetsPoints.filter(a => !a.isUndervalued).length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-100 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-gray-200 text-gray-700 font-semibold select-none text-[10px] uppercase tracking-wider">
                <th className="p-3 font-mono">Ticker</th>
                <th className="p-3">Activo</th>
                <th className="p-3 text-right" title="Riesgo Sistemático (Pendiente de Regresión)">Beta (β)</th>
                <th className="p-3 text-center" title="Coeficiente de Determinación (Explicación del Mercado)">R² (Ajuste)</th>
                <th className="p-3 text-right bg-amber-50/50" title="E(Ri) = Rf + Beta * [E(Rm) - Rf]">Retorno Exigido (CAPM)</th>
                <th className="p-3 text-right">Rend. Histórico</th>
                <th className="p-3 text-right font-bold text-indigo-900" title="Retorno Anormal (Histórico - Exigido)">Alfa Jensen (α)</th>
                <th className="p-3 text-center">P-Value (α / β)</th>
                <th className="p-3 text-center">Veredicto</th>
                <th className="p-3">Interpretación del Equilibrio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-600 font-medium">
              {filteredValuations.map((item) => (
                <tr key={item.ticker} className="hover:bg-slate-50/50 transition-all">
                  <td className="p-3 font-mono font-bold text-slate-900">{item.ticker}</td>
                  <td className="p-3 truncate max-w-[150px]">{item.name}</td>
                  
                  {/* Beta */}
                  <td className="p-3 text-right font-mono font-bold text-slate-700">{item.beta.toFixed(3)}</td>
                  
                  {/* Coeficiente R² */}
                  <td className="p-3 text-center font-mono text-gray-500">
                    {(metrics.find(m => m.ticker === item.ticker)?.rSquared || 0).toFixed(3)}
                  </td>
                  
                  {/* CAPM Expected */}
                  <td className="p-3 text-right font-semibold text-amber-700 bg-amber-50/30">
                    {item.requiredReturn.toFixed(2)}%
                  </td>
                  
                  {/* Historical Return */}
                  <td className="p-3 text-right font-semibold text-slate-800">
                    {item.actualReturn.toFixed(2)}%
                  </td>
                  
                  {/* Alfa de Jensen */}
                  <td className={`p-3 text-right font-bold ${item.alpha > 0 ? 'text-emerald-600 bg-emerald-50/30' : 'text-rose-600 bg-rose-50/30'}`}>
                    {item.alpha > 0 ? '+' : ''}{item.alpha.toFixed(2)}%
                  </td>

                  {/* P-Values econometric tests */}
                  <td className="p-3 text-center text-[10px]">
                    <div className="flex flex-col gap-0.5 whitespace-nowrap">
                      <span className={item.pValBeta < 0.05 ? 'text-indigo-600 font-bold' : 'text-gray-400'}>
                        β: {item.pValBeta.toFixed(3)}
                      </span>
                      <span className={item.pValAlpha < 0.05 ? 'text-emerald-600 font-bold' : 'text-gray-400'}>
                        α: {item.pValAlpha.toFixed(3)}
                      </span>
                    </div>
                  </td>

                  {/* Veredicto */}
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      item.isUndervalued 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/50' 
                        : 'bg-rose-100 text-rose-800 border border-rose-200/50'
                    }`}>
                      {item.isUndervalued ? 'SUBVALORADO' : 'SOBREVALORADO'}
                    </span>
                  </td>

                  {/* Interpretación */}
                  <td className="p-3 text-gray-400 font-light text-[11px]">
                    {item.isUndervalued 
                      ? 'Rendimiento excede el riesgo asimilado. Atractivo.' 
                      : 'Cobra poco rendimiento para su nivel de Beta.'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
          <h4 className="text-xs font-bold text-slate-800 uppercase flex items-center gap-1">
             <Scale className="h-4 w-4 text-slate-600" /> Nota sobre el Equilibrio de Mercado y Alfa de Jensen
          </h4>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            El <strong>Alfa de Jensen (α)</strong> representa el retorno anormal del activo por encima de los requerimientos de la SML. Si un activo se encuentra en equilibrio estricto, su Alfa de Jensen debería ser exactamente igual a 0.0%. Un Alfa significativamente superior a cero indica una ineficiencia positiva que el administrador del portafolio puede explotar para generar rendimientos de arbitraje activo.
          </p>
          <p className="text-[11px] text-slate-600 leading-relaxed mt-2 border-t border-slate-200 pt-2">
            <strong className="text-indigo-800">Tests Econométricos (Significancia Estadística):</strong> Los p-values tabulados corresponden a un t-test estándar ($H_0$: coeficiente $= 0$). Un p-value menor a 0.05 (<span className="text-indigo-600 font-bold">en índigo</span>) indica que el coeficiente (ya sea Beta o Alfa) es estadísticamente significativo al nivel de confianza del 95%. Un Alfa no significativo ($p &gt; 0.05$) implica que el rendimiento excedente carece de solidez estadística y bien podría debido únicamente a la varianza muestral aleatoria, en lugar de a la genuina habilidad (habilidad del manager / mispricing del activo).
          </p>
          {riskScore !== null && (
            <div className={`mt-3 p-3 rounded-lg border text-[11px] leading-relaxed ${
              riskScore <= 20 
                ? 'bg-blue-50 border-blue-100 text-blue-900' 
                : riskScore <= 31 
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-950' 
                  : 'bg-rose-50 border-rose-100 text-rose-950'
            }`}>
              <strong>Orientación Estratégica CAPM según su Perfil de Riesgo (Módulo 0):</strong>
              <span className="block mt-1">
                {riskScore <= 20 ? (
                  <span>Como inversor de <strong>Perfil Conservador Estricto</strong> (Aversión A=9.0), su objetivo prioritario en este módulo es buscar activos defensivos con <strong>Beta (β) inferior a 1.0</strong> (como TLT o valores de baja volatilidad). Evite activos con alta Beta sistemática, dado que amplifican las caídas de mercado y destruirán el valor de su cartera de mínima varianza ante shocks macroeconómicos bruscos.</span>
                ) : riskScore <= 31 ? (
                  <span>Como inversor de <strong>Perfil Moderado / Balanceado</strong> (Aversión A=5.0), usted debe buscar un equilibrio óptimo de activos identificando aquellos con <strong>Alfa de Jensen (α) positivo e idealmente con p-value &lt; 0.05</strong>. Estos activos subvalorados añaden valor real ex-post a su portafolio tangente, mejorando el Sharpe ratio global más allá de la línea pasiva de mercado.</span>
                ) : (
                  <span>Como inversor de <strong>Perfil Dinámico / Agresivo</strong> (Aversión A=2.0), el CAPM le enseña a buscar activos ofensivos de crecimiento exponencial con <strong>Beta (β) superior a 1.0</strong> (como AAPL, NVDA o TSLA). Al poseer alta sensibilidad sistemática, estos activos le permiten capturar el apalancamiento implícito de mercado, maximizando el potencial alcista cuando se financie a la tasa libre de riesgo.</span>
                )}
              </span>
            </div>
          )}
        </div>
        
        <div className="mt-8 flex justify-end">
          <button
            onClick={() => {
              if (onNavigateToTab) {
                onNavigateToTab('arbitrage');
              }
            }}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-200"
          >
            Guardar y Continuar (Módulo 4: Arbitraje APT)
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        </div>

      </div>

    </div>
  );
}
