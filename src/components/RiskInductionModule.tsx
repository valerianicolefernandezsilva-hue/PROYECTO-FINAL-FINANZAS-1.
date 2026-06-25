import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Award, Shield, Zap, CheckCircle2, ChevronRight, HelpCircle, 
  Info, TrendingUp, Compass, Settings, AlertCircle, BookOpen, ChevronLeft,
  Coins, Sparkles, Database, FileText
} from 'lucide-react';

interface Question {
  id: number;
  dimension: string;
  questionText: string;
  options: {
    key: string;
    text: string;
    score: number;
  }[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    dimension: 'Dimensión 1: Capacidad Financiera, Liquidez y Horizonte',
    questionText: 'Si hoy invirtiera un capital importante en su portafolio de activos, ¿cuál es el escenario más probable para el uso de esos fondos?',
    options: [
      { key: 'a', text: 'Podría necesitar disponer de este dinero en cualquier momento ante un imprevisto familiar o comercial.', score: 1 },
      { key: 'b', text: 'No planeo tocar este dinero por los próximos 12 a 24 meses.', score: 2 },
      { key: 'c', text: 'Este capital está destinado a metas de mediano plazo (comprar un inmueble, maestría) en unos 3 a 5 años.', score: 3 },
      { key: 'd', text: 'Es un capital excedente que no planeo utilizar en un horizonte menor a 5 o 10 años.', score: 4 }
    ]
  },
  {
    id: 2,
    dimension: 'Dimensión 1: Capacidad Financiera, Liquidez y Horizonte',
    questionText: '¿Cómo describiría la predictibilidad y estabilidad de sus fuentes principales de ingresos para los próximos dos años?',
    options: [
      { key: 'a', text: 'Altamente variables o estacionales (dependo de comisiones, consultorías independientes o éxito de un negocio propio).', score: 1 },
      { key: 'b', text: 'Moderadamente estables, con fluctuaciones previsibles a lo largo del año.', score: 2 },
      { key: 'c', text: 'Muy estables y seguras (salario fijo en una empresa consolidada o contratos de largo plazo).', score: 3 }
    ]
  },
  {
    id: 3,
    dimension: 'Dimensión 1: Capacidad Financiera, Liquidez y Horizonte',
    questionText: 'El dinero que está utilizando para conformar este portafolio de inversión representa:',
    options: [
      { key: 'a', text: 'La mayor parte de los ahorros que poseo para emergencias.', score: 1 },
      { key: 'b', text: 'Un capital destinado al ahorro, pero mantengo un fondo de emergencia separado en el banco.', score: 2 },
      { key: 'c', text: 'Un excedente financiero que, si se llega a perder o disminuir, no afecta mi estilo de vida actual.', score: 3 }
    ]
  },
  {
    id: 4,
    dimension: 'Dimensión 2: Comportamiento ante Escenarios de Mercado',
    questionText: 'Pasados 6 meses, la plataforma le muestra que su portafolio ha sufrido una caída latente del 18% debido a una corrección generalizada del mercado global. ¿Qué acción ejecuta en la interfaz?',
    options: [
      { key: 'a', text: 'Vendo inmediatamente todos los activos para asegurar el dinero restante antes de que siga cayendo.', score: 1 },
      { key: 'b', text: 'Vendo los 3 activos que muestren las mayores pérdidas y paso ese dinero a la tasa libre de riesgo (Rf).', score: 2 },
      { key: 'c', text: 'No realizo ningún movimiento; decido esperar a que el ciclo de mercado se recupere.', score: 3 },
      { key: 'd', text: 'Inyecto más capital al portafolio aprovechando que las acciones están a precios de descuento.', score: 4 }
    ]
  },
  {
    id: 5,
    dimension: 'Dimensión 2: Comportamiento ante Escenarios de Mercado',
    questionText: 'Al revisar el gráfico de dispersión riesgo-rendimiento de su herramienta, ¿qué comportamiento histórico de un activo le haría sentir cómodo al integrarlo a su portafolio?',
    options: [
      { key: 'a', text: 'Un activo cuyos rendimientos anuales históricos se mantengan estables entre +2% y +5%.', score: 1 },
      { key: 'b', text: 'Un activo que en años buenos rinda +12%, pero que en años malos pueda caer hasta -5%.', score: 2 },
      { key: 'c', text: 'Un activo que en años excelentes rinda +25%, aceptando que en crisis pueda llegar a caer un -20%.', score: 3 }
    ]
  },
  {
    id: 6,
    dimension: 'Dimensión 2: Comportamiento ante Escenarios de Mercado',
    questionText: 'Un activo de su portafolio ha subido un 40% en solo tres semanas debido a un reporte de ganancias extraordinario, superando por completo el rendimiento esperado por el modelo CAPM. ¿Cuál es su postura?',
    options: [
      { key: 'a', text: 'Vendo la totalidad de la posición de inmediato para materializar la ganancia en efectivo.', score: 1 },
      { key: 'b', text: 'Mantengo la posición pero coloco una orden de salida automática si el precio empieza a bajar un 5%.', score: 2 },
      { key: 'c', text: 'Mantengo la inversión sin cambios, asumiendo que la tendencia del activo continuará al alza.', score: 3 }
    ]
  },
  {
    id: 7,
    dimension: 'Dimensión 2: Comportamiento ante Escenarios de Mercado',
    questionText: 'La empresa que representa el 20% de su portafolio está bajo una investigación regulatoria imprevista y la cotización de la acción se suspende por 48 horas. No hay datos nuevos en Refinitiv aún. ¿Cómo experimenta esta situación?',
    options: [
      { key: 'a', text: 'Me genera un nivel alto de estrés y preocupación constante por el impacto en mi patrimonio.', score: 1 },
      { key: 'b', text: 'Siento incomodidad, pero prefiero esperar el reporte técnico antes de tomar una decisión emocional.', score: 2 },
      { key: 'c', text: 'Lo asimilo con total tranquilidad; entiendo que los mercados financieros conllevan este tipo de eventos corporativos.', score: 3 }
    ]
  },
  {
    id: 8,
    dimension: 'Dimensión 3: Loterías Conceptuales y Preferencias de Utilidad',
    questionText: 'Imagine que le dan a elegir entre tres esquemas de incentivos para un proyecto financiero de un año de duración. ¿Cuál prefiere firmar?',
    options: [
      { key: 'a', text: 'Un pago fijo garantizado de $3,000 al finalizar el año.', score: 1 },
      { key: 'b', text: 'Un pago fijo de $1,500 más un bono variable de $3,500 que depende de metas alcanzables (50% de probabilidad de lograrse).', score: 2 },
      { key: 'c', text: 'Un esquema puramente variable: $0 garantizados, pero con la posibilidad real de ganar $10,000 si el proyecto es un éxito rotundo.', score: 3 }
    ]
  },
  {
    id: 9,
    dimension: 'Dimensión 3: Loterías Conceptuales y Preferencias de Utilidad',
    questionText: 'Al observar los resultados de su Módulo 2 (Optimización), el sistema le ofrece dos alternativas de ponderación para su dinero. ¿Cuál prefiere?',
    options: [
      { key: 'a', text: 'El Portafolio A, diseñado para mitigar las caídas (baja desviación estándar) sacrificando rendimiento frente a la inflación.', score: 1 },
      { key: 'b', text: 'El Portafolio B, diseñado para maximizar el Ratio de Sharpe (el rendimiento óptimo por cada unidad de riesgo asumido).', score: 2 },
      { key: 'c', text: 'El Portafolio C, que concentra los pesos en las acciones de mayor crecimiento sectorial, asumiendo fluctuaciones drásticas de mes a mes.', score: 3 }
    ]
  },
  {
    id: 10,
    dimension: 'Dimensión 3: Loterías Conceptuales y Preferencias de Utilidad',
    questionText: 'Tiene la oportunidad de aportar $5,000 para la apertura de una sucursal comercial de un amigo. Si el negocio prospera, recuperará $25,000 en dos años. Si el negocio quiebra, perderá el dinero aportado. La probabilidad de éxito es del 30%. ¿Qué decide?',
    options: [
      { key: 'a', text: 'Rechazo la propuesta; la probabilidad de pérdida (70%) es demasiado alta para mi presupuesto.', score: 1 },
      { key: 'b', text: 'Ofrezco prestarle una cantidad mucho menor (ej. $1,000) para limitar mi pérdida máxima si le va mal.', score: 2 },
      { key: 'c', text: 'Acepto participar con los $5,000 completos; el rendimiento potencial justifica el riesgo.', score: 3 }
    ]
  },
  {
    id: 11,
    dimension: 'Dimensión 3: Loterías Conceptuales y Preferencias de Utilidad',
    questionText: 'En su mente, cuando se menciona que un activo financiero analizado mediante regresión OLS tiene una volatilidad muy elevada, usted lo traduce inmediatamente como:',
    options: [
      { key: 'a', text: 'Un peligro inminente de perder el capital invertido.', score: 1 },
      { key: 'b', text: 'Un indicador técnico de incertidumbre que requiere diversificación.', score: 2 },
      { key: 'c', text: 'Una oportunidad matemática para capturar alphas positivos y mayores retornos.', score: 3 }
    ]
  },
  {
    id: 12,
    dimension: 'Dimensión 3: Loterías Conceptuales y Preferencias de Utilidad',
    questionText: 'Le ofrecen un "seguro" de portafolio que le devuelve las pérdidas si el mercado cae, pero contratarlo reduce permanentemente el rendimiento esperado de sus inversiones en un 4% anual. ¿Lo contrataría?',
    options: [
      { key: 'a', text: 'Sí, pagaría con gusto ese costo anual con tal de tener la certeza de no ver números rojos.', score: 1 },
      { key: 'b', text: 'Lo contrataría solo de forma parcial o temporal si veo que el índice de referencia entra en una tendencia bajista.', score: 2 },
      { key: 'c', text: 'No, prefiero asumir las fluctuaciones del mercado por mi cuenta y retener el 100% de los rendimientos.', score: 3 }
    ]
  },
  {
    id: 13,
    dimension: 'Dimensión 3: Loterías Conceptuales y Preferencias de Utilidad',
    questionText: '¿Cuál ha sido su experiencia real previa adquiriendo activos fuera de los tradicionales depósitos bancarios a plazo fijo?',
    options: [
      { key: 'a', text: 'Nunca he invertido en activos de renta variable; prefiero la seguridad de la banca tradicional.', score: 1 },
      { key: 'b', text: 'He comprado ocasionalmente bonos o participado en fondos mutuos conservadores.', score: 2 },
      { key: 'c', text: 'Manejo o he manejado activamente cuentas de corretaje invirtiendo en acciones corporativas o activos digitales.', score: 3 }
    ]
  }
];

