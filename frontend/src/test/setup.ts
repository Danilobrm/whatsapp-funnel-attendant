import '@testing-library/jest-dom/vitest';

// jsdom não implementa scrollIntoView. Sem o stub, o efeito de rolagem do menu
// de comandos (ChatComposer) lança e derruba o render inteiro no teste.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
