const fs = require('fs');

let settings = fs.readFileSync('apps/web/src/pages/SettingsPage.tsx', 'utf8');

// Imports
settings = settings.replace(
  'import Select from "../components/Select";',
  `import Select from "../components/Select";
import GlassPanel from "../components/GlassPanel";
import SectionHeader from "../components/SectionHeader";`
);

// Container and Header
settings = settings.replace(
  /<div className="space-y-6 max-w-4xl">/,
  `<div className="space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-white uppercase italic leading-none">Settings</h1>
          <p className="text-muted font-bold uppercase tracking-[0.3em] mt-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(93,216,255,0.5)]"></span>
            System Configuration
          </p>
        </div>
      </div>`
);

// Local Git
settings = settings.replace(
  /<div className="panel space-y-4">\s*<div>\s*<p className="text-xs uppercase tracking-\[0\.3em\] text-muted">Local Git<\/p>\s*<h2 className="text-lg font-semibold">Repo Scanning<\/h2>\s*<\/div>/m,
  `<GlassPanel variant="standard" className="space-y-4 p-6">
        <SectionHeader 
          eyebrow="Local Git" 
          title="Repo Scanning" 
        />`
);

// Insights
settings = settings.replace(
  /<\/div>\n\n      <div className="panel space-y-3">\s*<div>\s*<p className="text-xs uppercase tracking-\[0\.3em\] text-muted">Insights<\/p>\s*<h2 className="text-lg font-semibold">Signals → Actions<\/h2>\s*<\/div>/m,
  `</GlassPanel>\n\n      <GlassPanel variant="standard" className="space-y-4 p-6">\n        <SectionHeader \n          eyebrow="Insights" \n          title="Signals → Actions" \n        />`
);

// Backups
settings = settings.replace(
  /<\/div>\n\n      <div className="panel space-y-3">\s*<div>\s*<p className="text-xs uppercase tracking-\[0\.3em\] text-muted">Backups<\/p>\s*<h2 className="text-lg font-semibold">Auto-backup<\/h2>\s*<\/div>/m,
  `</GlassPanel>\n\n      <GlassPanel variant="standard" className="space-y-4 p-6">\n        <SectionHeader \n          eyebrow="Backups" \n          title="Auto-backup" \n        />`
);

// Startup
settings = settings.replace(
  /<\/div>\n\n      <div className="panel space-y-3">\s*<div>\s*<p className="text-xs uppercase tracking-\[0\.3em\] text-muted">Startup<\/p>\s*<h2 className="text-lg font-semibold">Autostart<\/h2>\s*<\/div>/m,
  `</GlassPanel>\n\n      <GlassPanel variant="standard" className="space-y-4 p-6">\n        <SectionHeader \n          eyebrow="Startup" \n          title="Autostart" \n        />`
);

// Closing div of Startup -> closing GlassPanel
settings = settings.replace(
  /        \)}\n      <\/div>\n\n    <\/div>\n  \);\n}/m,
  `        )}\n      </GlassPanel>\n\n    </div>\n  );\n}`
);

fs.writeFileSync('apps/web/src/pages/SettingsPage.tsx', settings);
