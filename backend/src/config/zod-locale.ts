import { z } from 'zod';

/**
 * Pone los mensajes de Zod en español (D-07). La configuración de Zod es global, así que también
 * alcanza a los esquemas de @polleria/shared. Es seguro llamarla más de una vez.
 */
export function configureZodLocale(): void {
  z.config(z.locales.es());
}
