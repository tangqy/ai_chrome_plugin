declare function defineBackground(fn: () => void): void;

type ContentScriptOptions = {
  matches: string[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  main: () => void;
};

declare function defineContentScript(options: ContentScriptOptions): void;
