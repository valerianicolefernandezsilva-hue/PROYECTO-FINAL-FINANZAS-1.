/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ASSETS_DATABASE, BENCHMARK_DATABASE } from '../data/refinitiv_data';
import { 
  calculateReturns, 
  mean, 
  standardDeviation, 
  calculateMaxDrawdown, 
  calculateDownsideDeviation, 
  calculateHistoricalVaR95, 
  calculateExpectedShortfall95, 
  estimateOLS 
} from './finance_math';
import { PerformanceMetrics } from '../types';

/**
 * Computa de forma unificada el set completo de indicadores para todos los activos
 * basándose en una tase libre de riesgo anualizada dinámica.
 */
export function computeAllMetrics(
  rfAnnual: number,
  periodsPerYear: number = 12,
  assetsDb = ASSETS_DATABASE,
  benchmarkDb = BENCHMARK_DATABASE
): PerformanceMetrics[] {
  const benchmarkPrices = benchmarkDb.prices;
  const benchmarkReturns = calculateReturns(benchmarkPrices);
  const benchmarkAnnReturn = mean(benchmarkReturns) * periodsPerYear;
  const rfPeriodic = rfAnnual / periodsPerYear;

  return assetsDb.map(asset => {
    const assetReturns = calculateReturns(asset.prices);
    
    // 1. Retorno esperado anualizado
    const annualReturn = mean(assetReturns) * periodsPerYear;
    
    // 2. Volatilidad anualizada
    const annualVolatility = standardDeviation(assetReturns) * Math.sqrt(periodsPerYear);
    
    // 3. Sharpe Ratio
    const sharpeRatio = annualVolatility === 0 ? 0 : (annualReturn - rfAnnual) / annualVolatility;
    
    // 4. Sortino Ratio
    const downsideDevPeriodic = calculateDownsideDeviation(assetReturns, rfPeriodic);
    const annualDownsideVolatility = downsideDevPeriodic * Math.sqrt(periodsPerYear);
    const sortinoRatio = annualDownsideVolatility === 0 ? 0 : (annualReturn - rfAnnual) / annualDownsideVolatility;
    
    // 5. Máximo Drawdown
    const maxDrawdown = calculateMaxDrawdown(asset.prices);
    
    // 6. Value at Risk
    const var95 = calculateHistoricalVaR95(assetReturns);
    
    // 7. Conditional Value at Risk
    const cvar95 = calculateExpectedShortfall95(assetReturns, var95);
    
    // 8. Calmar Ratio
    const calmarRatio = maxDrawdown === 0 ? 0 : annualReturn / maxDrawdown;
    
    // 9. Beta por regresión OLS y R_cuadrado (R^2)
    const ols = estimateOLS(assetReturns, benchmarkReturns, periodsPerYear);
    
    // 10. Alfa de Jensen anualizado: R_i - [ R_f + Beta_i * (R_m - R_f) ]
    const expectedCapmReturn = rfAnnual + ols.beta * (benchmarkAnnReturn - rfAnnual);
    const alphaJensen = annualReturn - expectedCapmReturn;

    return {
      ticker: asset.ticker,
      name: asset.name,
      sector: asset.sector,
      type: asset.type,
      annualReturn,
      annualVolatility,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
      var95,
      cvar95,
      calmarRatio,
      beta: ols.beta,
      alphaJensen,
      rSquared: ols.rSquared,
      tStatBeta: ols.tStatBeta,
      pValBeta: ols.pValBeta,
      tStatAlpha: ols.tStatAlpha,
      pValAlpha: ols.pValAlpha
    };
  });
}
