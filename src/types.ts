/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AssetData } from './data/refinitiv_data';

export interface PerformanceMetrics {
  ticker: string;
  name: string;
  sector: string;
  type: string;
  annualReturn: number;       // Promedio anualizado
  annualVolatility: number;   // Volatilidad anualizada
  sharpeRatio: number;        // Sharpe Ratio (basado en Rf libre de riesgo)
  sortinoRatio: number;       // Sortino Ratio
  maxDrawdown: number;        // drawdown máximo
  var95: number;              // Value at Risk mensual
  cvar95: number;             // Expected Shortfall mensual
  calmarRatio: number;        // Calmar
  beta: number;               // Beta frente a mercado
  alphaJensen: number;        // Alfa de Jensen anualizado
  rSquared: number;           // R cuadrado de regresión
  tStatBeta: number;          // t-statistic para beta
  pValBeta: number;           // p-value para beta
  tStatAlpha: number;         // t-statistic para alpha
  pValAlpha: number;          // p-value para alpha
}