interface RiskInductionModuleProps {
  onProfileCalculated: (score: number, aversionCoefficient: number, portfolioTabSuggestion: 'mvp' | 'tangent' | 'custom' | null) => void;
  savedScore: number | null;
  savedCoefficient: number | null;
  onNavigateToTab: (tab: 'importer' | 'risk-return' | 'optimizer' | 'capm' | 'readme') => void;
}

export default function RiskInductionModule({
  onProfileCalculated,
  savedScore,
  savedCoefficient,
  onNavigateToTab
}: RiskInductionModuleProps) {
  // Almacenar respuestas seleccionadas (id de pregunta -> score seleccionado)
  const [answers, setAnswers] = useState<{ [qId: number]: number }>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState<number>(0);
  const [isCompleted, setIsCompleted] = useState<boolean>(savedScore !== null);

  const activeQuestion = QUESTIONS[currentQuestionIdx];

  const handleSelectOption = (qId: number, score: number) => {
    const nextAnswers = { ...answers, [qId]: score };
    setAnswers(nextAnswers);

    // Avanzar automáticamente a la siguiente pregunta después de un breve delay
    if (currentQuestionIdx < QUESTIONS.length - 1) {
      setTimeout(() => {
        setCurrentQuestionIdx(currentQuestionIdx + 1);
      }, 300);
    }
  };

  const calculateResults = () => {
    // Sumar todos los puntajes
    const values = Object.values(answers) as number[];
    const totalScore = values.reduce((sum, current) => sum + current, 0);

    let aversionCoeff = 5;
    let tabSuggestion: 'mvp' | 'tangent' | 'custom' = 'tangent';

    if (totalScore <= 20) {
      aversionCoeff = 9;
      tabSuggestion = 'mvp';
    } else if (totalScore <= 31) {
      aversionCoeff = 5;
      tabSuggestion = 'tangent';
    } else {
      aversionCoeff = 2;
      tabSuggestion = 'tangent'; // Con apalancamiento disponible en el gráfico
    }

    onProfileCalculated(totalScore, aversionCoeff, tabSuggestion);
    setIsCompleted(true);
  };

  const handleReset = () => {
    setAnswers({});
    setCurrentQuestionIdx(0);
    setIsCompleted(false);
    onProfileCalculated(25, 5, 'tangent'); // Valores moderados por defecto al resetear
  };

  const getProfileDetails = (score: number) => {
    if (score <= 20) {
      return {
        title: 'Perfil Conservador Estricto',
        coefficient: '9.0 (Elevado)',
        colorClass: 'text-blue-600 bg-blue-50 border-blue-200',
        bgColor: 'bg-blue-50/50',
        borderColor: 'border-blue-100',
        textColor: 'text-blue-900',
        icon: <Shield className="h-6 w-6 text-blue-600" />,
        description: 'Prioriza absolutamente la preservación de capital y la mitigación de la volatilidad histórica muestral. Muestra una tasa de sustitución marginal muy baja frente al riesgo. Su cartera de activos ideal de equilibrio es el de Mínima Varianza (MVP), minimizando la desviación estándar anualizada agregada.',
        implication: 'El motor financiero de la herramienta le sugiere centrar su atención sobre el Portafolio de Mínima Varianza en el Módulo de Optimización.'
      };
    } else if (score <= 31) {
      return {
        title: 'Perfil Moderado / Balanceado',
        coefficient: '5.0 (Medio)',
        colorClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        bgColor: 'bg-emerald-50/50',
        borderColor: 'border-emerald-100',
        textColor: 'text-emerald-950',
        icon: <Compass className="h-6 w-6 text-emerald-600" />,
        description: 'Busca un equilibrio óptimo entre el rendimiento real frente a la tasa libre de riesgo y la dispersión histórica de la rentabilidad. Concuerda con la maximización matemática de retornos ajustados por riesgo (Ratio de Sharpe).',
        implication: 'El optimizador dirigirá automáticamente su asignación ideal de fondos hacia el Portafolio Tangente de Máxima Eficiencia (Max Sharpe).'
      };
    } else {
      return {
        title: 'Perfil Dinámico / Agresivo',
        coefficient: '2.0 (Moderadamente Bajo)',
        colorClass: 'text-rose-600 bg-rose-50 border-rose-200',
        bgColor: 'bg-rose-50/50',
        borderColor: 'border-rose-100',
        textColor: 'text-rose-950',
        icon: <Zap className="h-6 w-6 text-rose-600" />,
        description: 'Asimila altos niveles de fluctuaciones sistemáticas a cambio de capturar alphas extraordinarios y rentabilidades desproporcionadas. Su aversión al riesgo es notablemente reducida, permitiéndose estructurar combinaciones de activos altamente volátiles.',
        implication: 'La aplicación desbloquea la capacidad gráfica de proyectar la Línea del Mercado de Capitales (CML) hacia la derecha del punto tangente, simulando posiciones financieras apalancadas de mercado.'
      };
    }
  };

  const answeredCount = Object.keys(answers).length;
  const isQuestionnaireValid = answeredCount === QUESTIONS.length;
  const progressPercent = Math.round((answeredCount / QUESTIONS.length) * 100);

  const displayProfile = savedScore ? getProfileDetails(savedScore) : null;

  return (
    <div className="space-y-8" id="module-induction-root">
      
      {/* SECCIÓN DE BIENVENIDA E INDUCCIÓN */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-100 p-6 sm:p-8">
        <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
          <div className="space-y-4 max-w-4xl">
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2.5 py-1 rounded-full border border-indigo-200 uppercase tracking-widest font-mono">
                Módulo Inicial de Control
              </span>
              <span className="text-[10px] bg-slate-100 text-slate-800 px-2.5 py-1 rounded-full border border-slate-200 font-mono">
                Autónomo & Evaluativo
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Módulo 0: Inducción & Calibración de Aversión al Riesgo
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Bienvenido a la <strong>Plataforma de Análisis de Portafolios y Valoración de Activos de Capital</strong>. 
              Esta herramienta le permite modelar carteras de inversión a partir de datos financieros históricos cargados en el sistema, abarcando un universo diversificado de activos líderes del mercado global (acciones corporativas, instrumentos de renta fija, fondos cotizados u otras clases de activos) en contraste directo con su índice de referencia seleccionado.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              {/* Módulo 0.5 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                  <Database className="h-4 w-4" />
                  Módulo 0.5: Carga de Datos
                </div>
                <p className="text-xs text-slate-500 leading-snug">
                  Carga de archivos CSV, consulta en tiempo real vía Yahoo Finance y calibración de la tasa libre de riesgo (Rf).
                </p>
              </div>

              {/* Módulo I */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                  <TrendingUp className="h-4 w-4" />
                  Módulo I: Serie Temporal
                </div>
                <p className="text-xs text-slate-500 leading-snug">
                  Evaluación descriptiva de rentabilidad, volatilidad anualizada, drawdown, Value at Risk (VaR) e indicadores Sharpe/Sortino.
                </p>
              </div>
              
              {/* Módulo II */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase tracking-wider">
                  <Compass className="h-4 w-4" />
                  Módulo II: Optimización
                </div>
                <p className="text-xs text-slate-500 leading-snug">
                  Cálculo matricial de covarianza, trazado de la frontera eficiente de Markowitz (MVP y Tangencial) y la Capital Market Line (CML).
                </p>
              </div>

              {/* Módulo III */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
                  <Award className="h-4 w-4" />
                  Módulo III: Valoración CAPM
                </div>
                <p className="text-xs text-slate-500 leading-snug">
                  Regresión lineal univariada por mínimos cuadrados ordinarios (OLS) para hallar la Beta sistemática y el Alfa de Jensen.
                </p>
              </div>

              {/* Módulo 3.5 */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs uppercase tracking-wider">
                  <Coins className="h-4 w-4 text-emerald-600" />
                  Módulo 3.5: Arbitraje APT
                </div>
                <p className="text-xs text-slate-500 leading-snug">
                  Identificación heurística de ineficiencias de precios mediante Arbitrage Pricing Theory y construcción de carteras de arbitraje puro.
                </p>
              </div>

              {/* Módulo IV */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-rose-700 font-bold text-xs uppercase tracking-wider">
                  <Sparkles className="h-4 w-4 text-rose-500" />
                  Módulo IV: Pronóstico
                </div>
                <p className="text-xs text-slate-500 leading-snug">
                  Simulación de Monte Carlo con Movimiento Browniano Geométrico para proyectar trayectorias de precios y metas financieras.
                </p>
              </div>

              {/* Módulo Reporte */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1 sm:col-span-2 lg:col-span-3">
                <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                  <FileText className="h-4 w-4 text-indigo-600" />
                  Reporte Ejecutivo & Auditoría
                </div>
                <p className="text-xs text-slate-500 leading-snug">
                  Consolidado integral interactivo con gráficos dinámicos de dispersión SML, análisis de Alfas y exportación institucional a formato PDF.
                </p>
              </div>
            </div>
          </div>
          
          <div className="w-full md:w-auto shrink-0 bg-slate-900 text-white rounded-2xl p-5 border border-slate-800 text-sm max-w-sm">
            <span className="font-mono text-indigo-400 text-xs font-bold block mb-1">AUDITORÍA METODOLÓGICA</span>
            <span className="text-slate-100 font-bold text-base block">Calibración Algorítmica</span>
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
              Para evitar sesgos cognitivos o falsificaciones de autopercepción de tolerancia, este módulo procesa en silencio sus respuestas en escenarios económicos críticos. Su puntaje dictará la aversión al riesgo (A) inyectada dinámicamente en los marcos de optimización matemática del sistema.
            </p>
          </div>
        </div>
      </div>

      <div className="w-full">
        
        {/* PANEL DE CUESTIONARIO COMPLETO */}
        <div className="bg-white rounded-xl shadow-xs border border-slate-100 p-6 flex flex-col justify-between min-h-[440px]">
          
          {!isCompleted ? (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div>
                {/* Cabecera del Cuestionario */}
                <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                  <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest font-mono">
                    {activeQuestion.dimension}
                  </span>
                  <span className="text-xs text-slate-500 font-mono font-semibold">
                    Pregunta {currentQuestionIdx + 1} de {QUESTIONS.length}
                  </span>
                </div>

                {/* Barra de Progreso */}
                <div className="w-full h-1.5 bg-slate-100 rounded-full mb-6 overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                {/* Pregunta Activa */}
                <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                  {activeQuestion.questionText}
                </h3>

                {/* Opciones */}
                <div className="space-y-2.5 mt-6">
                  {activeQuestion.options.map((option) => {
                    const isSelected = answers[activeQuestion.id] === option.score;
                    return (
                      <button
                        key={option.key}
                        onClick={() => handleSelectOption(activeQuestion.id, option.score)}
                        className={`w-full text-left p-4 rounded-xl text-xs sm:text-sm border transition-all flex items-start gap-3 ${
                          isSelected 
                            ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950 font-semibold shadow-xs' 
                            : 'bg-white hover:bg-slate-50 hover:border-slate-300 border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full border flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                          isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-slate-50 text-slate-500'
                        }`}>
                          {option.key.toUpperCase()}
                        </span>
                        <span className="leading-relaxed">{option.text}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Botonera de Navegación del Cuestionario */}
              <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-6">
                <button
                  disabled={currentQuestionIdx === 0}
                  onClick={() => setCurrentQuestionIdx(currentQuestionIdx - 1)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Atrás
                </button>

                <div className="flex gap-2">
                  {currentQuestionIdx < QUESTIONS.length - 1 ? (
                    <button
                      disabled={answers[activeQuestion.id] === undefined}
                      onClick={() => setCurrentQuestionIdx(currentQuestionIdx + 1)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-850 text-white disabled:opacity-40"
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      disabled={!isQuestionnaireValid}
                      onClick={calculateResults}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs disabled:opacity-40"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Procesar Diagnóstico
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div className="text-center py-6">
                <div className="inline-flex p-3 bg-indigo-100 text-indigo-700 rounded-full mb-3.5 border border-indigo-200">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">Diagnóstico Heurístico Procesado con Éxito</h3>
                <p className="text-xs text-slate-500 mt-1.5 max-w-md mx-auto">
                  El sistema ha analizado las 13 respuestas multidimensionales sin sesgo de optimismo para inyectar los coeficientes correspondientes.
                </p>

                {displayProfile && (
                  <div className="mt-6 border border-slate-100 rounded-2xl p-5 bg-slate-50/50 max-w-xl mx-auto text-left space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {displayProfile.icon}
                        <span className="font-bold text-slate-900 text-base">{displayProfile.title}</span>
                      </div>
                      <span className="px-3 py-1 bg-slate-900 text-white rounded-md text-xs font-mono font-bold leading-none">
                        Puntaje: {savedScore} / 41
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-y border-slate-105 py-3 font-mono text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-sans">Aversión al Riesgo (A)</span>
                        <strong className="text-slate-800 text-sm font-bold">{displayProfile.coefficient}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block uppercase font-sans">Efecto Asignación</span>
                        <strong className="text-indigo-700 text-sm font-bold">Consistente activo</strong>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      {displayProfile.description}
                    </p>

                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-2 text-xs text-indigo-900">
                      <Info className="h-4 w-4 shrink-0 text-indigo-600 mt-0.5" />
                      <p className="font-medium leading-relaxed">{displayProfile.implication}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center border-t border-slate-100 pt-4 mt-6">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200"
                >
                  Reiniciar Cuestionario
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={() => onNavigateToTab('importer')}
                    className="px-4 py-2 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200"
                  >
                    Módulo 0.5: Gestor de Activos
                  </button>
                  <button
                    onClick={() => onNavigateToTab('risk-return')}
                    className="px-4 py-2.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    Ir al Módulo 1: Análisis Individual
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
