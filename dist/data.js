export const DATA_META = {
  mode: "demo",
  label: "审计演示快照 · 构造数据",
  asOf: "2026-10-09T07:00:00.000Z",
  reportPeriod: "2026Q2 / TTM",
  note: "默认数据仅用于验证产品流程，不代表真实行情。导入扶摇标准化数据后，所有结论将自动重算。",
};

const src = (endpoint, field, unit, asOf = DATA_META.asOf) => ({
  provider: "扶摇接口契约（演示值）", endpoint, field, unit, asOf,
});

const raw = [
  ["600036.SH", "招商银行", "银行", 42.18, 9.8, 4.1, 15.6, 7.2, 1.05, 1.42, -7.8, 18.6, [1.2,-0.8,2.1,3.6,-1.1,1.8,0.6,2.4,-0.4,1.6,0.7,2.2]],
  ["600519.SH", "贵州茅台", "食品饮料", 1588.20, 10.4, 2.6, 31.8, 22.7, 7.4, 1.55, -8.1, 26.5, [0.6,1.8,-2.1,2.4,1.2,-0.9,1.5,0.4,-1.3,2.1,0.9,1.4]],
  ["000333.SZ", "美的集团", "家用电器", 79.64, 11.6, 3.8, 24.1, 15.9, 3.1, 1.72, -9.6, 31.2, [1.1,2.4,-1.2,1.8,0.7,1.4,-0.5,2.8,1.1,-0.7,1.9,0.8]],
  ["601318.SH", "中国平安", "非银金融", 58.73, 7.1, 5.2, 13.4, 8.8, 1.12, 1.91, -11.8, 42.1, [2.1,-1.6,1.8,0.4,2.9,-0.8,1.7,0.8,-1.1,3.2,0.5,1.1]],
  ["600276.SH", "恒瑞医药", "医药生物", 62.40, 18.7, 6.6, 14.8, 43.6, 7.1, 2.36, -13.2, 24.7, [-1.4,3.2,2.1,-2.4,4.1,0.7,-1.8,2.8,1.6,-0.9,2.4,1.3]],
  ["300750.SZ", "宁德时代", "电力设备", 318.50, 12.9, 7.3, 20.2, 28.6, 5.6, 3.18, -17.5, 66.8, [4.2,-3.8,5.1,-2.7,3.6,-1.2,4.8,-3.1,2.4,1.7,-2.2,3.9]],
  ["600887.SH", "伊利股份", "食品饮料", 31.26, 5.6, 1.2, 18.5, 16.4, 3.0, 1.63, -8.9, 20.3, [0.8,1.1,-0.6,1.4,0.2,0.9,-0.3,1.6,0.4,-0.5,1.2,0.7]],
  ["002475.SZ", "立讯精密", "电子", 48.80, 15.2, 4.9, 19.6, 24.8, 4.9, 2.58, -14.4, 39.6, [2.8,-1.4,3.2,-0.8,2.1,1.7,-2.6,3.8,0.9,-1.1,2.6,1.5]],
  ["000651.SZ", "格力电器", "家用电器", 45.12, 8.4, 3.1, 22.7, 8.1, 1.9, 1.48, -6.6, 21.8, [1.0,0.5,-0.7,1.9,0.8,1.1,-0.4,1.3,0.6,-0.2,1.5,0.9]],
  ["601012.SH", "隆基绿能", "电力设备", 21.38, -16.8, -2.4, -3.1, null, 2.2, 3.42, -22.7, 35.4, [-2.1,1.4,-3.6,2.2,-1.8,0.7,-4.1,2.6,-1.3,1.1,-2.8,0.9]],
  ["600309.SH", "万华化学", "基础化工", 82.16, 6.2, 3.4, 16.1, 13.7, 2.1, 2.14, -12.1, 28.8, [1.6,-0.9,2.2,0.4,-1.1,1.8,0.6,1.3,-0.7,2.0,0.5,1.1]],
  ["688981.SH", "中芯国际", "电子", 108.35, 21.4, 8.2, null, 82.5, 4.3, 3.72, -19.6, 74.2, [5.4,-4.2,6.1,-3.7,4.8,-2.9,5.7,-4.6,3.2,2.1,-3.4,4.6]],
];

export const STOCKS = raw.map(([code,name,industry,close,revenue_yoy,revenue_accel,roe,pe_ttm,pb_mrq,volatility_20d,drawdown_60d,turnover_20d,returns]) => ({
  code,name,industry,close,revenue_yoy,revenue_accel,roe,pe_ttm,pb_mrq,volatility_20d,drawdown_60d,turnover_20d,returns,
  sources: {
    close: src("/api/a-share/prices/snapshot", "last_price", "元"),
    revenue_yoy: src("/api/a-share/financials/indicators", "operating_revenue_growth_ratio", "%", DATA_META.reportPeriod),
    revenue_accel: src("派生计算", "revenue_yoy(t)-revenue_yoy(t-1)", "百分点", DATA_META.reportPeriod),
    roe: src("/api/a-share/financials/indicators", "weighted_roe", "%", DATA_META.reportPeriod),
    pe_ttm: src("/api/a-share/valuations/snapshot", "pe_ttm", "倍"),
    pb_mrq: src("/api/a-share/valuations/snapshot", "pb_mrq", "倍"),
    volatility_20d: src("派生计算", "std(daily_return,20)，非年化", "%", DATA_META.asOf),
    drawdown_60d: src("派生计算", "min(close/rolling_peak-1,60)", "%", DATA_META.asOf),
    turnover_20d: src("/api/a-share/prices/history", "avg(turnover,20)", "亿元", DATA_META.asOf),
  },
}));

export const BENCHMARK_RETURNS = [0.7,-0.4,1.5,1.1,0.6,-0.3,1.2,0.5,-0.8,1.4,0.4,0.9];
