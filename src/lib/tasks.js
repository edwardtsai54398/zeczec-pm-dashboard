/**
 * id
 * n: task name
 * p: String, phase
 * h: work hours
 * d: Array, dependency task ids
 * w: wait, unit w
 * minStart: {
 *  baseline: "svS" || "svE" || "cpS" || "cpE";
 *  direction?: "pre" || "post";
 *  d?: calculate days from baseline;
 *  unit?: "w" || "c" (workDay or calendarDay)unit of calculation day from baseline 
 * },
 * dl: {
 *  baseline: "svS" || "svE" || "cpS" || "cpE";
 *  direction?: "pre" || "post";
 *  d?: calculate days from baseline;
 *  unit?: "w" || "c" (workDay or calendarDay)unit of calculation day from baseline 
 * }
 */

export const BT = [
  // ── 1-B（開案後前期準備）──────────────────────────────────────────────────────
  { id: "1B.1", n: "產品詳細資料表",                 p: "1B", h: 0.5, d: [],        w: 2, pm: 0.5, dl: { baseline:"svS" } },
  { id: "1B.2", n: "法人商業檔案表",                 p: "1B", h: 0,   d: [],        w: 0, pm: 0,   dl: { baseline:"svS" } },
  { id: "1B.3", n: "金流申請",                       p: "1B", h: 0.5, d: [],      w: 7, pm: 0.5, dl: { baseline:"svS" } },
  { id: "1B.4", n: "嘖嘖開案申請",                   p: "1B", h: 0.5, d: [],       w: 0, pm: 0.5, dl: { baseline:"svS" } },
  { id: "1B.5", n: "LINE帳號權限＆付費訊息用量",     p: "1B", h: 0.5, d: [],        w: 0, pm: 0.5, dl: { baseline:"svS" } },
  { id: "1B.6", n: "Mailchimp帳號＆付費方案",        p: "1B", h: 0.5, d: [],       w: 0, pm: 0.5, dl: { baseline:"svS" } },

  // ── 2（問卷階段）──────────────────────────────────────────────────────────────
  { id: "2.1",  n: "問卷頁面-文字＆圖片企劃&廣告企劃",    p: "2", h: 9,   d: [],              w: 2, pm: 7,   dl: { baseline:"svS" }, imp: true },
  { id: "2.2",  n: "影片企劃＋平面攝影企劃-初版",        p: "2", h: 12,  d: ["2.1"],         w: 2, pm: 12,  dl: { baseline:"svS" }, imp: true },
  { id: "2.3",  n: "影片企劃＋平面攝影企劃-調整＋Final", p: "2", h: 4,   d: ["2.2"],         w: 0, pm: 4,   dl: { baseline:"svS" } },
  { id: "2.4",  n: "影片拍攝＋平面攝影-前置會議",        p: "2", h: 1,   d: ["2.3"],         w: 0, pm: 1,   dl: { baseline:"svS" }, ns: true },
  { id: "2.5",  n: "影片拍攝＋平面拍攝",                 p: "2", h: 8,   d: ["2.4"],         w: 0, pm: 8,   dl: { baseline:"svS" }, ns: true  },
  { id: "2.6",  n: "影片過稿-A copy＋Final",             p: "2", h: 2,   d: ["2.5"],         w: 0, pm: 2,   dl: { baseline:"svS" } },
  { id: "2.7",  n: "毛片挑選＆精修照確認",               p: "2", h: 3,   d: ["2.5"],         w: 0, pm: 3,   dl: { baseline:"svS" } },
  { id: "2.8",  n: "問卷頁面-圖片設計（外包）",          p: "2", h: 0,   d: ["2.7"],         w: 4, pm: 0,   dl: { baseline:"svS" } },
  { id: "2.9",  n: "問卷建立＆設定",                     p: "2", h: 1,   d: ["2.8", "2.6"],  w: 1, pm: 1,   dl: { baseline:"svS" } },
  { id: "2.10", n: "官方LINE@圖文選單設定：問卷期間",    p: "2", h: 1,   d: [],                 w: 0, pm: 1,   dl: { baseline:"svS" } },
  { id: "2.11", n: "官方LINE@歡迎訊息設定：問卷期間",    p: "2", h: 0.5, d: [],               w: 0, pm: 0.5, dl: { baseline:"svS" } },
  { id: "2.12", n: "問卷上線社群貼文文案＋圖片",         p: "2", h: 1,   d: [],              w: 0, pm: 1,   dl: { baseline:"svS" } },
  { id: "2.13", n: "問卷抽獎社群貼文文案＋圖片",         p: "2", h: 1,   d: [],              w: 0, pm: 1,   dl: { baseline:"svS" } },
  { id: "2.14", n: "粉絲團授權",                      p: "2", h: 0.5, d: [],              w: 0, pm: 0.5, dl: { baseline:"svS",direction:"pre",d:10,unit:"w" } },
  { id: "2.15", n: "廣告帳號建立",                    p: "2", h: 0.5, d: [],              w: 0, pm: 0.5, dl: { baseline:"svS",direction:"pre",d:10,unit:"w" } },
  { id: "2.16", n: "付款方式設定",                     p: "2", h: 0.5, d: [],              w: 0, pm: 0.5, dl: { baseline:"svS",direction:"pre",d:10,unit:"w" } },
  { id: "2.17", n: "問卷廣告-像素建立＆設定",            p: "2", h: 1,   d: ["2.9", "2.15"],  w: 0, pm: 1,   dl: { baseline:"svS" } },
  { id: "2.18", n: "問卷廣告-像素測試",                  p: "2", h: 0.5, d: ["2.17"],        w: 0, pm: 0.5, dl: { baseline:"svS" } },
  { id: "2.19", n: "問卷廣告-設定",                      p: "2", h: 3,   d: ["2.8"],        w: 0, pm: 3,   dl: { baseline:"svS" } },
  { id: "2.20", n: "問卷開跑",                           p: "2", h: 0,   d: ["2.19", "2.18"], w: 0, pm: 0,  dl: { baseline:"svS" } },
  { id: "2.21", n: "問卷廣告-成效報告",                  p: "2", h: 2,   d: [],              w: 0, pm: 2, minStart: {baseline:"svS", direction:"post",d:30,unit:"c"}, dl: { baseline:"cpS", d:5, direction: "pre", unit:"w" } },

  // ── 3（募資頁面企劃＆建置）────────────────────────────────────────────────────
  { id: "3.1", n: "網頁企劃-大綱",               p: "3", h: 6,  d: [], w: 0, pm: 6,  dl: { baseline:"cpS" } },
  { id: "3.2", n: "網頁企劃-初版",               p: "3", h: 12, d: ["3.1"],  w: 2, pm: 12, dl: { baseline:"cpS" }, imp: true },
  { id: "3.3", n: "網頁企劃-調整＋Final",        p: "3", h: 4,  d: ["3.2"],  w: 0, pm: 4,  dl: { baseline:"cpS" } },
  { id: "3.4", n: "網頁設計-前置會議",           p: "3", h: 1,  d: ["3.3"],  w: 0, pm: 1,  dl: { baseline:"cpS" } },
  { id: "3.5", n: "網頁設計-設計製作（外包）",   p: "3", h: 0,  d: ["3.4"],  w: 7, pm: 0,  dl: { baseline:"cpS" } },
  { id: "3.6", n: "網頁設計-過稿＋Final",        p: "3", h: 4,  d: ["3.5"],  w: 0, pm: 4,  dl: { baseline:"cpS" } },
  { id: "3.7", n: "網頁長條圖-圖文建置",         p: "3", h: 4,  d: ["3.6"],  w: 2, pm: 4,  dl: { baseline:"cpS" } },

  // ── 4-A（KOL前置工作）────────────────────────────────────────────────────────
  { id: "4A.1", n: "付費名單搜集（20人）", p: "4A", h: 3, d: [],         w: 2, pm: 3, dl: { baseline:"cpS",direction:"pre",d:20,unit:"w" }, imp: true },
  { id: "4A.2", n: "詢問報價（20人）",     p: "4A", h: 2, d: ["4A.1"],  w: 0, pm: 2, dl: { baseline:"cpS",direction:"pre",d:20,unit:"w" } },
  { id: "4A.3", n: "敲定合作（5~7人）",    p: "4A", h: 2, d: ["4A.2"],  w: 0, pm: 2, dl: { baseline:"cpS",direction:"pre",d:20,unit:"w" } },
  { id: "4A.4", n: "簽約（5~7人）",        p: "4A", h: 1, d: ["4A.3"],  w: 0, pm: 1, dl: { baseline:"cpS",direction:"pre",d:20,unit:"w" } },


  // ── 5（廣告投放）─────────────────────────────────────────────────────────────
  { id: "5.1", n: "募資廣告-像素建立＆設定", p: "5", h: 1,   d: ["2.16"],   w: 0, pm: 1,   minStart: { baseline:"svS" },dl: { baseline:"cpS",d:10,direction:"pre",unit:"w" } },
  { id: "5.2", n: "募資廣告-像素測試",       p: "5", h: 0.5, d: ["5.1"],   w: 0, pm: 0.5, minStart: { baseline:"svS" },dl: { baseline:"cpS",d:10,direction:"pre",unit:"w" } },
  { id: "5.3", n: "募資廣告-設定",           p: "5", h: 3,   d: ["5.2"],   w: 0, pm: 3,   minStart: { baseline:"svS" },dl: { baseline:"cpS",d:10,direction:"pre",unit:"w" } },

  // ── 6（募資設定）─────────────────────────────────────────────────────────────
  { id: "6.1", n: "後台設定",                        p: "6", h: 0.5, d: [],        w: 0, pm: 0.5, minStart: { baseline:"svS" },dl: { baseline:"cpS" } },
  { id: "6.2", n: "計畫回饋設定",                    p: "6", h: 1,   d: ["6.1"],   w: 0, pm: 1,   minStart: { baseline:"svS" }, dl: { baseline:"cpS" } },
  { id: "6.3", n: "常見問題設定",                    p: "6", h: 0,   d: ["6.2"],   w: 0, pm: 0,   minStart: { baseline:"svS" }, dl: { baseline:"cpS" } },
  { id: "6.4", n: "EDM再行銷設定",                   p: "6", h: 0.5, d: ["6.3"],   w: 0, pm: 0.5, minStart: { baseline:"svS" }, dl: { baseline:"cpS" } },
  { id: "6.5", n: "官方LINE@圖文選單設定：募資期間", p: "6", h: 1,   d: ["6.4"],   w: 0, pm: 1,   minStart: { baseline:"svS" }, dl: { baseline:"cpS" } },
  { id: "6.6", n: "官方LINE@歡迎訊息設定：募資期間", p: "6", h: 0.5, d: ["6.5"],   w: 0, pm: 0.5, minStart: { baseline:"svS" }, dl: { baseline:"cpS" } },

  // ── 7（行銷推廣）─────────────────────────────────────────────────────────────
  // 前期（發文任務用 tm 標記發文時間點，製作任務 deadline = 發文日-5cd）
  { id: "7.1",  n: "建立募資期間社群貼文表",          p: "7", h: 0.5, d: [],       w: 0, pm: 0.5, minStart: { baseline:"svS" },                             dl: { baseline:"cpS" } },
  { id: "7.2",  n: "募資倒數七天貼文-文案＋圖片製作", p: "7", h: 2.5, d: ["7.1"],  w: 0, pm: 2.5, minStart: { baseline:"svS" },                              dl: { baseline:"cpS",direction:"pre",d:12,unit:"c" } },
  { id: "7.3",  n: "募資倒數七天社群貼文上線",        p: "7", h: 0,   d: ["7.2"],  w: 0, pm: 0,  minStart: { baseline:"cpS",direction:"pre",d:7,unit:"c" }, dl: { baseline:"cpS",direction:"pre",d:7,unit:"c" } },
  { id: "7.4",  n: "募資倒數三天貼文-文案＋圖片製作", p: "7", h: 0.5, d: [],       w: 0, pm: 0.5, minStart: { baseline:"svS" },                              dl: { baseline:"cpS",direction:"pre",d:8,unit:"c" } },
  { id: "7.5",  n: "募資倒數三天社群貼文上線",        p: "7", h: 0,   d: ["7.4"],  w: 0, pm: 0,  minStart: { baseline:"cpS",direction:"pre",d:3,unit:"c" }, dl: { baseline:"cpS",direction:"pre",d:3,unit:"c" } },
  { id: "7.6",  n: "募資倒數一天貼文-文案＋圖片製作", p: "7", h: 1,   d: [],       w: 0, pm: 1,   minStart: { baseline:"svS" },                              dl: { baseline:"cpS",direction:"pre",d:6,unit:"c" }},
  { id: "7.7",  n: "募資倒數一天社群貼文上線",        p: "7", h: 0,   d: ["7.6"],  w: 0, pm: 0,  minStart: { baseline:"cpS",direction:"pre",d:1,unit:"c" }, dl: { baseline:"cpS",direction:"pre",d:1,unit:"c" } },
  { id: "7.8",  n: "募資開賣上線",                    p: "7", h: 0,   d: [],       w: 0, pm: 0, minStart: { baseline:"cpS" },                             dl:{baseline:"cpS"} },
  // 開賣後（發文日依活動上線日往後推N曆天；製作任務 deadline = 發文日-3wd）
  { id: "7.9",  n: "募資開賣貼文-文案＋圖片製作",     p: "7", h: 2.5, d: [],       w: 0, pm: 2.5, minStart: { baseline:"svS" },          dl:{baseline:"cpS", direction:"pre",d:3,unit:"w"} },
  { id: "7.10", n: "募資開賣社群貼文上線",            p: "7", h: 0,   d: ["7.9"],  w: 0, pm: 0,  minStart: { baseline:"cpS" },          dl:{baseline:"cpS"} },

  // ── 8（募資期間行銷）─────────────────────────────────────────────────────────
  { id: "8.1",  n: "募資開賣隔天達標貼文-文案＋圖片製作",     p: "8", h: 0.6, d: [],      w: 0, pm: 0.6, minStart: { baseline:"svS" },                                 dl:{baseline:"cpS", direction:"pre",d:4,unit:"w"} },
  { id: "8.2",  n: "募資開賣隔天達標社群貼文上線",            p: "8", h: 0,   d: ["8.1"], w: 0, pm: 0,  minStart: { baseline:"cpS", direction:"post",d:1,unit:"c" },  dl:{baseline:"cpS", direction:"post",d:1,unit:"c"} },
  { id: "8.3",  n: "第一波倒數貼文-文案＋圖片製作",          p: "8", h: 0.6, d: [],      w: 0, pm: 0.6, minStart: { baseline:"cpS" },                                 dl:{baseline:"cpS", direction:"post",d:19,unit:"c"} },
  { id: "8.4",  n: "第一波倒數社群貼文上線",                p: "8", h: 0,   d: ["8.3"], w: 0, pm: 0,   minStart: { baseline:"cpS",direction:"post",d:23,unit:"c" },  dl:{baseline:"cpS", direction:"post",d:23,unit:"c"} },
  { id: "8.5",  n: "好評延長貼文-文案＋圖片製作",            p: "8", h: 1.1, d: [],      w: 0, pm: 1.1, minStart: { baseline:"cpS" },                                 dl:{baseline:"cpS", direction:"post",d:25,unit:"c"} },
  { id: "8.6",  n: "好評延長社群貼文上線",                  p: "8", h: 0,   d: ["8.5"], w: 0, pm: 0,   minStart: {baseline:"cpS", direction:"post",d:30,unit:"c"},  dl:{baseline:"cpS", direction:"post",d:30,unit:"c"} },
  { id: "8.7",  n: "最後倒數貼文-文案＋圖片製作",            p: "8", h: 0.6, d: [],      w: 0, pm: 0.6, minStart: { baseline:"cpS" },                                 dl:{baseline:"cpE", direction:"pre",d:11,unit:"c"} },
  { id: "8.8",  n: "最後倒數社群貼文上線",                  p: "8", h: 0,   d: ["8.7"], w: 0, pm: 0,   minStart: {baseline:"cpE", direction:"pre",d:7,unit:"c"},   dl:{baseline:"cpE", direction:"pre",d:7,unit:"c"} },
  { id: "8.9",  n: "圓滿成功貼文-文案＋圖片製作",            p: "8", h: 0.6, d: [],      w: 0, pm: 0.6, minStart: { baseline:"cpS" },                                 dl:{baseline:"cpE", direction:"pre",d:3,unit:"c"}},
  { id: "8.10", n: "圓滿成功社群貼文上線",                  p: "8", h: 0,   d: ["8.9"], w: 0, pm: 0,   minStart: {baseline:"cpE", direction:"post",d:1,unit:"c"},   dl:{baseline:"cpE", direction:"post",d:1,unit:"c"} },

  // ── 9（募資後續）─────────────────────────────────────────────────────────────
  { id: "9.1",  n: "專案更新：出貨進度",      p: "9", h: 0.5, d: [],      w: 7,  pm: 0.5, minStart: { baseline:"cpE" } },
  { id: "9.2",  n: "結案報告簡報製作",       p: "9", h: 4,   d: [""],    w: 0, pm: 4,   minStart: { baseline:"cpE",direction:"post",d:7,unit:"w" } },
  { id: "9.3",  n: "結案報告",              p: "9", h: 1,   d: ["9.2"], w: 0, pm: 1,   minStart: { baseline:"cpE",direction:"post",d:7,unit:"w" },dl:{baseline:"cpE", direction:"post",d:14,unit:"w"}},
];

export const PH = {
  "1A": { n: "前置準備",     c: "#8B85D6", tone: "lavender" },
  "1B": { n: "開案後準備",   c: "#8B85D6", tone: "lavender" },
  2:    { n: "問卷階段",     c: "#8FA856", tone: "lime" },
  3:    { n: "頁面建置",     c: "#D58968", tone: "peach" },
  "4A": { n: "KOL前置",     c: "#C97492", tone: "rose" },
  5:    { n: "廣告投放",     c: "#5E94C2", tone: "sky" },
  6:    { n: "募資設定",     c: "#E8A87C", tone: "sand" },
  7:    { n: "行銷推廣",     c: "#739C4F", tone: "olive" },
  8:    { n: "募資期間行銷", c: "#739C4F", tone: "olive" },
  9:    { n: "募資後續",     c: "#739C4F", tone: "olive" },
};
