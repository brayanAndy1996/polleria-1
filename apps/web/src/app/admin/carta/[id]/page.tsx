'use client';

import { Button } from '@heroui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Product } from '@polleria/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { RoleGuard } from '../../../../components/auth/role-guard.tsx';
import { ComboItemsSection } from '../../../../components/menu/combo-items-section.tsx';
import { PortionsSection } from '../../../../components/menu/portions-section.tsx';
import { ProductFields } from '../../../../components/menu/product-fields.tsx';
import { ProductStateControl } from '../../../../components/menu/product-state-control.tsx';
import { apiErrorMessage } from '../../../../lib/api/error-message.ts';
import { getProductPortions, getProducts, updateProduct } from '../../../../lib/api/products.ts';
import type { ProductFieldErrors } from '../../../../lib/menu-form.ts';
import { solesFieldValue, validateProductFields } from '../../../../lib/menu-form.ts';
import { usePrimaryInstance } from '../../../../lib/primary-instance.ts';

const REFERENCE_PRICE_NOTE =
  'El cobro usa el precio de cada presentación; este precio queda solo de referencia.';

function EditProduct({ productId }: { productId: number }) {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: getProducts,
    retry: false,
  });
  // `saved` guarda el último Product confirmado por la API junto con la fila que la
  // lista tenía al confirmar (mismo patrón que la edición de usuario): la respuesta
  // del PATCH manda hasta que el refetch traiga una fila distinta para el producto.
  const [saved, setSaved] = useState<{
    product: Product;
    listedAtSave: Product | undefined;
  }>();
  const listed = products.data?.find((product) => product.id === productId);
  const product =
    saved !== undefined && saved.product.id === productId && saved.listedAtSave === listed
      ? saved.product
      : listed;

  // La nota de precio de referencia solo aplica a un chicken con presentaciones; la
  // consulta comparte la clave de la sección (un solo GET gracias a la deduplicación).
  const portions = useQuery({
    queryKey: ['admin', 'products', productId, 'portions'],
    queryFn: () => getProductPortions(productId),
    retry: false,
    enabled: product?.category === 'chicken',
  });

  // Los campos arrancan del producto cargado; cada edición local va aparte y, al
  // confirmar el servidor, el `saved` nuevo vuelve a ser base (errores conservan lo escrito).
  const [nameEdit, setNameEdit] = useState<string>();
  const [categoryEdit, setCategoryEdit] = useState<string>();
  const [priceEdit, setPriceEdit] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const sending = useRef(false);

  const update = useMutation({
    mutationFn: (input: { name: string; category: string; priceCents: number }) =>
      updateProduct(productId, input),
    onSuccess: (updated) => {
      setSaved({ product: updated, listedAtSave: listed });
      setNameEdit(undefined);
      setCategoryEdit(undefined);
      setPriceEdit(undefined);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
    },
    onSettled: () => {
      sending.current = false;
    },
  });

  const onSaved = (updated: Product) => {
    // El PATCH de estado (Desactivar/Activar) comparte el overlay con el de datos.
    setSaved({ product: updated, listedAtSave: listed });
  };

  if (products.isPending)
    return (
      <p role="status" className="p-6 text-center">
        Cargando...
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

  const header = (
    <div>
      <Link
        href="/admin/carta"
        className="inline-flex min-h-12 items-center text-accent underline underline-offset-4"
      >
        Volver a la carta
      </Link>
      <h1 className="text-3xl font-bold">Editar producto</h1>
      {product !== undefined && !product.isActive && (
        <p className="mt-1 font-semibold text-danger">Desactivado</p>
      )}
    </div>
  );

  if (!product)
    return (
      <>
        {header}
        <p role="alert" className="text-danger">
          Ese producto no existe.
        </p>
      </>
    );

  const name = nameEdit ?? product.name;
  const category = categoryEdit ?? product.category;
  const priceText = priceEdit ?? solesFieldValue(product.priceCents);

  const submit = () => {
    if (sending.current || update.isPending) return;
    const { values, errors } = validateProductFields(name, category, priceText);
    setFieldErrors(errors);
    if (!values) return;
    sending.current = true;
    update.mutate(values);
  };

  const hasPortions = product.category === 'chicken' && (portions.data?.length ?? 0) > 0;

  return (
    <>
      {header}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Datos</h2>
        <ProductFields
          idPrefix="editar-producto"
          name={name}
          category={category}
          priceText={priceText}
          errors={fieldErrors}
          referenceNote={hasPortions ? REFERENCE_PRICE_NOTE : undefined}
          disabled={update.isPending}
          onNameChange={setNameEdit}
          onCategoryChange={setCategoryEdit}
          onPriceChange={setPriceEdit}
        />
        {update.isError && (
          <p role="alert" className="text-danger wrap-anywhere">
            {apiErrorMessage(update.error)}
          </p>
        )}
        {update.isSuccess && <p role="status">Cambios guardados.</p>}
        <Button className="min-h-12 w-full text-lg" isDisabled={update.isPending} onPress={submit}>
          {update.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </section>

      {/* Las secciones especiales cuelgan de la categoría guardada, no de la elegida en el radio. */}
      {product.category === 'chicken' && <PortionsSection productId={productId} />}
      {product.category === 'combo' && (
        <ComboItemsSection productId={productId} products={products.data ?? []} combo={product} />
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Estado</h2>
        <ProductStateControl product={product} onSaved={onSaved} />
      </section>
    </>
  );
}

export default function Page() {
  const primary = usePrimaryInstance();
  const params = useParams<{ id: string }>();
  // `key` reinicia el formulario si la ruta cambia de producto sin desmontar.
  return (
    <RoleGuard area="/admin">
      {primary ? <EditProduct key={params.id} productId={Number(params.id)} /> : null}
    </RoleGuard>
  );
}
