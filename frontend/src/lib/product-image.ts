/** Fotos locales existentes: asociación conservadora por nombre, sin inferir por categoría. */
export function getProductImage(product: { name: string }): string | null {
  const name = product.name.toLocaleLowerCase('es-PE');
  if (name === 'demo pollo') return '/images/pollo-demo.png';
  if (name.includes('chaufa')) return '/images/chaufa-demo.png';
  if (name.includes('chicha morada')) return '/images/chicha-demo.png';
  if (name.startsWith('pollo a la brasa')) return '/images/pollo-demo.png';
  return null;
}
