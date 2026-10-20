'use client';

import { Button } from '@heroui/react';
import { useQuery } from '@tanstack/react-query';
import { PRODUCT_CATEGORIES, formatSoles } from '@polleria/shared';
import type { Product } from '@polleria/shared';
import Image from 'next/image';
import Link from 'next/link';
import { RoleGuard } from '../../../components/auth/role-guard.tsx';
import { ProductStateControl } from '../../../components/menu/product-state-control.tsx';
import { getProducts } from '../../../lib/api/products.ts';
import { PRODUCT_CATEGORY_LABELS } from '../../../lib/menu-labels.ts';
import { usePrimaryInstance } from '../../../lib/primary-instance.ts';
import { getProductImage } from '../../../lib/product-image.ts';
import styles from './page.module.css';

/** Fila de la lista: nombre, precio en soles, marca de estado, Editar y activar/desactivar. */
function ProductRow({ product }: { product: Product }) {
  const image = getProductImage(product);
  return (
    <li className={styles.row}>
      <div className={styles.productInfo}>
        <div className={styles.thumbnail} aria-hidden={image === null}>
          {image !== null && <Image src={image} alt={product.name} width={96} height={72} />}
        </div>
        <div className={styles.productText}>
          <p className={styles.productName}>{product.name}</p>
          <p className={styles.category}>{PRODUCT_CATEGORY_LABELS[product.category]}</p>
        </div>
      </div>
      <p className={styles.productPrice}>{formatSoles(product.priceCents)}</p>
      <span
        className={product.isActive ? styles.activeState : styles.inactive}
        data-state={product.isActive ? 'active' : 'inactive'}
      >
        {product.isActive ? 'Activo' : 'Desactivado'}
      </span>
      <div className={styles.actions}>
        <Link href={`/admin/carta/${product.id}`} className={styles.editLink}>
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
      <div className={styles.listHeader}>
        <div>
          <h1 className={styles.heading}>Carta</h1>
          <p className={styles.description}>Productos y precios del salón.</p>
        </div>
        <Link href="/admin/carta/nuevo" className={styles.addLink}>
          Agregar producto
        </Link>
      </div>
      {list.length === 0 && <p>La carta está vacía.</p>}
      {/* Una sección por categoría presente, en el orden fijo de la carta (RN-008-03);
          dentro de cada sección las filas van en el orden que devuelve la API. */}
      <section className={styles.panel} aria-label="Productos de la carta">
        <div className={styles.columnHeadings} aria-hidden="true">
          <span>Producto</span>
          <span>Precio</span>
          <span>Estado</span>
          <span>Acciones</span>
        </div>
        {PRODUCT_CATEGORIES.map((category) => {
          const items = list.filter((product) => product.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category} className={styles.categorySection}>
              <h2 className="sr-only">{PRODUCT_CATEGORY_LABELS[category]}</h2>
              <ul className={styles.productList}>
                {items.map((product) => (
                  <ProductRow key={product.id} product={product} />
                ))}
              </ul>
            </section>
          );
        })}
      </section>
    </>
  );
}

export default function Page() {
  const primary = usePrimaryInstance();
  return (
    <RoleGuard area="/admin" appearance="pos">
      {primary ? <CartaList /> : null}
    </RoleGuard>
  );
}
