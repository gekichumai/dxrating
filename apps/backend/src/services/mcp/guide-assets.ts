// The style and the script of the HTML setup guide (guide.ts), inline in the page, which its Content-Security-Policy
// allows by their hashes; guide.ts leaves their comments and indentation out. The look is that of dxrating.net: its
// teal (the MAGiCAL theme, #178C72 on the #bdebdc canvas), Torus, rounded translucent panels and pill-shaped segmented
// controls, with a dark scheme of its own. The page works without the script, which adds the copy buttons and shows
// the apps one at a time, as tabs.

export const GUIDE_STYLE = String.raw`
@font-face{font-family:"Torus";src:url(https://shama.dxrating.net/fonts/Torus-Regular.woff2) format("woff2");font-weight:400;font-display:swap;unicode-range:U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026}
@font-face{font-family:"Torus";src:url(https://shama.dxrating.net/fonts/Torus-SemiBold.woff2) format("woff2");font-weight:600;font-display:swap;unicode-range:U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026}

:root{
--bg:#f3f8f6;--canvas:#bdebdc;--haze:#a6dfe6;
--ink:#13241f;--ink2:#2c403a;--mut:#566a64;--line:rgba(19,36,31,.1);--line2:rgba(19,36,31,.18);
--panel:rgba(255,255,255,.74);--panel-bd:rgba(255,255,255,.9);--solid:#fff;--sunk:#edf4f1;
--acc:#178c72;--acc-ink:#0f6e59;--acc-soft:rgba(23,140,114,.1);--btn:#10735d;--btn-h:#0c5f4c;--on-btn:#fff;
--bar:#127a63;--bar-ink:#fff;
--shadow:0 1px 2px rgba(16,60,50,.06),0 14px 36px -18px rgba(16,60,50,.28);
--r:16px;
--sans:"Torus",-apple-system,BlinkMacSystemFont,"Segoe UI",var(--cjk),system-ui,sans-serif;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",var(--cjk),monospace;
--cjk:"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans CJK JP","Noto Sans JP","Yu Gothic UI","Meiryo";
color-scheme:light}
@media (prefers-color-scheme:dark){:root{
--bg:#0b1513;--canvas:#123a32;--haze:#0f3b44;
--ink:#e4f1ec;--ink2:#c0d4cd;--mut:#8ea49d;--line:rgba(228,241,236,.09);--line2:rgba(228,241,236,.17);
--panel:rgba(20,38,33,.72);--panel-bd:rgba(228,241,236,.08);--solid:#13231f;--sunk:#0e1c19;
--acc:#4fc6a6;--acc-ink:#6fd6b9;--acc-soft:rgba(79,198,166,.13);--btn:#4fc6a6;--btn-h:#6fd6b9;--on-btn:#06201a;
--bar:#0f2a24;--bar-ink:#e4f1ec;
--shadow:0 1px 2px rgba(0,0,0,.3),0 16px 40px -20px rgba(0,0,0,.6);
color-scheme:dark}}
/* the fonts of the language of each element: Chinese and Japanese share characters but not their shapes */
[lang]{--sans:"Torus",-apple-system,BlinkMacSystemFont,"Segoe UI",var(--cjk),system-ui,sans-serif;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",var(--cjk),monospace}
:lang(zh-Hans){--cjk:"PingFang SC","Hiragino Sans GB","Microsoft YaHei UI","Microsoft YaHei","Noto Sans CJK SC","Noto Sans SC"}
:lang(zh-Hant){--cjk:"PingFang TC","Microsoft JhengHei UI","Microsoft JhengHei","Noto Sans CJK TC","Noto Sans TC"}
:not(html)[lang]{font-family:var(--sans)}

*,::before,::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-padding-top:76px}
body{margin:0;min-height:100vh;color:var(--ink);font:400 16px/1.65 var(--sans);-webkit-font-smoothing:antialiased;background:radial-gradient(70% 420px at 85% 40px,var(--haze),transparent 70%),linear-gradient(180deg,var(--canvas) 0,var(--bg) 720px) no-repeat,var(--bg)}
:is(:lang(ja),:lang(zh)) body{line-height:1.8;line-break:strict}
:lang(en) :is(p,li,dd,dt){word-break:keep-all;overflow-wrap:break-word}
:lang(ja) :is(h1,h2,h3,.tab,dt){word-break:auto-phrase}
h1,h2,h3{text-wrap:balance}
p,li,dd{text-wrap:pretty}
a{color:var(--acc-ink);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:.22em;text-decoration-color:color-mix(in srgb,currentColor 40%,transparent)}
p a,li a,dd a{overflow-wrap:anywhere}
strong{font-weight:600;color:var(--ink)}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:6px}
::selection{background:var(--acc);color:var(--on-btn)}
code{font-family:var(--mono);font-size:.86em}
:not(pre)>code{padding:.1em .38em;border-radius:6px;background:var(--acc-soft);color:var(--ink);overflow-wrap:anywhere;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.sr{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.sprite{position:absolute;width:0;height:0;overflow:hidden}
.i{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
/* strokes in pixels, whatever the size of the icon: 1.5 by regular text, 2 by semibold */
.sprite *{vector-effect:non-scaling-stroke}
.cp .i,.pill-btn .i,.badges .i{stroke-width:2}
.skip{position:absolute;left:12px;top:-60px;z-index:30;padding:8px 14px;border-radius:999px;background:var(--btn);color:var(--on-btn);text-decoration:none;font-weight:600}
.skip:focus{top:10px}
.in{max-width:1080px;margin:0 auto;padding:0 24px}

/* the bar of dxrating.net: the wordmark on the teal of the theme */
.bar{position:sticky;top:0;z-index:20;background:var(--bar);color:var(--bar-ink);box-shadow:0 1px 0 rgba(0,0,0,.08),0 6px 18px -12px rgba(0,0,0,.4)}
.bar .in{display:flex;align-items:center;gap:18px;height:60px}
.mark{display:inline-flex;align-items:center;gap:2px;font-size:18px;font-weight:600;letter-spacing:-.01em;white-space:nowrap}
/* the logo and the name, a link to the website: 8 (the icon) + 4 */
.home{display:inline-flex;align-items:center;gap:10px;margin-left:-4px;padding:4px 8px 4px 4px;border-radius:12px;color:inherit;text-decoration:none}
.bar .home:focus-visible{outline-offset:0;border-radius:12px}
.home img{width:30px;height:30px;border-radius:8px;box-shadow:0 0 0 1px rgba(255,255,255,.35)}
.chip{padding:3px 8px 2px;border-radius:999px;background:rgba(255,255,255,.2);font-size:11px;font-weight:600;letter-spacing:.06em}
.jump{display:flex;gap:2px;margin-left:8px}
.jump a,.md{padding:6px 12px;border-radius:999px;color:inherit;opacity:.9;text-decoration:none;font-size:14px;white-space:nowrap}
.bar-r{display:flex;align-items:center;gap:8px;margin-left:auto}
.langs{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:rgba(0,0,0,.16)}
.langs a{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border-radius:999px;color:inherit;text-decoration:none;font-size:13px;line-height:1;white-space:nowrap;opacity:.88}
.langs a[aria-current]{opacity:1;background:#fff;color:#0f6e59;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.2)}
.ln-s{display:none}
.bar :focus-visible{outline-color:#fff}

/* the intro: the app icon, the name, what it does */
.hero{padding:64px 0 36px;text-align:center}
.app{display:block;width:76px;height:76px;margin:0 auto 22px;border-radius:20px;box-shadow:0 0 0 1px var(--panel-bd),0 12px 30px -10px rgba(16,90,72,.45)}
h1{margin:0 auto 18px;max-width:18em;font-size:52px;line-height:1.08;font-weight:600;letter-spacing:-.025em}
h1 .h1-b{color:var(--acc-ink)}
.lead{margin:0 auto;max-width:40em;font-size:18px;line-height:1.65;color:var(--ink2)}
.l1{display:block;margin-bottom:4px;font-size:21px;font-weight:600;color:var(--ink)}
.aside{margin:14px auto 0;max-width:46em;font-size:14px;color:var(--mut)}
.badges{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:26px 0 0;padding:0;list-style:none}
.badges li{display:inline-flex;align-items:center;gap:6px;padding:4px 13px 4px 9px;border:1px solid transparent;border-radius:999px;background:var(--panel) padding-box;box-shadow:inset 0 0 0 1px var(--line);font-size:13px;font-weight:600;color:var(--ink2)}
.badges .i{width:14px;height:14px;color:var(--acc)}

/* panels: the translucent cards of dxrating.net */
.panel{border-radius:var(--r);background:var(--panel);border:1px solid var(--panel-bd);box-shadow:var(--shadow);-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3)}
.kicker{margin:0 0 10px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
:is(:lang(ja),:lang(zh)) .kicker{letter-spacing:.02em}
.note{margin:12px 0 0;font-size:13.5px;line-height:1.6;color:var(--mut)}

/* connect: the URL and how to add it by hand, then the prompt for an agent */
.connect{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:20px;align-items:start}
.connect>.panel{padding:24px}
/* a pill around the pill of its button: 19 + 5 + 1 is half its height */
.field{display:flex;align-items:center;gap:8px;padding:5px 5px 5px 19px;border:1px solid transparent;border-radius:999px;background:var(--solid) padding-box;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--acc) 55%,transparent)}
.field code{flex:1;padding:0;background:none;min-width:0;font-size:15px;line-height:1.5;white-space:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-user-select:all;user-select:all}
.facts{margin:16px 0 0}
.facts>div{display:grid;grid-template-columns:132px minmax(0,1fr);gap:12px;padding:9px 0;border-top:1px solid var(--line);font-size:14px;line-height:1.55}
.facts>div:first-child{border-top:0}
.facts dt{color:var(--mut)}
.facts dd{margin:0;color:var(--ink2)}
.oc{margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}
.oc-g{display:flex;flex-wrap:wrap;gap:8px}
.pill-btn{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px 0 15px;border:1px solid transparent;border-radius:999px;background:var(--solid) padding-box;box-shadow:inset 0 0 0 1px var(--line2),0 1px 2px rgba(16,60,50,.06);color:var(--ink);font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap}
.pill-btn .i{width:14px;height:14px;color:var(--acc)}
.agent h2{margin:0 0 6px;font-size:20px;line-height:1.3;font-weight:600}
.agent .note{margin:0 0 14px}
.prompt{margin:0;padding:13px 15px;border:1px solid transparent;border-radius:12px;background:var(--sunk) padding-box;box-shadow:inset 0 0 0 1px var(--line);font:13.5px/1.7 var(--mono);color:var(--ink2);white-space:pre-wrap;overflow-wrap:anywhere}
.prompt code{font-size:inherit}

/* buttons that copy, which the script shows */
.cp{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 10px 0 8px;border:0;border-radius:999px;background:transparent;color:var(--mut);font:600 12.5px/1 var(--sans);cursor:pointer;white-space:nowrap}
.cp[hidden]{display:none}
.cp.ok{color:var(--acc-ink)}
.cp-ico{width:32px;padding:0}
.cp-solid,.cta{background:var(--btn);color:var(--on-btn)}
.cp-solid{height:38px;padding:0 16px 0 14px;font-size:14px}
.cp-solid.ok,.cta.ok{background:var(--btn-h);color:var(--on-btn)}
.cta{width:100%;height:46px;margin-top:14px;font-size:15px;box-shadow:0 8px 20px -10px color-mix(in srgb,var(--btn) 80%,transparent)}
.cta .i{width:18px;height:18px}
/* the copy and copied icons, one over the other, cross-fade */
.ic{display:grid;flex:none}
.ic>.i{grid-area:1/1;transition:opacity .3s cubic-bezier(.2,0,0,1)}
.ic>.i+.i,.ok .ic>.i:first-child{opacity:0}
.ok .ic>.i+.i{opacity:1}

/* sections */
.sec{padding:64px 0 0}
.sec>h2{display:flex;align-items:center;gap:12px;margin:0 0 20px;font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-.015em}
.sec>h2::before{content:"";flex:none;width:6px;height:24px;border-radius:3px;background:var(--acc)}
h2 a{color:inherit;text-decoration:none}
h2 a::after{content:"#";margin-left:.3em;color:var(--mut);opacity:0}
.sec-b>p{margin:0 0 16px;max-width:68ch;color:var(--ink2)}

/* install: the apps as a segmented control, then the steps of one */
.clients{display:flex;flex-wrap:wrap;gap:12px 20px;margin:0 0 16px}
.grp-l{display:block;margin:0 0 6px 4px;font-size:12px;font-weight:600;color:var(--mut)}
/* 17 (the tabs) + 4 + 1 */
.seg{display:flex;flex-wrap:wrap;gap:4px;padding:4px;border:1px solid transparent;border-radius:22px;background:color-mix(in srgb,var(--solid) 55%,transparent) padding-box;box-shadow:inset 0 0 0 1px var(--line)}
.tab{display:inline-flex;align-items:center;min-height:34px;padding:0 15px;border-radius:999px;color:var(--ink2);font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap}
.tab[aria-selected=true]{background:var(--btn);color:var(--on-btn);box-shadow:0 2px 8px -3px color-mix(in srgb,var(--btn) 70%,transparent)}
.apps{padding:28px 32px}
.app-p+.app-p{margin-top:36px;padding-top:32px;border-top:1px solid var(--line)}
.js .app-p+.app-p{margin-top:0;padding-top:0;border-top:0}
.app-p[hidden]{display:none}
.app-p:focus-visible{outline-offset:10px;outline-color:color-mix(in srgb,var(--acc) 60%,transparent)}
.app-p h3{margin:0 0 18px;font-size:22px;line-height:1.3;font-weight:600}
.app-p h3 .q{display:block;margin-top:2px;font-size:14px;font-weight:400;color:var(--mut)}
.app-p>p{margin:0 0 14px;max-width:72ch;color:var(--ink2)}
.steps{list-style:none;counter-reset:s;margin:0 0 20px;padding:0;max-width:72ch}
.steps li{counter-increment:s;position:relative;margin:0 0 14px;padding-left:42px;color:var(--ink2)}
.steps li::before{content:counter(s);position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50%;background:var(--acc-soft);color:var(--acc-ink);font:600 13px/28px var(--sans);text-align:center}
.steps~p{font-size:14px;color:var(--mut)!important}
.docs{display:flex;align-items:center;gap:10px;max-width:none!important;margin:22px 0 0;padding-top:14px;border-top:1px dashed var(--line2);font-size:13px;color:var(--mut)}
.docs>span{flex:none}
.docs a{display:inline-flex;align-items:center;gap:4px;min-width:0;color:var(--ink2);text-decoration:none}
.docs a span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.docs .i{width:13px;height:13px;color:var(--acc)}

/* code: a label, a copy button, the code highlighted in the teal of the theme */
.code{margin:12px 0 18px;border:1px solid transparent;border-radius:18px;background:var(--sunk) padding-box;box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
/* its button in the corner, concentric with the block: 14 + 3 + 1 */
.code-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:3px 3px 3px 14px;border-bottom:1px solid var(--line)}
.code .cp{height:28px}
.code-l{font:12px/1 var(--mono);color:var(--mut);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.code pre{margin:0;padding:12px 16px 14px;overflow-x:auto;font:13px/1.7 var(--mono);color:var(--ink2)}
.code code{font-size:inherit}
.code .ln{display:block}
.code .i0{padding-left:2ch;text-indent:-2ch}.code .i1{padding-left:4ch;text-indent:-4ch}.code .i2{padding-left:6ch;text-indent:-6ch}.code .i3{padding-left:8ch;text-indent:-8ch}
.code-sh .ln{white-space:pre-wrap;overflow-wrap:anywhere}
.code-sh .ln::before{content:"$ ";color:var(--mut);-webkit-user-select:none;user-select:none}
.code .k,.code .c{color:var(--ink)}
.code .c{font-weight:600}
.code .s{color:var(--acc-ink)}
.code .p,.code .f{color:var(--mut)}

/* try it: prompts as chat bubbles */
.prompts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
.prompts li{display:flex;align-items:flex-start;gap:8px;padding:12px 8px 12px 16px;border-radius:18px 18px 18px 6px;background:var(--panel);border:1px solid var(--panel-bd);box-shadow:var(--shadow)}
.prompts p{flex:1;margin:4px 0;font-size:15px;line-height:1.55;color:var(--ink)}
.sec-b>.callout{position:relative;margin:16px 0 0;padding:14px 18px 14px 50px;max-width:none;border-radius:14px;background:var(--acc-soft);font-size:14px;color:var(--ink2)!important}
.sec-b>.callout::before{content:"";position:absolute;left:20px;top:17px;width:7px;height:12px;border:solid var(--acc-ink);border-width:0 2px 2px 0;transform:rotate(45deg)}

/* tools */
.tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
.tools li{padding:18px 20px}
.tools h3{margin:0 0 6px;font-size:15px}
.tools h3 code{padding:.15em .55em;border-radius:999px;color:var(--acc-ink)}
.tools p{margin:0;font-size:14px;color:var(--mut)}

/* data, limits, privacy: three cards */
.trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding-top:64px}
.trio .sec{padding:22px 22px 20px}
.trio .sec>h2{margin-bottom:14px;font-size:18px}
.trio .sec>h2::before{height:16px;width:5px}
.dash{margin:0;padding:0;list-style:none}
.dash li{position:relative;margin:0 0 10px;padding-left:18px;color:var(--ink2)}
.dash li::before{content:"";position:absolute;left:2px;top:.75em;width:6px;height:6px;border-radius:50%;background:var(--acc);opacity:.7}
.trio .dash li{font-size:14px;line-height:1.6}

/* troubleshooting */
.faq{margin:0 0 20px;padding:6px 24px}
.faq>div{padding:16px 0;border-top:1px solid var(--line)}
.faq>div:first-child{border-top:0}
.faq dt{margin:0 0 4px;font-weight:600;color:var(--ink)}
.faq dd{margin:0;color:var(--ink2)}
.faq dd::first-letter{text-transform:uppercase}

.foot{margin-top:72px;border-top:1px solid var(--line)}
.foot .in{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px;padding-top:28px;padding-bottom:40px;font-size:13px;color:var(--mut)}
.foot p{margin:0;max-width:70ch}
.foot-b{display:flex;align-items:center;gap:8px;margin-bottom:6px!important;color:var(--ink);font-size:15px;font-weight:600}
.foot .chip{background:var(--acc-soft);color:var(--acc-ink)}
.foot-b img{width:22px;height:22px;border-radius:6px}
.foot-l{display:flex;gap:12px}
.foot-l a{color:var(--mut);text-decoration:none}
.foot-l a[aria-current]{color:var(--acc-ink)}

@media (max-width:900px){
.jump{display:none}
.connect,.trio{grid-template-columns:minmax(0,1fr)}
h1{font-size:44px}
}
@media (max-width:640px){
.in{padding:0 16px}
.bar .in{height:56px;gap:10px}
.home{gap:8px}
.md{display:none}
.mark{font-size:17px}
.langs a{padding:0 10px}
.langs .ln{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.langs .ln-s{display:inline}
.hero{padding:36px 0 28px;text-align:left}
.app{width:60px;height:60px;margin:0 0 18px;border-radius:16px}
.badges{justify-content:flex-start}
h1{font-size:36px}
.lead{font-size:16px}
.l1{font-size:18px}
.connect>.panel{padding:18px}
.field{padding-left:15px}
.field code{font-size:13.5px}
.cp-solid{width:38px;padding:0}
.cp-solid .t{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.facts>div{grid-template-columns:minmax(0,1fr);gap:0}
.facts dt{font-size:12px}
.oc-g .pill-btn{flex:1 1 calc(50% - 4px);justify-content:center;padding:0 10px;white-space:normal;text-align:center;line-height:1.25}
.oc-g .i{display:none}
.sec{padding-top:48px}
.sec>h2{font-size:24px}
.clients{display:block}
.clients>div+div{margin-top:10px}
.apps{padding:22px 16px}
.code pre{font-size:12.5px;padding:10px 12px 12px;white-space:pre-wrap;overflow-wrap:anywhere}
.prompts,.tools{grid-template-columns:minmax(0,1fr)}
.trio{padding-top:48px}
.faq{padding:4px 16px}
}
@media (max-width:360px){.chip{display:none}h1{font-size:32px}}
@media (pointer:coarse){.tab{min-height:40px}.seg{border-radius:25px}.cp:not(.cp-solid,.cta){height:36px}.cp-ico{width:36px}.code{border-radius:22px}.langs a{min-height:34px}}
/* hover only where there is one: on touch, :hover stays on what was tapped */
@media (hover:hover){
a:hover{text-decoration-color:currentColor}
h2 a:hover::after{opacity:.6}
.jump a:hover,.md:hover,.home:hover{opacity:1;background:rgba(255,255,255,.14)}
.langs a:hover{opacity:1}
.pill-btn:hover{box-shadow:inset 0 0 0 1.5px var(--acc);color:var(--acc-ink)}
.cp:hover{background:var(--acc-soft);color:var(--acc-ink)}
.cp-solid:hover,.cta:hover{background:var(--btn-h);color:var(--on-btn)}
.tab:hover{background:var(--acc-soft);color:var(--acc-ink)}
.tab[aria-selected=true]:hover{background:var(--btn);color:var(--on-btn)}
.docs a:hover{color:var(--acc-ink)}
.foot-l a:hover{color:var(--acc-ink)}
}
.tab,.cp,.pill-btn,.langs a,.home{-webkit-tap-highlight-color:transparent}
@media (forced-colors:active){.tab[aria-selected=true],.langs a[aria-current]{forced-color-adjust:none;background:Highlight;color:HighlightText}}
@media print{.bar,.skip,.clients,.cp{display:none!important}.app-p[hidden]{display:block!important}.panel{box-shadow:none;backdrop-filter:none}}
@media (prefers-reduced-motion:no-preference){
a,.tab{transition:color .15s,background-color .15s,box-shadow .15s}
.cp,.pill-btn{transition:color .15s,background-color .15s,box-shadow .15s,scale .15s ease-out}
.cp:not(:disabled):active,.pill-btn:active{scale:.96}
.ic>.i{transition:opacity .3s cubic-bezier(.2,0,0,1),scale .3s cubic-bezier(.2,0,0,1),filter .3s cubic-bezier(.2,0,0,1)}
.ic>.i+.i,.ok .ic>.i:first-child{scale:.25;filter:blur(4px)}
.ok .ic>.i+.i{scale:1;filter:none}
}
`

