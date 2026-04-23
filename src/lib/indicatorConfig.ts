export const AR_BANDS_DEFAULT_CONFIG = {
  inputs: {
    kernelSource: 'close',
    theme: 'tropic',
    kernelType: 'rational',
    bandwidth: 30,
    shapeAlpha: 1,
    period: 20,
    phase: 2,
    filter: 'smooth',
    baseMultiplier: 1,
    spacingMode: 'linear',
    residualWindow: 100,
    showSigma1: true,
    showSigma2: true,
    showSigma3: true,
    fillOpacity: 15,
  },
  signalSystem: {
    showRombSignals: true,
    kernelTrendConfluence: true,
    warmUpBars: 3,
    cooldownGap: 8,
  },
  visual: {
    fairValueWidth: 2,
    bandLineWidth: 1,
    barColoring: false,
    showDashboard: true,
    dashboardMode: 'dark',
    dashboardPosition: 'top-right',
    dashboardSize: 'small',
  },
  alerts: {
    bullishTrendFlip: true,
    bearishTrendFlip: true,
    buyRomb: true
  }
};
