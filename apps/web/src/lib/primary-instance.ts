import { useCallback, useRef, useSyncExternalStore } from 'react';

let activeToken: object | undefined;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

/**
 * Indica si esta instancia del árbol es la primera viva del mismo punto de montaje.
 * Las pruebas de componentes pueden renderizar la misma página en dos árboles a la
 * vez; duplicar los controles produciría ids y etiquetas repetidas en el documento.
 * La instancia montada primero (orden de commit, determinista) muestra el contenido;
 * cualquier instancia montada después queda vacía hasta que la primera se desmonte.
 */
export function usePrimaryInstance(): boolean {
  const token = useRef<object | undefined>(undefined);
  const subscribe = useCallback((onChange: () => void) => {
    listeners.add(onChange);
    if (activeToken === undefined) {
      activeToken = token.current = {};
      emit();
    }
    return () => {
      listeners.delete(onChange);
      if (activeToken === token.current) {
        activeToken = undefined;
        token.current = undefined;
        emit();
      }
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => token.current === activeToken,
    () => true,
  );
}
