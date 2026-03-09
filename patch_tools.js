const fs = require('fs');

let tools = fs.readFileSync('apps/web/src/pages/ToolsPage.tsx', 'utf8');

tools = tools.replace(
  'import QuickCapture from "../components/QuickCapture";',
  `import QuickCapture from "../components/QuickCapture";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";`
);

tools = tools.replace(
  /<div className="space-y-6">([\s\S]*?)<div className="grid gap-6 lg:grid-cols-2">/m,
  `<div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic leading-none">Command Tools</h1>
          <p className="text-muted font-bold uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(93,216,255,0.5)]"></span>
            Active Utilities
          </p>
        </div>
      </div>
      
      <div className="grid gap-6 lg:grid-cols-2">`
);

tools = tools.replace(
  /<div className="panel space-y-4">\s*<div className="flex items-center justify-between">\s*<div>\s*<p className="text-xs uppercase tracking-\[0\.3em\] text-muted">Focus Timer<\/p>\s*<h2 className="text-lg font-semibold">Pomodoro session<\/h2>\s*<\/div>\s*<span className="chip">{state\.focusSessions\.length} sessions<\/span>\s*<\/div>/m,
  `<GlassPanel variant="standard" className="space-y-4 p-6">
          <SectionHeader 
            eyebrow="Focus Timer" 
            title="Pomodoro session" 
            rightControls={<span className="chip">{state.focusSessions.length} sessions</span>} 
          />`
);
tools = tools.replace('</p>\n        </div>\n\n        <div className="panel space-y-4">', '</p>\n        </GlassPanel>\n\n        <div className="panel space-y-4">');

tools = tools.replace(
  /<div className="panel space-y-4">\s*<div>\s*<p className="text-xs uppercase tracking-\[0\.3em\] text-muted">Session Log<\/p>\s*<h2 className="text-lg font-semibold">What you did<\/h2>\s*<\/div>/m,
  `<GlassPanel variant="standard" className="space-y-4 p-6">
          <SectionHeader 
            eyebrow="Session Log" 
            title="What you did" 
          />`
);

tools = tools.replace(
  /<\/div>\n      <\/div>\n\n      <div className="panel space-y-3">/,
  '</GlassPanel>\n      </div>\n\n      <div className="panel space-y-3">'
);

tools = tools.replace(
  /<div className="panel space-y-3">\s*<div>\s*<p className="text-xs uppercase tracking-\[0\.3em\] text-muted">Planned Focus<\/p>\s*<h2 className="text-lg font-semibold">Queued sessions<\/h2>\s*<\/div>/m,
  `<GlassPanel variant="standard" className="space-y-4 p-6">
        <SectionHeader 
          eyebrow="Planned Focus" 
          title="Queued sessions" 
        />`
);

tools = tools.replace(
  /<\/div>\n      <\/div>\n\n      <QuickCapture \/>/,
  '</div>\n      </GlassPanel>\n\n      <QuickCapture />'
);

fs.writeFileSync('apps/web/src/pages/ToolsPage.tsx', tools);

let review = fs.readFileSync('apps/web/src/pages/WeeklyReviewPage.tsx', 'utf8');

review = review.replace(
  /<div className="space-y-6">\s*<GlassPanel variant="hero">/,
  `<div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic leading-none">Weekly Review</h1>
          <p className="text-muted font-bold uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(93,216,255,0.5)]"></span>
            Reflect and calibrate
          </p>
        </div>
        <div className="flex items-center gap-4 bg-white/5 border border-white/10 px-6 py-4 rounded-2xl backdrop-blur-xl">
          <div className="text-center">
            <span className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Week</span>
            <span className="text-xl font-black text-white tracking-tighter">{weekStart}</span>
          </div>
        </div>
      </div>
      <GlassPanel variant="standard" className="p-6">`
);

fs.writeFileSync('apps/web/src/pages/WeeklyReviewPage.tsx', review);
