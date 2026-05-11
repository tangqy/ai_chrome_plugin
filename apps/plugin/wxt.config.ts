import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Wujie AI Sensing',
    description: 'AI runtime sensing for micro-frontend debugging',
    version: '0.1.0',
    permissions: ['storage', 'tabs', 'scripting', 'cookies', 'alarms', 'proxy', 'debugger'],
    host_permissions: ['<all_urls>'],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content-scripts/content.js'],
        run_at: 'document_idle',
        all_frames: true,
        match_about_blank: true
      }
    ],
    web_accessible_resources: [
      {
        resources: ['page-hook.js', 'content-scripts/page-hook.js'],
        matches: ['<all_urls>']
      }
    ]
  }
});
