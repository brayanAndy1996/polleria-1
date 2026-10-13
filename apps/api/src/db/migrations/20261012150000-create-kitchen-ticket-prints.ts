import type { QueryInterface } from 'sequelize';

/** Tablas nuevas vacías; las comandas históricas no reciben snapshot ni salida automática. */
export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      `
      CREATE TABLE kitchen_ticket_prints (
        ticket_id INTEGER PRIMARY KEY REFERENCES kitchen_tickets(id),
        snapshot_version SMALLINT NOT NULL CHECK (snapshot_version = 1),
        snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE kitchen_ticket_print_attempts (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER NOT NULL REFERENCES kitchen_ticket_prints(ticket_id),
        copy_number INTEGER NOT NULL CHECK (copy_number >= 0),
        status VARCHAR(16) NOT NULL CHECK (status IN ('queued','printing','succeeded','failed','uncertain')),
        requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
        requested_by_name VARCHAR(40) NOT NULL CHECK (length(requested_by_name) > 0),
        reason VARCHAR(200),
        idempotency_key VARCHAR(128),
        request_hash VARCHAR(64),
        response_body JSONB,
        documents JSONB,
        output_directory_hash VARCHAR(64),
        owner_host VARCHAR(255),
        owner_pid INTEGER CHECK (owner_pid > 0),
        owner_execution_id UUID,
        completed_pages INTEGER NOT NULL DEFAULT 0 CHECK (completed_pages >= 0),
        error_code VARCHAR(32) CHECK (error_code IN ('PRINTER_OUTPUT_FAILED','PRINTER_INVALID_DOCUMENT','PRINTER_EMPTY_DOCUMENT','PRINT_TIMEOUT','PRINT_OUTPUT_UNCERTAIN')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        UNIQUE (ticket_id, copy_number),
        CONSTRAINT kitchen_print_copy_fields CHECK (
          (copy_number = 0 AND reason IS NULL AND idempotency_key IS NULL AND request_hash IS NULL)
          OR (copy_number > 0 AND reason IS NOT NULL AND length(btrim(reason)) > 0
            AND idempotency_key IS NOT NULL AND length(idempotency_key) > 0
            AND request_hash IS NOT NULL AND request_hash ~ '^[0-9a-f]{64}$')
        ),
        CONSTRAINT kitchen_print_dates CHECK (
          (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
          OR (status = 'printing' AND started_at IS NOT NULL AND finished_at IS NULL)
          OR (status IN ('succeeded','failed') AND finished_at IS NOT NULL)
          OR status = 'uncertain'
        ),
        CONSTRAINT kitchen_print_owner CHECK (
          (started_at IS NULL AND owner_host IS NULL AND owner_pid IS NULL AND owner_execution_id IS NULL)
          OR (started_at IS NOT NULL AND owner_host IS NOT NULL AND length(owner_host) > 0
            AND owner_pid IS NOT NULL AND owner_execution_id IS NOT NULL)
        ),
        CONSTRAINT kitchen_print_documents CHECK (
          documents IS NULL OR (jsonb_typeof(documents) = 'array' AND jsonb_array_length(documents) > 0
            AND completed_pages <= jsonb_array_length(documents))
        ),
        CONSTRAINT kitchen_print_directory_hash CHECK (
          output_directory_hash IS NULL OR output_directory_hash ~ '^[0-9a-f]{64}$'
        )
      );
      CREATE INDEX kitchen_print_attempt_history ON kitchen_ticket_print_attempts (ticket_id, id DESC);
      CREATE INDEX kitchen_print_attempt_queue ON kitchen_ticket_print_attempts (id) WHERE status = 'queued';
      CREATE UNIQUE INDEX kitchen_print_attempt_key ON kitchen_ticket_print_attempts (idempotency_key) WHERE copy_number > 0;
      CREATE UNIQUE INDEX kitchen_print_attempt_active ON kitchen_ticket_print_attempts (ticket_id) WHERE finished_at IS NULL;
    `,
      { transaction },
    );
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.sequelize.transaction(async (transaction) => {
    await context.sequelize.query(
      'DROP TABLE kitchen_ticket_print_attempts; DROP TABLE kitchen_ticket_prints;',
      { transaction },
    );
  });
}
