/** Todas as imagens em src/assets, indexadas pelo nome do arquivo sem extensão. */
const files = import.meta.glob<string>('./assets/*.png', { eager: true, query: '?url', import: 'default' });

export const IMAGE_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.replace(/^.*\/(.+)\.png$/, '$1'), url]),
);
