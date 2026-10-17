'use client';

import { Button } from '@heroui/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { RoleGuard } from '../../../../components/auth/role-guard.tsx';
import { ProductFields } from '../../../../components/menu/product-fields.tsx';
import { apiErrorMessage } from '../../../../lib/api/error-message.ts';
import { createProduct } from '../../../../lib/api/products.ts';
import type { ProductFieldErrors } from '../../../../lib/menu-form.ts';
import { validateProductFields } from '../../../../lib/menu-form.ts';
import { usePrimaryInstance } from '../../../../lib/primary-instance.ts';

function NewProductForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  // La categoría arranca sin elegir: el grupo de radios no preselecciona (AC-08).
  const [category, setCategory] = useState('');
  const [priceText, setPriceText] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  // Un solo envío en vuelo: la marca síncrona bloquea el doble toque en el mismo tick.
  const sending = useRef(false);
  const create = useMutation({
    mutationFn: createProduct,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      // Pollo y combo casi siempre piden un segundo paso (presentaciones o
      // componentes): se aterriza en su edición; el resto vuelve a la lista (AC-08).
      router.replace(
        created.category === 'chicken' || created.category === 'combo'
          ? `/admin/carta/${created.id}`
          : '/admin/carta',
      );
    },
    onSettled: () => {
      sending.current = false;
    },
  });
  const submit = () => {
    if (sending.current || create.isPending) return;
    const { values, errors } = validateProductFields(name, category, priceText);
    setFieldErrors(errors);
    if (!values) return;
    sending.current = true;
    create.mutate(values);
  };
  return (
    <>
      <div>
        <Link
          href="/admin/carta"
          className="inline-flex min-h-12 items-center text-accent underline underline-offset-4"
        >
          Volver a la carta
        </Link>
        <h1 className="text-3xl font-bold">Agregar producto</h1>
      </div>
      <div className="space-y-5">
        <ProductFields
          idPrefix="producto"
          name={name}
          category={category}
          priceText={priceText}
          errors={fieldErrors}
          disabled={create.isPending}
          onNameChange={setName}
          onCategoryChange={setCategory}
          onPriceChange={setPriceText}
        />
        {create.isError && (
          <p role="alert" className="text-danger wrap-anywhere">
            {apiErrorMessage(create.error)}
          </p>
        )}
        <Button className="min-h-12 w-full text-lg" isDisabled={create.isPending} onPress={submit}>
          {create.isPending ? 'Creando...' : 'Crear producto'}
        </Button>
      </div>
    </>
  );
}

export default function Page() {
  const primary = usePrimaryInstance();
  return <RoleGuard area="/admin">{primary ? <NewProductForm /> : null}</RoleGuard>;
}
