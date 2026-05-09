import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Wujie AI Sensing',
    description: 'AI runtime sensing for micro-frontend debugging',
    version: '0.1.0',
    permissions: ['storage', 'tabs', 'scripting'],
    host_permissions: ['<all_urls>']
  }
});