export const GUIDE_SCRIPT = String.raw`
(function () {
  var d = document, root = d.documentElement, live = d.getElementById('live'), copied = root.getAttribute('data-copied');
  root.classList.add('js');

  // copy buttons copy the data-c of their box; where the clipboard is denied, they select the text for Ctrl+C
  if (navigator.clipboard && window.isSecureContext) {
    d.querySelectorAll('button.cp').forEach(function (button) {
      var label = button.querySelector('.t'), text = label.textContent, timer;
      button.hidden = false;
      button.addEventListener('click', function () {
        var box = button.closest('[data-c]');
        navigator.clipboard.writeText(box.getAttribute('data-c')).then(function () {
          if (!button.classList.contains('ok')) button.style.minWidth = button.offsetWidth + 'px';
          button.classList.add('ok');
          label.textContent = live.textContent = copied;
          clearTimeout(timer);
          timer = setTimeout(function () {
            button.classList.remove('ok');
            button.style.minWidth = '';
            label.textContent = text;
            live.textContent = '';
          }, 1600);
        }, function () {
          var range = d.createRange(), selection = getSelection();
          range.selectNodeContents(box.querySelector('pre') || box.querySelector('code') || box.querySelector('p') || box);
          selection.removeAllRanges();
          selection.addRange(range);
        });
      });
    });
  }

  // the apps: one at a time, as tabs; the one shown is the #anchor of the URL
  var list = d.querySelector('[data-tabs]');
  var tabs = [].slice.call(list.querySelectorAll('a.tab'));
  var panels = tabs.map(function (tab) { return d.getElementById(tab.getAttribute('href').slice(1)); });
  list.setAttribute('role', 'tablist');
  list.querySelectorAll('.grp, .seg').forEach(function (e) { e.setAttribute('role', 'none'); });
  list.querySelectorAll('.grp-l').forEach(function (e) { e.setAttribute('aria-hidden', 'true'); });
  function show(n, focus, remember) {
    tabs.forEach(function (tab, i) {
      tab.setAttribute('aria-selected', i === n ? 'true' : 'false');
      tab.tabIndex = i === n ? 0 : -1;
      panels[i].hidden = i !== n;
    });
    if (focus) tabs[n].focus();
    if (remember) history.replaceState(null, '', '#' + panels[n].id);
  }
  tabs.forEach(function (tab, i) {
    tab.setAttribute('role', 'tab');
    tab.id = 'tab-' + panels[i].id;
    tab.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
    panels[i].tabIndex = 0;
    tab.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
      e.preventDefault();
      show(i, false, true);
    });
  });
  list.addEventListener('keydown', function (e) {
    var i = tabs.indexOf(d.activeElement), n = tabs.length;
    if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = (i + 1) % n;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = (i + n - 1) % n;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else return;
    e.preventDefault();
    show(i, true, true);
  });
  function fromHash() {
    var id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
    return panels.map(function (p) { return p.id; }).indexOf(id);
  }
  // a link to an app scrolls to the tabs above it, under the bar (the scroll-padding of the page)
  function margins() {
    var shown = panels.filter(function (p) { return !p.hidden; })[0];
    var top = shown.getBoundingClientRect().top - list.getBoundingClientRect().top;
    panels.forEach(function (p) { p.style.scrollMarginTop = top + 'px'; });
  }
  var start = fromHash();
  show(start < 0 ? 0 : start, false, false);
  margins();
  addEventListener('resize', margins);
  if (start >= 0) panels[start].scrollIntoView();
  addEventListener('hashchange', function () { var i = fromHash(); if (i >= 0) show(i, false, false); });
})();
`