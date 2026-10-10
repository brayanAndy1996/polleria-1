'use client';

import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { PRODUCT_CATEGORIES, formatSoles } from '@polleria/shared';
import type { Product } from '@polleria/shared';
import Link from 'next/link';
import { RoleGuard } from '../../../components/auth/role-guard.tsx';
import { ProductStateControl } from '../../../components/menu/product-state-control.tsx';
import { getProducts } from '../../../lib/api/products.ts';
import { PRODUCT_CATEGORY_LABELS } from '../../../lib/menu-labels.ts';
import { usePrimaryInstance } from '../../../lib/primary-instance.ts';

/** Fila de la lista: nombre, precio en soles, marca de estado, Editar y activar/desactivar. */
function ProductRow({ product }: { product: Product }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-separator bg-surface px-5 py-4">
      <div className="min-w-0 space-y-1">
        <p className="text-xl font-semibold wrap-anywhere">{product.name}</p>
        <p className="text-sm">{formatSoles(product.priceCents)}</p>
        {!product.isActive && <p className="text-sm font-semibold text-danger">Desactivado</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/carta/${product.id}`}
          className="inline-flex min-h-12 items-center text-accent underline underline-offset-4"
        >
          Editar
        </Link>
        <ProductStateControl product={product} />
      </div>
    </li>
  );
}

function CartaList() {
  const products = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: getProducts,
    retry: false,
  });
  if (products.isPending)
    return (
      <p role="status" className="p-6 text-center">
        Cargando carta...
      </p>
    );
  if (products.isError)
    return (
      <div className="space-y-4 p-6 text-center">
        <p role="alert">No se pudo cargar la carta.</p>
        <Button
          className="min-h-12"
          onPress={() => {
            void products.refetch();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  const list = products.data ?? [];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Carta</h1>
        <Link
          href="/admin/carta/nuevo"
          className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 font-semibold text-accent-foreground"
        >
          Agregar producto
        </Link>
      </div>
      {list.length === 0 && <p>La carta está vacía.</p>}
      {/* Una sección por categoría presente, en el orden fijo de la carta (RN-008-03);
          dentro de cada sección las filas van en el orden que devuelve la API. */}
      {PRODUCT_CATEGORIES.map((category) => {
        const items = list.filter((product) => product.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="space-y-3">
            <h2 className="text-xl font-semibold">{PRODUCT_CATEGORY_LABELS[category]}</h2>
            <ul className="space-y-3">
              {items.map((product) => (
                <ProductRow key={product.id} product={product} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export default function Page() {
  const primary = usePrimaryInstance();
  return <RoleGuard area="/admin">{primary ? <CartaList /> : null}</RoleGuard>;
}
