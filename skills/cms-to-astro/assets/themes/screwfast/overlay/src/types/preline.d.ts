// Preline ships type declarations for its auto-initialising plugin modules only. The `-non-auto`
// modules (imported in MainLayout, FAQ, FeaturesNavs) export the same plugin classes.
declare module 'preline/plugins/collapse-non-auto' {
  export { default } from 'preline/plugins/collapse';
}
declare module 'preline/plugins/dropdown-non-auto' {
  export { default } from 'preline/plugins/dropdown';
}
declare module 'preline/plugins/accordion-non-auto' {
  export { default } from 'preline/plugins/accordion';
}
declare module 'preline/plugins/tabs-non-auto' {
  export { default } from 'preline/plugins/tabs';
}
