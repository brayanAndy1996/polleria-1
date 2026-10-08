import { describe, expect, it } from 'vitest';
import {
  WEAK_PIN_MESSAGE,
  adminUserSchema,
  createUserRequestSchema,
  isWeakPin,
  pinSchema,
  resetPinRequestSchema,
  strongPinSchema,
  updateUserRequestSchema,
  usersResponseSchema,
} from '../../src/index.ts';

/**
 * Ataques a los esquemas de la spec 004 que las pruebas de AC no cubren: fronteras
 * numéricas de isWeakPin, entradas que no son texto, Unicode, claves de más
 * (asignación masiva) y `undefined` explícito en el PATCH.
 */
describe('004-adversarial: esquemas de usuarios y PIN fáciles', () => {
  const validCreate = {
    username: 'mozo.nuevo',
    displayName: 'Ana',
    pin: '3968',
    roles: ['waiter'],
  };

  it('ADV-004-01: isWeakPin en las fronteras de año, fecha y secuencia', () => {
    // Años límite: solo aplica a PIN de 4 dígitos dentro de 1900-2099.
    expect(isWeakPin('1899')).toBe(false);
    expect(isWeakPin('1900')).toBe(true);
    expect(isWeakPin('2099')).toBe(true);
    expect(isWeakPin('2100')).toBe(false);
    // De 5 dígitos nunca es año aunque lo parezca.
    expect(isWeakPin('19000')).toBe(false);
    expect(isWeakPin('19999')).toBe(false);
    // Fechas imposibles: día 00/32/99 y mes 00/13/25/32 no son fecha.
    for (const pin of ['3213', '9901', '1500', '1513', '0125', '3100', '0012', '3201'])
      expect.soft(isWeakPin(pin), pin).toBe(false);
    for (const pin of ['990199', '321299', '010000', '150085'])
      expect.soft(isWeakPin(pin), pin).toBe(false);
    // Fechas con día válido aunque el mes real no lo tenga (3102, 3002): la regla
    // mecánica de la spec las rechaza igual.
    for (const pin of ['3102', '300299', '311299', '290299'])
      expect.soft(isWeakPin(pin), pin).toBe(true);
    // Secuencias circulares en ambos sentidos, incluido el cruce 9->0 y 0->9.
    for (const pin of ['78901', '89012', '09876', '10987'])
      expect.soft(isWeakPin(pin), pin).toBe(true);
    // Corridas con paso distinto de +-1 no son débiles (lista exacta de la spec).
    for (const pin of ['13579', '97531', '02468', '1357', '8642'])
      expect.soft(isWeakPin(pin), pin).toBe(false);
    // '0001' no es repetido, corrida, año ni fecha: queda permitido.
    expect(isWeakPin('0001')).toBe(false);
    // La lista corta solo contiene '2580': ni el inverso ni con prefijo o sufijo.
    expect(isWeakPin('2580')).toBe(true);
    for (const pin of ['0852', '25800', '02580', '12580'])
      expect.soft(isWeakPin(pin), pin).toBe(false);
    // Formato MMDD (1225 = 25 de diciembre al estilo EE.UU.) no se evalúa: DDMM puro.
    expect(isWeakPin('1225')).toBe(false);
    expect(isWeakPin('2512')).toBe(true);
  });

  it('ADV-004-02: isWeakPin nunca lanza ante entradas que no son texto de 4-6 dígitos', () => {
    const hostile: unknown[] = [
      undefined,
      null,
      0,
      1234,
      2580,
      Number.NaN,
      true,
      ['1', '2', '3', '4'],
      { pin: '1234' },
      { length: 4, 0: '1', 1: '2', 2: '3', 3: '4' },
    ];
    for (const input of hostile)
      expect.soft(() => isWeakPin(input as string), String(input)).not.toThrow();
    for (const input of hostile) expect.soft(isWeakPin(input as string), String(input)).toBe(false);
    // Dígitos Unicode no engañan al patrón ASCII: isWeakPin devuelve false porque
    // pinSchema los rechaza antes por formato.
    expect(isWeakPin('\u0661\u0662\u0663\u0664')).toBe(false); // árabe-índico
    expect(isWeakPin('\uFF11\uFF12\uFF13\uFF14')).toBe(false); // ancho completo
    expect(isWeakPin('24\u06F68')).toBe(false); // mezcla persa/ascii
    // Longitudes fuera de 4-6: no se evalúan como débiles (el formato va primero).
    for (const pin of ['', '0', '000', '0000000', '1234567', '555555555'])
      expect.soft(isWeakPin(pin), pin).toBe(false);
    // Terminadores de línea y NUL tampoco pasan el patrón.
    for (const pin of ['2468\n', '2468\r', '2468 ', '2468'])
      expect.soft(isWeakPin(pin), pin).toBe(false);
  });

  it('ADV-004-03: strongPinSchema deja intacto pinSchema y da el mensaje exacto', () => {
    // Un PIN débil creado antes de la 004 sigue sirviendo para iniciar sesión.
    for (const pin of ['1234', '0000', '2512', '2580'])
      expect.soft(pinSchema.safeParse(pin).success, pin).toBe(true);
    const weak = strongPinSchema.safeParse('1234');
    expect(weak.success).toBe(false);
    if (!weak.success)
      expect(weak.error.issues.map((issue) => issue.message)).toContain(WEAK_PIN_MESSAGE);
    // Los problemas de formato conservan el mensaje de pinSchema, no el de PIN débil.
    const format = strongPinSchema.safeParse('12a4');
    expect(format.success).toBe(false);
    if (!format.success)
      expect(format.error.issues.map((issue) => issue.message)).toEqual([
        'El PIN debe tener de 4 a 6 dígitos.',
      ]);
  });

  it('ADV-004-04: createUserRequestSchema rechaza asignación masiva, tipos y homoglifos', () => {
    // Campos que no existen en el contrato y no deben colarse (asignación masiva).
    const extras = [
      { isActive: false },
      { isActive: true },
      { id: 5 },
      { pinHash: '$2b$04$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { pin_hash: 'x' },
      { pin2: '3968' },
      { sessions: [] },
      { createdAt: '2026-10-08T15:00:00.000Z' },
      { role: 'admin' },
    ];
    for (const extra of extras)
      expect
        .soft(createUserRequestSchema.safeParse({ ...validCreate, ...extra }).success)
        .toBe(false);
    // __proto__ vía JSON real: objeto propio con clave desconocida.
    expect(
      createUserRequestSchema.safeParse(
        JSON.parse(
          '{"username":"mozo.nuevo","displayName":"Ana","pin":"3968","roles":["waiter"],"__proto__":{"admin":true}}',
        ),
      ).success,
    ).toBe(false);
    // Homoglifos y Unicode en username: el patrón es ASCII estricto.
    for (const username of ['\u0430dmin', 'admin\u200B', 'm\u00F6zo', 'mozo juan', '..mozo..']) {
      const parsed = createUserRequestSchema.safeParse({ ...validCreate, username });
      expect.soft(parsed.success, username).toBe(false);
    }
    // displayName con controles, bidi, NUL y HTML no pasa el patrón.
    for (const displayName of [
      'Ana\u202ELopez', // RLO
      'Ana\u202E', // RLO al final
      'Ana\u0000',
      'Ana\u200B',
      '<script>alert(1)</script>',
      '<b>Ana</b>',
      'Ana<b>',
      '  ',
      'Ana\tLopez', // tabulación dentro del nombre
    ])
      expect
        .soft(createUserRequestSchema.safeParse({ ...validCreate, displayName }).success)
        .toBe(false);
    // Apóstrofo, guion, tildes y letras árabes o chinas sí son displayName válido.
    for (const displayName of ["O'Brien", 'Ana-María', '\u0633\u0644\u0627\u0645', '\u674E\u96F7'])
      expect
        .soft(createUserRequestSchema.safeParse({ ...validCreate, displayName }).success)
        .toBe(true);
    // Tipos incorrectos en cada campo.
    const wrongTypes: unknown[] = [
      { ...validCreate, pin: 3968 },
      { ...validCreate, pin: { value: '3968' } },
      { ...validCreate, pin: ['3', '9', '6', '8'] },
      { ...validCreate, roles: 'waiter' },
      { ...validCreate, roles: [['waiter']] },
      { ...validCreate, roles: { 0: 'waiter', length: 1 } },
      { ...validCreate, roles: ['ADMIN'] },
      { ...validCreate, roles: ['waiter', 'waiter'] },
      { ...validCreate, roles: ['chef'] },
      { ...validCreate, username: 42 },
      { ...validCreate, displayName: null },
      { ...validCreate, displayName: 123 },
      [validCreate],
      'mozo.nuevo',
      null,
    ];
    for (const body of wrongTypes)
      expect.soft(createUserRequestSchema.safeParse(body).success).toBe(false);
    // El usuario literal 'admin' es válido por patrón (se documenta, no es fuga).
    const namedAdmin = createUserRequestSchema.safeParse({ ...validCreate, username: 'Admin' });
    expect(namedAdmin.success).toBe(true);
    if (namedAdmin.success) expect(namedAdmin.data.username).toBe('admin');
  });

  it('ADV-004-05: updateUserRequestSchema con undefined explícito y claves extra', () => {
    // Un PATCH cuyas únicas claves vienen con undefined es el mismo "sin cambios".
    for (const input of [
      { displayName: undefined },
      { roles: undefined },
      { isActive: undefined },
      { displayName: undefined, roles: undefined, isActive: undefined },
    ]) {
      const parsed = updateUserRequestSchema.safeParse(input);
      expect.soft(parsed.success).toBe(false);
      if (!parsed.success)
        expect(parsed.error.issues.map((issue) => issue.message)).toContain(
          'No indicaste ningún cambio.',
        );
    }
    // Mezcla de undefined y un cambio real sí pasa y solo aplica lo presente.
    const mixed = updateUserRequestSchema.safeParse({ displayName: undefined, isActive: false });
    expect(mixed.success).toBe(true);
    if (mixed.success) expect(mixed.data).toEqual({ isActive: false });
    // Clave extra aunque valga undefined: objeto estricto.
    expect(updateUserRequestSchema.safeParse({ isActive: false, extra: undefined }).success).toBe(
      false,
    );
    // __proto__ vía JSON real.
    expect(
      updateUserRequestSchema.safeParse(JSON.parse('{"isActive":false,"__proto__":{}}')).success,
    ).toBe(false);
    // Tipos que parecen booleanos o roles pero no lo son.
    for (const input of [
      { isActive: 'false' },
      { isActive: 0 },
      { isActive: 1 },
      { isActive: null },
      { isActive: {} },
      { roles: 'admin' },
      { roles: { 0: 'admin', length: 1 } },
      { roles: [['admin']] },
      { roles: ['admin', 'admin'] },
      { roles: [] },
      { displayName: 42 },
      { displayName: null },
      null,
      [],
      'x',
    ])
      expect.soft(updateUserRequestSchema.safeParse(input).success).toBe(false);
  });

  it('ADV-004-06: resetPinRequestSchema solo acepta un PIN fuerte en texto', () => {
    for (const body of [
      { pin: ' 2468' },
      { pin: '2468 ' },
      { pin: '2468\n' },
      { pin: '1234' },
      { pin: 5846 },
      { pin: '5846', pin2: '5846' },
      { pin: '2580' },
      { pin: '150385' },
      { pin: null },
      {},
      '5846',
    ])
      expect.soft(resetPinRequestSchema.safeParse(body).success).toBe(false);
    const ok = resetPinRequestSchema.safeParse({ pin: '5846' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data).toEqual({ pin: '5846' });
  });

  it('ADV-004-07: adminUserSchema ordena roles pero rechaza fugas y tipos', () => {
    // La API ordena los roles, pero el esquema tolera un orden distinto (lector tolerante).
    const unsorted = adminUserSchema.safeParse({
      id: 3,
      username: 'mozo.juan',
      displayName: 'Juan',
      roles: ['cashier', 'waiter'],
      isActive: true,
    });
    expect(unsorted.success).toBe(true);
    if (unsorted.success) expect(unsorted.data.roles).toEqual(['waiter', 'cashier']);
    // Una fuga del servidor (pinHash, sesiones, fechas) invalida el usuario entero.
    const base = {
      id: 3,
      username: 'mozo.juan',
      displayName: 'Juan',
      roles: ['waiter'],
      isActive: true,
    };
    for (const leak of [
      { pinHash: 'x' },
      { pin_hash: 'x' },
      { pin: '2468' },
      { sessions: [] },
      { createdAt: 'x' },
      { updatedAt: 'x' },
    ])
      expect.soft(adminUserSchema.safeParse({ ...base, ...leak }).success).toBe(false);
    // Identificadores y tipos hostiles.
    for (const user of [
      { ...base, id: '3' },
      { ...base, id: 1.5 },
      { ...base, id: 0 },
      { ...base, id: -1 },
      { ...base, id: null },
      { ...base, roles: ['chef'] },
      { ...base, roles: [] },
      { ...base, isActive: 'si' },
      { ...base, isActive: 1 },
    ])
      expect.soft(adminUserSchema.safeParse(user).success).toBe(false);
    // El username también normaliza en la lectura: 'Admin' entra como 'admin' (lector
    // tolerante — la API nunca lo devuelve en mayúsculas, pero el esquema lo acepta).
    const upper = adminUserSchema.safeParse({ ...base, username: 'Admin' });
    expect(upper.success).toBe(true);
    if (upper.success) expect(upper.data.username).toBe('admin');
  });

  it('ADV-004-08: usersResponseSchema exige la envoltura estricta', () => {
    const user = {
      id: 3,
      username: 'mozo.juan',
      displayName: 'Juan',
      roles: ['waiter'],
      isActive: true,
    };
    expect(usersResponseSchema.safeParse({ users: [] }).success).toBe(true);
    expect(usersResponseSchema.safeParse({ users: [user] }).success).toBe(true);
    // Una raíz que es el arreglo directo, una clave de más o un tipo distinto: rechazadas.
    for (const body of [[user], { users: [user], extra: 1 }, { users: 'x' }, { users: null }, {}])
      expect.soft(usersResponseSchema.safeParse(body).success).toBe(false);
  });
});
