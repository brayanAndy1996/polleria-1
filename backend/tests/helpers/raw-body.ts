import type { Test } from 'supertest';

/**
 * Envía los bytes tal cual. Si el Content-Type es JSON, superagent serializa un Buffer con
 * JSON.stringify ({"type":"Buffer","data":[...]}) y el cuerpo que llega a la API ya no es el que
 * la prueba armó (por ejemplo, un gzip válido dejaría de serlo). Este serializador lo evita.
 *
 * El tipo de superagent declara que el serializador devuelve texto, pero en tiempo de ejecución
 * acepta un Buffer: de ahí el doble cast.
 */
export function sendRawBody(test: Test, body: Buffer): Test {
  return test.serialize((data: Buffer) => data as unknown as string).send(body);
}
