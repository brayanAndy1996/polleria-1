'use client';

import { Button } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Product } from '@polleria/shared';
import { useRef, useState } from 'react';
import { apiErrorMessage } from '../../lib/api/error-message.ts';
import { updateProduct } from '../../lib/api/products.ts';

/**
 * Desactivar/Activar de un producto (AC-07, AC-11; mismo patrón que la sección Estado
 * de usuarios de la 004): 'Desactivar' pide la confirmación '¿Desactivar <nombre>?
 * Dejará de aparecer en la carta.' con 'Sí, desactivar' y 'Cancelar'; 'Activar' envía
 * el PATCH directo. Ambos envían PATCH /api/products/{id} con { isActive } e
 * invalidan la consulta de la lista. La confirmación se cierra al enviar: si la API
 * falla, el error aparece junto al control y el botón vuelve a estar disponible.
 * `onSaved` recibe el producto actualizado (la página de edición lo usa para su
 * overlay; la lista solo necesita la invalidación).
 */
export function ProductStateControl({
  product,
  onSaved,
}: {
  product: Product;
  onSaved?: (updated: Product) => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  // Un solo envío en vuelo: la marca síncrona bloquea el doble toque en el mismo
  // tick, antes de que isPending llegue al render (lección ADV-004-31).
  const sending = useRef(false);
  const change = useMutation({
    mutationFn: (isActive: boolean) => updateProduct(product.id, { isActive }),
    onSuccess: (updated) => {
      setConfirming(false);
      onSaved?.(updated);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const send = (isActive: boolean) => {
    if (sending.current || change.isPending) return;
    setConfirming(false);
    sending.current = true;
    change.mutate(isActive);
  };
  return (
    <div className="space-y-3">
      {change.isError && (
        <p role="alert" className="text-danger wrap-anywhere">
          {apiErrorMessage(change.error)}
        </p>
      )}
      {product.isActive ? (
        confirming ? (
          <div className="space-y-3 rounded-xl border border-separator p-4">
            <p>{`¿Desactivar ${product.name}? Dejará de aparecer en la carta.`}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                className="min-h-12"
                isDisabled={change.isPending}
                onPress={() => {
                  send(false);
                }}
              >
                Sí, desactivar
              </Button>
              <Button
                variant="secondary"
                className="min-h-12"
                isDisabled={change.isPending}
                onPress={() => {
                  setConfirming(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="min-h-12"
            isDisabled={change.isPending}
            onPress={() => {
              setConfirming(true);
            }}
          >
            Desactivar
          </Button>
        )
      ) : (
        <Button
          variant="secondary"
          className="min-h-12"
          isDisabled={change.isPending}
          onPress={() => {
            send(true);
          }}
        >
          {change.isPending ? 'Activando...' : 'Activar'}
        </Button>
      )}
    </div>
  );
}
