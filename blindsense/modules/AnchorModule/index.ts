// Reexport the native module. On web, it will be resolved to AnchorModule.web.ts
// and on native platforms to AnchorModule.ts
export { default } from './src/AnchorModule';
export { default as AnchorModuleView } from './src/AnchorModuleView';
export * from  './src/AnchorModule.types';
